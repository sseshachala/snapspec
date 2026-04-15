"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Turnstile }  from "@marsidev/react-turnstile";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Layers3,
  LayoutTemplate,
  LoaderCircle,
  Mail,
  Sparkles,
  Upload,
  Users,
  X
} from "lucide-react";

type OutputTab = "jira" | "notion" | "confluence";

type UploadItem = {
  id: string;
  file: File;
  previewUrl: string;
};

type GenerateResponse = {
  jira?: string;
  notion?: string;
  confluence?: string;
  error?: string;
};

type EmailScreenshotPayload = {
  filename: string;
  contentType: string;
  content: string;
};

const tabOrder: OutputTab[] = ["jira", "notion", "confluence"];

const outputs = [
  {
    title: "Jira",
    description: "Actionable user stories with acceptance criteria, ready for engineering delivery.",
    sample: `Title:
Login with email

As a returning user
I want to sign in with my email and password
So that I can access my workspace

Acceptance Criteria:
- Given a registered user When valid credentials are submitted Then the user is signed in
- Given invalid credentials When sign in is attempted Then an error message is shown`
  },
  {
    title: "Notion",
    description: "Polished product requirements that PMs, designers, and stakeholders can align around.",
    sample: `Overview
The flow supports authenticated sign-in for returning users.

Goals
- Reduce friction at entry
- Make account access clear and fast

User flow
The user lands on sign in, enters credentials, submits, and is routed to the workspace.`
  },
  {
    title: "Confluence",
    description: "Structured functional specs with flows, requirements, and implementation clarity.",
    sample: `Summary
This feature enables returning users to access the platform through a standard sign-in flow.

Scope
- Email and password authentication
- Validation states
- Error handling

Acceptance criteria
- Successful sign in routes user to dashboard`
  }
];

const valueProps = [
  "Save hours on every spec",
  "Reduce ambiguity across teams",
  "Generate structured output instantly",
  "Email specs with screenshots in order"
];

const audience = [
  {
    icon: LayoutTemplate,
    title: "Product Managers",
    description: "Turn ideas, mocks, and UI flows into structured requirements without starting from zero."
  },
  {
    icon: Sparkles,
    title: "Designers",
    description: "Make sure design intent survives the handoff from screens to implementation."
  },
  {
    icon: Users,
    title: "Engineers",
    description: "Get clearer stories, better acceptance criteria, and less ambiguity before build starts."
  }
];

export default function UnifiedPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const generatorRef = useRef<HTMLElement | null>(null);

  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [activeTab, setActiveTab] = useState<OutputTab>("jira");
  const [output, setOutput] = useState<Record<OutputTab, string>>({
    jira: "",
    notion: "",
    confluence: ""
  });
  const [error, setError] = useState("");
  const [copiedTab, setCopiedTab] = useState<OutputTab | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Record<OutputTab, string | null>>({
    jira: null,
    notion: null,
    confluence: null
  });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [context, setContext] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);

  const hasOutput = useMemo(() => {
    return Boolean(output.jira || output.notion || output.confluence);
  }, [output]);

  useEffect(() => {
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [items]);

  function scrollToGenerator() {
    generatorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function formatTimestamp(date = new Date()) {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    const hh = String(date.getHours()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${mm}-${dd}-${yyyy}<${hh}:${ss}>`;
  }

  function countWords(value: string) {
    return value.trim() ? value.trim().split(/\s+/).length : 0;
  }

  function resetOutput() {
    setOutput({ jira: "", notion: "", confluence: "" });
    setError("");
    setCopiedTab(null);
    setGeneratedAt({ jira: null, notion: null, confluence: null });
    setEmailSent(false);
    setEmailError("");
    setShowEmailInput(false);
  }

  function resetTurnstile() {
    setTurnstileToken("");
    setTurnstileKey((prev) => prev + 1);
  }

  async function copyTabContent(tab: OutputTab) {
    const value = output[tab];
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedTab(tab);
      window.setTimeout(() => {
        setCopiedTab((current) => (current === tab ? null : current));
      }, 1500);
    } catch {
      setError("Unable to copy content.");
    }
  }

  function downloadTabContent(tab: OutputTab) {
    const value = output[tab];
    if (!value) return;

    const timestamp = generatedAt[tab] || formatTimestamp();
    const wordCount = countWords(value);

    const content = [
      `Tab: ${tab}`,
      `Timestamp: ${timestamp}`,
      `Word Count: ${wordCount}`,
      "",
      value
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `snapspec-${tab}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadAllOutputs() {
    const sections = tabOrder
      .map((tab) => {
        const value = output[tab] || "No content generated.";
        const timestamp = generatedAt[tab] || "Not generated";
        const wordCount = countWords(output[tab] || "");

        return [
          tab.toUpperCase(),
          `Timestamp: ${timestamp}`,
          `Word Count: ${wordCount}`,
          "",
          value
        ].join("\n");
      })
      .join("\n\n--------------------------------------------------\n\n");

    const blob = new Blob([sections], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "snapspec-all-outputs.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function createUploadItems(files: File[]) {
    return files
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file)
      }));
  }

  function addFiles(files: File[]) {
    const next = createUploadItems(files);

    if (!next.length) {
      setError("Please upload image files only.");
      return;
    }

    setItems((prev) => [...prev, ...next]);
    setError("");
    resetOutput();
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    addFiles(selected);
    event.target.value = "";
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const dropped = Array.from(event.dataTransfer.files || []);
    addFiles(dropped);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
    resetOutput();
  }

  function moveItem(index: number, direction: "up" | "down") {
    setItems((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    resetOutput();
  }

  async function resizeImageFile(file: File, maxPx = 1000): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const { naturalWidth: w, naturalHeight: h } = img;
        if (w <= maxPx && h <= maxPx) { resolve(file); return; }
        const scale = Math.min(maxPx / w, maxPx / h);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file),
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }

  async function optimizeImageForEmail(file: File, maxPx = 1400, quality = 0.72): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        const { naturalWidth: width, naturalHeight: height } = img;
        const scale = Math.min(1, maxPx / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);

        const baseName = file.name.replace(/\.[^.]+$/, "");
        canvas.toBlob(
          (blob) =>
            resolve(
              blob
                ? new File([blob], `${baseName || "screenshot"}.jpg`, { type: "image/jpeg" })
                : file
            ),
          "image/jpeg",
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      img.src = objectUrl;
    });
  }

  async function handleGenerate() {
    if (!items.length) {
      setError("Upload one or more screenshots before generating.");
      scrollToGenerator();
      return;
    }

    if (!turnstileToken) {
      setError("Please verify that you're human before generating.");
      scrollToGenerator();
      return;
    }

    resetOutput();
    setLoading(true);
    setStatusText("Uploading screenshots...");
    setActiveTab("jira");
    scrollToGenerator();

    try {
      const formData = new FormData();

      const resized = await Promise.all(items.map((item) => resizeImageFile(item.file)));
      resized.forEach((file) => formData.append("files", file));

      formData.append("turnstileToken", turnstileToken);

      if (context.trim()) {
        formData.append("context", context.trim());
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Generation failed.");
      }

      const contentType = response.headers.get("content-type") || "";

      if (response.body && !contentType.includes("application/json")) {
        await handleStreamResponse(response);
      } else {
        const data = (await response.json()) as GenerateResponse;
        if (data.error) throw new Error(data.error);

        setOutput({
          jira: data.jira || "",
          notion: data.notion || "",
          confluence: data.confluence || ""
        });

        const timestamp = formatTimestamp();
        setGeneratedAt({
          jira: data.jira ? timestamp : null,
          notion: data.notion ? timestamp : null,
          confluence: data.confluence ? timestamp : null
        });

        setStatusText("Done");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setStatusText("Failed");
    } finally {
      setLoading(false);
      resetTurnstile();
    }
  }

  async function handleStreamResponse(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Streaming is not available.");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed) as {
            type?: string;
            tab?: OutputTab;
            content?: string;
            jira?: string;
            notion?: string;
            confluence?: string;
            message?: string;
          };

          if (event.type === "status" && event.message) {
            setStatusText(event.message);
            continue;
          }

          if (event.type === "error" && event.message) {
            setError(event.message);
            continue;
          }

          if (event.type === "chunk" && event.tab && typeof event.content === "string") {
            setOutput((prev) => ({
              ...prev,
              [event.tab]: prev[event.tab] + event.content
            }));

            setGeneratedAt((prev) => ({
              ...prev,
              [event.tab]: prev[event.tab] || formatTimestamp()
            }));

            continue;
          }

          if (event.type === "result") {
            const timestamp = formatTimestamp();

            setOutput({
              jira: event.jira || "",
              notion: event.notion || "",
              confluence: event.confluence || ""
            });

            setGeneratedAt((prev) => ({
              jira: event.jira ? timestamp : prev.jira,
              notion: event.notion ? timestamp : prev.notion,
              confluence: event.confluence ? timestamp : prev.confluence
            }));

            setStatusText("Done");
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
  }

  async function handleEmailSend() {
    setEmailError("");
    setEmailSent(false);

    if (!emailInput.trim()) {
      setEmailError("Enter an email address.");
      return;
    }

    setEmailSending(true);

    try {
      const screenshots: EmailScreenshotPayload[] = await Promise.all(
        items.map(async (item) => {
          const optimizedFile = await optimizeImageForEmail(item.file);

          return {
            filename: optimizedFile.name,
            contentType: optimizedFile.type || "image/jpeg",
            content: await fileToBase64(optimizedFile)
          };
        })
      );

      const response = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput.trim(),
          jira: output.jira,
          notion: output.notion,
          confluence: output.confluence,
          screenshots
        })
      });

      const data = await response.json() as { error?: string };

      if (!response.ok || data.error) {
        setEmailError(data.error || "Failed to send. Please try again.");
      } else {
        setEmailSent(true);
      }
    } catch {
      setEmailError("Something went wrong. Please try again.");
    } finally {
      setEmailSending(false);
    }
  }

  async function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unable to read screenshot for email."));
          return;
        }

        const [, base64 = ""] = result.split(",", 2);
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Unable to read screenshot for email."));
      reader.readAsDataURL(file);
    });
  }

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <section className="mx-auto max-w-7xl px-6 py-8 md:px-10 lg:px-12">
        <div className="flex items-center justify-between rounded-full border border-zinc-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            SnapSpec
          </div>

          <div className="hidden items-center gap-6 text-sm text-zinc-600 md:flex">
            <a href="#how-it-works" className="hover:text-zinc-900">How it works</a>
            <a href="#outputs" className="hover:text-zinc-900">Outputs</a>
            <a href="#why-snapspec" className="hover:text-zinc-900">SnapSpec vs AI</a>
            <a href="#generator" className="hover:text-zinc-900">Generator</a>
          </div>

          <button
            onClick={scrollToGenerator}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Generate Specs
          </button>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 pb-10 pt-10 md:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pt-16">
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-600 shadow-sm">
            <Sparkles className="h-4 w-4" />
            AI-powered product specs
          </div>

          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-zinc-950 md:text-7xl">
            From screenshots to production-ready specs — instantly.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 md:text-xl">
            Turn UI screens into structured Jira tickets, Notion docs, and Confluence-ready specs — without writing a single line.
          </p>

          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-500">
            Upload one or multiple screenshots, add optional context, and turn the flow into implementation-ready output you can export, copy, or email with the original screens in order.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={scrollToGenerator}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Generate Specs
              <ArrowRight className="h-4 w-4" />
            </button>

            <a
              href="#outputs"
              className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              See Example
            </a>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {valueProps.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-zinc-900" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-zinc-200 bg-zinc-50 p-4 shadow-sm md:p-6">
          <div className="rounded-[28px] border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-900">Flow input</div>
                <div className="text-sm text-zinc-500">Ordered screenshots</div>
              </div>
              <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                3 screens
              </div>
            </div>

            <div className="space-y-3">
              {["Landing screen", "Sign in screen", "Dashboard state"].map((screen, index) => (
                <div key={screen} className="flex items-center gap-4 rounded-2xl border border-zinc-200 p-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-zinc-100 text-xs text-zinc-500">
                    UI
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-900">Step {index + 1}</div>
                    <div className="truncate text-sm text-zinc-500">{screen}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-900">
              <Layers3 className="h-4 w-4" />
              Generated output preview
            </div>

            <div className="mb-4 flex gap-2 rounded-2xl bg-zinc-100 p-1 text-sm">
              <div className="rounded-xl bg-white px-4 py-2 font-medium text-zinc-900 shadow-sm">Jira</div>
              <div className="rounded-xl px-4 py-2 text-zinc-500">Notion</div>
              <div className="rounded-xl px-4 py-2 text-zinc-500">Confluence</div>
            </div>

            <div className="rounded-2xl bg-zinc-50 p-4">
              <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                {outputs[0].sample}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50/60">
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 lg:px-12">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">The problem</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Specs need more than screenshots alone.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-600 md:text-lg">
              Screenshots in Slack, vague tickets, and missing business context force teams into hours of follow-up. SnapSpec lets you pair ordered UI screens with optional context so the output is more precise, customizable, and useful from the first pass.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              "Screenshots with no context",
              "Business goals lost between teams",
              "Back-and-forth to clarify requirements",
              "Vague specs that slow delivery"
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm leading-7 text-zinc-600 shadow-sm"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-20 md:px-10 lg:px-12">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">How it works</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
            Turn visuals into structured execution.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-600 md:text-lg">
            Upload your UI, add optional product context, and generate documentation that is more tailored to your workflow, users, and business goals.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Upload",
              body: "Drop one or multiple screenshots and arrange them to reflect the intended user journey."
            },
            {
              step: "02",
              title: "Add context",
              body: "Optionally describe the product, user, business goal, or domain so the generated specs are more precise and customizable."
            },
            {
              step: "03",
              title: "Generate",
              body: "SnapSpec combines screens plus context to generate structured Jira, Notion, and Confluence output in one consistent flow."
            }
          ].map((item) => (
            <div key={item.step} className="rounded-[28px] border border-zinc-200 p-8 shadow-sm">
              <div className="text-sm font-medium text-zinc-500">{item.step}</div>
              <h3 className="mt-5 text-2xl font-semibold text-zinc-900">{item.title}</h3>
              <p className="mt-4 text-base leading-7 text-zinc-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="outputs" className="mx-auto max-w-7xl px-6 py-20 md:px-10 lg:px-12">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Outputs</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
            One input. Multiple outputs.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-600 md:text-lg">
            Generate consistent artifacts for product, design, and engineering without rewriting the same spec three times.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {outputs.map((output) => (
            <div key={output.title} className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-zinc-100 p-2">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-semibold">{output.title}</h3>
              </div>

              <p className="mb-5 text-sm leading-7 text-zinc-600">{output.description}</p>

              <div className="rounded-2xl bg-zinc-50 p-4">
                <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                  {output.sample}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        id="why-snapspec"
        className="border-y border-zinc-200 bg-gradient-to-b from-white to-zinc-50/40"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 lg:px-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
              Why SnapSpec
            </p>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Why not just use ChatGPT or Claude?
            </h2>

            <p className="mt-6 text-base leading-8 text-zinc-600 md:text-lg">
              You can. But general-purpose AI still leaves the manual work to you.
            </p>

            <p className="mt-4 text-base leading-8 text-zinc-600 md:text-lg">
              Organizing screenshots. Explaining flow. Rewriting prompts. Cleaning
              up output. Reformatting the same spec for different tools.
            </p>

            <p className="mt-4 text-base leading-8 text-zinc-600 md:text-lg">
              SnapSpec removes that friction. It turns ordered UI screenshots into
              structured Jira, Notion, and Confluence output your team can
              actually use, then makes it easy to share that output with the
              supporting screenshots intact.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <div className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm md:p-8">
              <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                General-purpose AI
              </div>

              <h3 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900">
                Powerful, but still manual
              </h3>

              <p className="mt-4 text-sm leading-7 text-zinc-600 md:text-base">
                Great at generating text. Less reliable when the job is turning UI
                screenshots into structured, reusable deliverables.
              </p>

              <ul className="mt-8 space-y-4 text-sm leading-7 text-zinc-600 md:text-base">
                <li>Manual screenshot handling</li>
                <li>Prompt rewriting to get usable structure</li>
                <li>Inconsistent output across runs</li>
                <li>Separate formatting for each tool</li>
                <li>More cleanup before handoff</li>
              </ul>
            </div>

            <div className="rounded-[28px] border border-zinc-900 bg-zinc-900 p-6 text-white shadow-sm md:p-8">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-300">
                SnapSpec
              </div>

              <h3 className="mt-6 text-2xl font-semibold tracking-tight">
                Built for turning UI into execution
              </h3>

              <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">
                SnapSpec wraps AI in a purpose-built workflow so teams get
                consistent, execution-ready output instead of one-off responses.
              </p>

              <ul className="mt-8 space-y-4 text-sm leading-7 text-zinc-300 md:text-base">
                <li>Ordered screenshots preserve flow</li>
                <li>Optional context improves precision</li>
                <li>Purpose-built prompting for UI specs</li>
                <li>Structured output across formats</li>
                <li>Email sharing with screenshots in order</li>
                <li>Less rewriting and less cleanup</li>
              </ul>
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-3xl text-center">
            <p className="text-lg font-semibold tracking-tight text-zinc-900 md:text-2xl">
              From screenshots to deliverables — without the prompt gymnastics.
            </p>
          </div>
        </div>
      </section>

      <section id="who-its-for" className="border-y border-zinc-200 bg-zinc-50/60">
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 lg:px-12">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Who it’s for</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Built for product, design, and engineering.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-600 md:text-lg">
              SnapSpec helps teams move from intent to execution with less ambiguity and faster alignment.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {audience.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-[28px] border border-zinc-200 bg-white p-7 shadow-sm">
                  <div className="mb-5 inline-flex rounded-2xl bg-zinc-100 p-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-semibold text-zinc-900">{item.title}</h3>
                  <p className="mt-4 text-base leading-7 text-zinc-600">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="generator"
        ref={generatorRef}
        className="mx-auto max-w-7xl px-6 py-20 md:px-10 lg:px-12"
      >
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Generator</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
            Upload your flow and generate specs.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-600 md:text-lg">
            Add one or more screenshots, order them to match the journey, then generate Jira, Notion, and Confluence output in one pass.
          </p>
        </div>

        <section className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-[28px] border border-zinc-200 p-6 shadow-sm md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-zinc-100 p-2">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Upload screenshots</h2>
                <p className="text-sm text-zinc-500">Add multiple images and order them before generation.</p>
              </div>
            </div>

            <div
              onDragEnter={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragActive(false);
              }}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={[
                "group flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed px-6 text-center transition",
                dragActive
                  ? "border-zinc-900 bg-zinc-50"
                  : "border-zinc-300 bg-zinc-50/60 hover:border-zinc-500 hover:bg-zinc-50"
              ].join(" ")}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={onInputChange}
                className="hidden"
              />

              <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
                <Upload className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-medium">Drop screenshots here</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Upload wireframes, mocks, or product screens. Add multiple files to describe a full flow.
              </p>
              <div className="mt-5 rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700">
                Browse files
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {items.length > 0 ? (
                items.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-3"
                  >
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-zinc-900">Step {index + 1}</div>
                      <div className="truncate text-sm text-zinc-500">{item.file.name}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveItem(index, "up")}
                        disabled={index === 0}
                        className="rounded-lg border border-zinc-200 p-2 text-zinc-600 disabled:opacity-40"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(index, "down")}
                        disabled={index === items.length - 1}
                        className="rounded-lg border border-zinc-200 p-2 text-zinc-600 disabled:opacity-40"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="rounded-lg border border-zinc-200 p-2 text-zinc-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
                  No screenshots added yet.
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-900">Add context <span className="font-normal text-zinc-400">(optional)</span></div>
                <div className={`text-xs ${context.length > 900 ? "text-amber-600" : "text-zinc-400"}`}>
                  {context.length}/1000
                </div>
              </div>
              <p className="mb-3 text-xs leading-5 text-zinc-500">
                Best results usually need 1-3 short sentences about the product, user, or goal.
              </p>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value.slice(0, 1000))}
                placeholder="e.g. This is a checkout flow for a B2B SaaS app. Users are procurement managers. The goal is to reduce drop-off at the payment step."
                rows={3}
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-800 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-0"
              />
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
              <div className="mb-3 text-sm font-medium text-zinc-900">
                Human verification
              </div>
              <p className="mb-4 text-sm leading-6 text-zinc-500">
                This helps keep SnapSpec fast and abuse-free.
              </p>

              <Turnstile
                key={turnstileKey}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
                onSuccess={(token) => {
                  setTurnstileToken(token);
                  setError("");
                }}
                onExpire={() => {
                  setTurnstileToken("");
                }}
                onError={() => {
                  setTurnstileToken("");
                  setError("Human verification failed. Please try again.");
                }}
                options={{
                  theme: "light",
                  size: "normal"
                }}
              />
            </div>

            <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-zinc-500">
                {loading
                  ? statusText
                  : hasOutput
                    ? "Generation complete."
                    : turnstileToken
                      ? "Verified and ready."
                      : "Complete human verification to generate."}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
                    setItems([]);
                    resetOutput();
                    setStatusText("Ready");
                    setContext("");
                    resetTurnstile();
                  }}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading || !turnstileToken}
                  className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Generating..." : "Generate specs"}
                </button>
              </div>
            </div>

            {loading && (
              <div className="mt-5 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-2 w-full animate-pulse bg-zinc-900" />
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-zinc-200 p-6 shadow-sm md:p-8 lg:sticky lg:top-6 lg:self-start">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-zinc-100 p-2">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Generated output</h2>
                  <p className="text-sm text-zinc-500">Review each format in tabs.</p>
                </div>
              </div>

              {hasOutput && (
                <button
                  type="button"
                  onClick={downloadAllOutputs}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
                >
                  <Download className="h-4 w-4" />
                  Export all
                </button>
              )}
            </div>

            <div className="mb-3 flex gap-2 rounded-2xl bg-zinc-100 p-1">
              {tabOrder.map((tab) => {
                const isActive = tab === activeTab;
                const hasContent = Boolean(output[tab]);

                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={[
                      "flex-1 rounded-xl px-4 py-2 text-sm font-medium capitalize transition",
                      isActive ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                    ].join(" ")}
                  >
                    <span>{tab}</span>
                    {loading && isActive ? (
                      <LoaderCircle className="ml-2 inline h-3.5 w-3.5 animate-spin" />
                    ) : hasContent ? (
                      <span className="ml-2 inline-block h-2 w-2 rounded-full bg-zinc-900 align-middle" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-zinc-600">
                {loading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span>{statusText}</span>
                  </>
                ) : hasOutput ? (
                  <span>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} output ready</span>
                ) : (
                  <span>Generate output to enable actions.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyTabContent(activeTab)}
                  disabled={!output[activeTab]}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                  {copiedTab === activeTab ? "Copied" : "Copy"}
                </button>

                <button
                  type="button"
                  onClick={() => downloadTabContent(activeTab)}
                  disabled={!output[activeTab]}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowEmailInput((prev) => !prev);
                    setEmailSent(false);
                    setEmailError("");
                  }}
                  disabled={!hasOutput}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                    showEmailInput
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
                  ].join(" ")}
                >
                  <Mail className="h-4 w-4" />
                  Email
                </button>
              </div>
            </div>

            {showEmailInput && (
              <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setEmailSent(false);
                      setEmailError("");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleEmailSend(); }}
                    placeholder="you@company.com"
                    className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={handleEmailSend}
                    disabled={emailSending || !emailInput.trim()}
                    className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {emailSending ? "Sending..." : emailSent ? "Sent" : "Send"}
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  The email includes Jira, Notion, Confluence, plus the uploaded screenshots inline and attached in flow order.
                </p>
                {emailSent && <p className="text-xs text-emerald-600">Sent! Check your inbox.</p>}
                {emailError && <p className="text-xs text-red-600">{emailError}</p>}
              </div>
            )}

            {hasOutput && (
              <div className="mb-5 flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
                <span>Word count: {countWords(output[activeTab])}</span>
                <span>Timestamp: {generatedAt[activeTab] || "Not generated"}</span>
              </div>
            )}

            <div className="min-h-[420px] rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
              {hasOutput ? (
                <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                  {output[activeTab] || "No content yet for this tab."}
                </pre>
              ) : (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                  <div className="mb-4 rounded-2xl bg-white p-3 shadow-sm">
                    <FileText className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-medium">Output appears here</h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                    Generate once and switch between Jira, Notion, and Confluence output.
                  </p>
                </div>
              )}
            </div>

          </div>
        </section>
      </section>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8 text-center text-sm text-zinc-500 md:px-10 lg:px-12">
          Envisioned, designed and developed with 💕 from Houston
        </div>
      </footer>
    </main>
  );
}
