import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";

type OutputTab = "jira" | "notion" | "confluence";

type JsonResult = {
  jira?: string;
  notion?: string;
  confluence?: string;
  error?: string;
};

const CLAUDE_API_URL = process.env.CLAUDE_API_URL || process.env.ANTHROPIC_API_URL || "";
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || process.env.CLOUD_AI_MODEL || "";
const STREAM_MODE = (process.env.CLOUD_AI_STREAM || "false").toLowerCase() === "true";

const redis = Redis.fromEnv();

const hourlyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: true,
  prefix: "snapspec:hourly"
});

const cooldownLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "45 s"),
  analytics: true,
  prefix: "snapspec:cooldown"
});

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

async function verifyTurnstile(token: string, ip?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    throw new Error("Missing TURNSTILE_SECRET_KEY");
  }

  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);

  if (ip && ip !== "unknown") {
    body.append("remoteip", ip);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as {
    success?: boolean;
  };

  return Boolean(data.success);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const formData = await req.formData();

    const turnstileToken = formData.get("turnstileToken");
    if (!turnstileToken || typeof turnstileToken !== "string") {
      return jsonError("Missing human verification token.", 400);
    }

    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);

    if (!files.length) {
      return jsonError("No files uploaded.", 400);
    }

    if (files.length > 5) {
      return jsonError("You can upload up to 5 screenshots.", 400);
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const maxBytes = 10 * 1024 * 1024;

    if (totalBytes > maxBytes) {
      return jsonError("Total upload size must be under 10 MB.", 400);
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        return jsonError("Only image uploads are supported.", 400);
      }

      if (file.size === 0) {
        return jsonError("One of the uploaded files is empty.", 400);
      }
    }

    const isHuman = await verifyTurnstile(turnstileToken, ip);
    if (!isHuman) {
      return jsonError("Human verification failed.", 403);
    }

    const cooldownResult = await cooldownLimiter.limit(`generate:cooldown:${ip}`);
    if (!cooldownResult.success) {
      return NextResponse.json(
        { error: "Please wait a bit before generating again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil((cooldownResult.reset - Date.now()) / 1000))
            )
          }
        }
      );
    }

    const hourlyResult = await hourlyLimiter.limit(`generate:hourly:${ip}`);
    if (!hourlyResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil((hourlyResult.reset - Date.now()) / 1000))
            )
          }
        }
      );
    }

    const context = ((formData.get("context") as string | null) || "").trim().slice(0, 1000);

    const prompt = buildPrompt(files.length, context);

    type ImagePart = {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

    const imageParts = (await Promise.all(files.map(fileToImagePart))) as ImagePart[];

    if (!CLAUDE_API_URL || !CLAUDE_API_KEY || !CLAUDE_MODEL) {
      return NextResponse.json(
        {
          error:
            "Missing Claude/Cloud AI environment variables. Set CLAUDE_API_URL (or ANTHROPIC_API_URL), ANTHROPIC_API_KEY, and CLAUDE_MODEL."
        },
        { status: 500 }
      );
    }

    if (STREAM_MODE) {
      return streamClaudeResponse({ prompt, imageParts });
    }

    const result = await fetchClaudeJson({ prompt, imageParts });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readPromptTemplate(filename = "ui-spec.txt") {
  const promptPath = path.join(process.cwd(), "prompts", filename);
  return fs.readFileSync(promptPath, "utf-8").trim();
}

function buildPrompt(fileCount: number, context?: string) {
  const customPrompt = readPromptTemplate("ui-spec.txt");

  const parts = [
    `You are SnapSpec, an expert product requirements generator.`,
    `The user uploaded ${fileCount} screenshot(s). Treat the uploaded files as an ordered sequence.`,
    `Preserve the order exactly as uploaded because it may represent a user flow or multi-step experience.`,
    `Analyze the UI, flows, visible components, form states, navigation, and any intent implied by the sequence.`,
    `Return ONLY valid JSON with these exact keys: jira, notion, confluence.`,
    `Each value must be a string.`
  ];

  if (context) {
    parts.push(
      `USER-PROVIDED CONTEXT:\n"""\n${context}\n"""\n\nUse this context to ground all generated output. Reflect the product name, user personas, business goals, and any domain details from this context in the Jira stories, Notion PRD, and Confluence spec. Do not contradict it.`
    );
  }

  parts.push(customPrompt, `Do not wrap JSON in markdown fences.`);

  return parts.join("\n\n");
}

async function fileToImagePart(file: File) {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: file.type || "image/png",
      data: base64
    }
  };
}

async function fetchClaudeJson({
  prompt,
  imageParts
}: {
  prompt: string;
  imageParts: Array<{
    type: "image";
    source: { type: "base64"; media_type: string; data: string };
  }>;
}): Promise<JsonResult> {
  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            ...imageParts,
            {
              type: "text",
              text: prompt
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Claude/Cloud AI request failed.");
  }

  const data = await response.json();
  const text = extractClaudeText(data);

  if (!text) {
    throw new Error("No text content returned from Claude/Cloud AI.");
  }

  return safeParseOutput(text);
}

function streamClaudeResponse({
  prompt,
  imageParts
}: {
  prompt: string;
  imageParts: Array<{
    type: "image";
    source: { type: "base64"; media_type: string; data: string };
  }>;
}) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        send({ type: "status", message: "Uploading screenshots..." });
        send({ type: "status", message: "Analyzing UI flow..." });

        const response = await fetch(CLAUDE_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 8000,
            messages: [
              {
                role: "user",
                content: [
                  ...imageParts,
                  {
                    type: "text",
                    text: prompt
                  }
                ]
              }
            ]
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Claude/Cloud AI request failed.");
        }

        const data = await response.json();
        const text = extractClaudeText(data);

        if (!text) {
          throw new Error("No text content returned from Claude/Cloud AI.");
        }

        const parsed = safeParseOutput(text);

        send({ type: "status", message: "Formatting Jira output..." });
        send({ type: "chunk", tab: "jira", content: parsed.jira || "" });
        send({ type: "status", message: "Formatting Notion output..." });
        send({ type: "chunk", tab: "notion", content: parsed.notion || "" });
        send({ type: "status", message: "Formatting Confluence output..." });
        send({ type: "chunk", tab: "confluence", content: parsed.confluence || "" });
        send({
          type: "result",
          jira: parsed.jira || "",
          notion: parsed.notion || "",
          confluence: parsed.confluence || ""
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error.";
        send({ type: "status", message: "Failed" });
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

function extractClaudeText(data: any) {
  if (!data) return "";

  if (typeof data.completion === "string") {
    return data.completion;
  }

  if (Array.isArray(data.content)) {
    return data.content
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        return "";
      })
      .join("\n")
      .trim();
  }

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  return "";
}

function safeParseOutput(raw: string): JsonResult {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const normalize = (parsed: any): JsonResult => ({
    jira: typeof parsed?.jira === "string" ? parsed.jira : "",
    notion: typeof parsed?.notion === "string" ? parsed.notion : "",
    confluence: typeof parsed?.confluence === "string" ? parsed.confluence : ""
  });

  try {
    return normalize(JSON.parse(cleaned));
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return normalize(JSON.parse(candidate));
      } catch {
        // continue
      }
    }

    return {
      jira: cleaned || "No Jira output generated.",
      notion: "",
      confluence: ""
    };
  }
}