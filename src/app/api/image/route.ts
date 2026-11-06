import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const IMAGE_CREDIT_COST = 5;

export async function POST(request: Request) {
  const supabase = await createClient();

  let userId: string | null = null;
  let referenceId: string | null = null;
  let creditsDeducted = false;

  // Refund helper
  async function refundCredits() {
    if (!creditsDeducted || !referenceId) return;

    const { data, error } = await supabase.rpc("refund_credits", {
      p_reference_id: referenceId,
      p_description: "Image generation failed - automatic refund",
    });

    if (error || !data?.success) {
      console.error("CREDIT REFUND ERROR:", error || data);
    } else {
      console.log("Image credits refunded:", data);
    }

    creditsDeducted = false;
  }

  try {
    // 1. Verify login
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Please log in to generate images." },
        { status: 401 }
      );
    }

    userId = user.id;

    // 2. Validate prompt
    const body = await request.json();

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    if (!prompt) {
      return NextResponse.json(
        { error: "Please enter an image prompt." },
        { status: 400 }
      );
    }

    if (prompt.length > 2048) {
      return NextResponse.json(
        { error: "Prompt must be 2048 characters or less." },
        { status: 400 }
      );
    }

    // 3. Check Cloudflare credentials
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: "Cloudflare configuration is missing." },
        { status: 500 }
      );
    }

    // 4. Deduct 5 credits
    referenceId = crypto.randomUUID();

    const { data: spendData, error: spendError } =
      await supabase.rpc("spend_credits", {
        p_amount: IMAGE_CREDIT_COST,
        p_description: "AI Image Generation",
        p_reference_id: referenceId,
      });

    if (spendError) {
      console.error("CREDIT SPEND ERROR:", spendError);

      return NextResponse.json(
        { error: "Could not verify your credits. Please try again." },
        { status: 500 }
      );
    }

    if (!spendData?.success) {
      return NextResponse.json(
        {
          error: "Insufficient credits. Please purchase more credits.",
          code: "INSUFFICIENT_CREDITS",
        },
        { status: 402 }
      );
    }

    creditsDeducted = true;

    // 5. Generate image with Cloudflare FLUX.1 Schnell
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          steps: 4,
        }),
        signal: AbortSignal.timeout(120000),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success || !result.result?.image) {
      console.error("Cloudflare image error:", result.errors);

      await refundCredits();

      return NextResponse.json(
        { error: "Image generation failed. Your credits have been refunded." },
        { status: 502 }
      );
    }

    // 6. Generation successful
    creditsDeducted = false;

    return NextResponse.json({
      success: true,
      image: `data:image/jpeg;base64,${result.result.image}`,
      creditsSpent: IMAGE_CREDIT_COST,
      remainingCredits: spendData.balance,
    });

  } catch (error) {
    console.error("Image API error:", error);

    await refundCredits();

    return NextResponse.json(
      {
        error: creditsDeducted
          ? "Image generation failed. Please check your credit balance."
          : "Something went wrong while generating the image.",
      },
      { status: 500 }
    );
  }
}