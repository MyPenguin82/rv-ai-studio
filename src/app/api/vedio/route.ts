import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SPACE_URL = "https://lightricks-ltx-2-5.hf.space";
const API_NAME = "v2/run";

// Vercel Hobby plan max = 300
export const maxDuration = 300;

// Total time budget for the whole request (must be below maxDuration)
const TOTAL_BUDGET_MS = 280_000;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const remainingMs = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

  try {
    // 1. Authentication
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Please log in first." },
        { status: 401 }
      );
    }

    // 2. Request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const prompt =
      typeof body.prompt === "string" ? body.prompt.trim() : "";

    const duration = Number(body.duration ?? 2);
    const width = Number(body.width ?? 512);
    const height = Number(body.height ?? 768);

    if (!prompt) {
      return NextResponse.json(
        { error: "Please enter a video prompt." },
        { status: 400 }
      );
    }

    if (prompt.length > 2000) {
      return NextResponse.json(
        { error: "Prompt is too long." },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(duration) ||
      duration < 1 ||
      duration > 5 ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 512 ||
      width > 1536 ||
      height < 512 ||
      height > 1536 ||
      width % 64 !== 0 ||
      height % 64 !== 0
    ) {
      return NextResponse.json(
        { error: "Invalid video settings." },
        { status: 400 }
      );
    }

    // 3. Hugging Face configuration
    const hfToken = process.env.HF_TOKEN;

    if (!hfToken) {
      return NextResponse.json(
        { error: "HF_TOKEN is missing from environment variables." },
        { status: 500 }
      );
    }

    // 4. Start generation
    const startResponse = await fetch(
      `${SPACE_URL}/gradio_api/call/${API_NAME}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hfToken}`,
        },
        body: JSON.stringify({
          data: [
            prompt,
            null, // image_path
            height,
            width,
            duration,
            Math.floor(Math.random() * 2147483647), // seed
            "conv", // decoder
            false, // auto_len
            true, // randomize_seed
            false, // do_enhance
          ],
        }),
        signal: AbortSignal.timeout(Math.max(remainingMs(), 1000)),
      }
    );

    const startText = await startResponse.text();

    if (!startResponse.ok) {
      console.error("HF START ERROR:", startText.slice(0, 500));

      return NextResponse.json(
        {
          error: `Hugging Face error ${startResponse.status}: ${startText.slice(0, 300)}`,
        },
        { status: 502 }
      );
    }

    let startData: { event_id?: string };

    try {
      startData = JSON.parse(startText);
    } catch {
      console.error("HF NON-JSON RESPONSE:", startText.slice(0, 500));

      return NextResponse.json(
        {
          error:
            "Hugging Face returned HTML or invalid JSON. Check Space access.",
        },
        { status: 502 }
      );
    }

    const eventId = startData.event_id;

    if (!eventId) {
      return NextResponse.json(
        { error: "Hugging Face did not return an event ID." },
        { status: 502 }
      );
    }

    // 5. Wait for generation result (same API_NAME as start)
    const resultResponse = await fetch(
      `${SPACE_URL}/gradio_api/call/${API_NAME}/${encodeURIComponent(eventId)}`,
      {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${hfToken}`,
        },
        signal: AbortSignal.timeout(Math.max(remainingMs(), 1000)),
      }
    );

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      console.error("HF RESULT ERROR:", errorText.slice(0, 500));

      return NextResponse.json(
        { error: "Could not retrieve generated video." },
        { status: 502 }
      );
    }

    const streamText = await resultResponse.text();

    let outputData: unknown = null;
    let generationError = "";

    const events = streamText.split(/\r?\n\r?\n/);

    for (const event of events) {
      const lines = event.split(/\r?\n/);

      const eventName = lines
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();

      const dataLine = lines.find((line) => line.startsWith("data:"));

      if (eventName === "error") {
        generationError =
          dataLine?.slice(5).trim() || "Hugging Face generation failed.";
        break;
      }

      if (eventName === "complete" && dataLine) {
        try {
          outputData = JSON.parse(dataLine.slice(5).trim());
        } catch {
          generationError = "Invalid generation result.";
          break;
        }
      }
    }

    if (generationError) {
      console.error("HF GENERATION ERROR:", generationError);

      return NextResponse.json({ error: generationError }, { status: 502 });
    }

    // 6. Extract video URL
    if (!Array.isArray(outputData) || !outputData[0]) {
      return NextResponse.json(
        { error: "No video was returned by Hugging Face." },
        { status: 502 }
      );
    }

    const first = outputData[0] as
      | string
      | { url?: string; path?: string; video?: { url?: string; path?: string } };

    const fileLocation =
      typeof first === "string"
        ? first
        : first.url || first.path || first.video?.url || first.video?.path;

    if (!fileLocation) {
      return NextResponse.json(
        { error: "Generated video URL was not found." },
        { status: 502 }
      );
    }

    const videoUrl = /^https?:\/\//i.test(fileLocation)
      ? fileLocation
      : fileLocation.startsWith("/")
        ? `${SPACE_URL}${fileLocation}`
        : `${SPACE_URL}/gradio_api/file=${fileLocation}`;

    // 7. Success
    return NextResponse.json({
      success: true,
      videoUrl,
      prompt,
    });
  } catch (error) {
    console.error("VIDEO API ERROR:", error);

    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    if (isTimeout) {
      return NextResponse.json(
        {
          error:
            "Video generation took too long. Please try a shorter duration or smaller size.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 }
    );
  }
}