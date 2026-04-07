import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";



type OutputTab = "jira" | "notion" | "confluence" ;

type JsonResult = {
  jira?: string;
  notion?: string;
  confluence?: string;
  error?: string;
};

const CLAUDE_API_URL = process.env.CLAUDE_API_URL || process.env.ANTHROPIC_API_URL || "";
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || process.env.CLOUD_AI_MODEL || "";
const STREAM_MODE = (process.env.CLOUD_AI_STREAM || "false").toLowerCase() === "true";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    const prompt = buildPrompt(files.length);
    const imageParts = await Promise.all(files.map(fileToImagePart));

    if (!CLAUDE_API_URL || !CLAUDE_API_KEY || !CLAUDE_MODEL) {
      return NextResponse.json(
        {
          error:
            "Missing Claude/Cloud AI environment variables. Set CLAUDE_API_URL (or CLOUD_AI_URL), CLAUDE_API_KEY, and CLAUDE_MODEL."
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



function buildPrompt(fileCount: number) {
  const customPrompt = "";
  //readPromptTemplate("ui-spec.txt");

  return [
    `You are SnapSpec, an expert product requirements generator.`,
    `The user uploaded ${fileCount} screenshot(s). Treat the uploaded files as an ordered sequence.`,
    `Preserve the order exactly as uploaded because it may represent a user flow or multi-step experience.`,
    `Analyze the UI, flows, visible components, form states, navigation, and any intent implied by the sequence.`,
    `Return ONLY valid JSON with these exact keys: jira, notion, confluence.`,
    `Each value must be a string.`,
    customPrompt,
    `Do not wrap JSON in markdown fences.`
  ].join("\n\n");
}

async function fileToImagePart(file: File) {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  return {
    type: "image",
    source: {
      type: "base64",
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
      max_tokens: 4000,
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
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 4000,
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

function safeParseOutput1(raw: string): JsonResult {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const tryParse = (text: string) => {
    const parsed = JSON.parse(text);
    return {
      jira: typeof parsed.jira === "string" ? parsed.jira : "",
      notion: typeof parsed.notion === "string" ? parsed.notion : "",
      confluence: typeof parsed.confluence === "string" ? parsed.confluence : ""
    };
  };

  try {
    return tryParse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return tryParse(jsonSlice);
      } catch {
        // continue to final fallback
      }
    }

    return {
      jira: cleaned || "No Jira output generated.",
      notion: "No Notion output generated.",
      confluence: "No Confluence output generated."
    };
  }
}