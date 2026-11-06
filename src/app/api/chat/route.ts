import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `
You are RV AI Studio, an AI assistant created for the RV AI Studio platform.

IDENTITY:
- Your name is RV AI Studio.
- Your founder is Abu Sufian Nur.
- If someone asks who you are, introduce yourself as RV AI Studio.
- If someone says "Hello", "Hi", or greets you, respond warmly.
- In your greeting, say: "Hello! I am RV AI Studio, an AI assistant founded by Abu Sufian Nur. How can I help you today?"
- If someone asks who founded RV AI Studio, answer: "RV AI Studio was founded by Abu Sufian Nur."

CRITICAL FORMATTING RULE (STRICT):
- DO NOT use bullet points with asterisks (*), dashes (-), or numbers for lists.
- NEVER output the asterisk character '*' anywhere in your response.
- Replace ALL bullet points, lists, and emphasis tags with relevant context-aware EMOJIS (e.g., 🏀, ⚽, 🚀, 💡, 🎨, ✦, 🔥, ⭐, 📌, 👉).
- Every single listed item MUST start with an appropriate emoji instead of '*' or '-'.

BEHAVIOR:
- Be helpful, friendly, and professional.
- Give clear and accurate answers.
- Reply in the same language the user uses.
- Do not claim that you personally created or trained the underlying AI model.
- Do not invent facts about RV AI Studio or its founder.
`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenRouter API key is missing." },
        { status: 500 }
      );
    }

    const body = await request.json();

    let messages: ChatMessage[] = [];

    if (typeof body.prompt === "string") {
      const prompt = body.prompt.trim();

      if (!prompt) {
        return NextResponse.json(
          { error: "Please enter a message." },
          { status: 400 }
        );
      }

      if (prompt.length > 20000) {
        return NextResponse.json(
          { error: "Message is too long." },
          { status: 400 }
        );
      }

      messages = [{ role: "user", content: prompt }];
    } else if (Array.isArray(body.messages)) {
      const validMessages = body.messages.filter(
        (message: unknown): message is ChatMessage => {
          if (!message || typeof message !== "object") return false;

          const item = message as Record<string, unknown>;

          return (
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string" &&
            item.content.trim().length > 0 &&
            item.content.length <= 20000
          );
        }
      );

      if (validMessages.length === 0) {
        return NextResponse.json(
          { error: "Please enter a message." },
          { status: 400 }
        );
      }

      messages = validMessages.slice(-20);
    } else {
      return NextResponse.json(
        { error: "Invalid chat messages." },
        { status: 400 }
      );
    }

    if (messages[messages.length - 1].role !== "user") {
      return NextResponse.json(
        { error: "The latest message must be from the user." },
        { status: 400 }
      );
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            ...messages.map((message) => ({
              role: message.role,
              content: message.content.trim(),
            })),
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);

      console.error("OpenRouter error:", errorData);

      return NextResponse.json(
        {
          error: errorData?.error?.message || "AI response failed.",
        },
        { status: response.status }
      );
    }

    if (!response.body) {
      return NextResponse.json(
        { error: "No response stream received." },
        { status: 502 }
      );
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("OpenRouter API error:", error);

    return NextResponse.json(
      { error: "AI response failed. Please try again." },
      { status: 500 }
    );
  }
}