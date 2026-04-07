"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Layers3, Sparkles, Upload, X } from "lucide-react";

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

const tabOrder: OutputTab[] = ["jira", "notion", "confluence"];

export default function Landing() {
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  const hasOutput = useMemo(() => {
    return Boolean(output.jira || output.notion || output.confluence);
  }, [output]);

  useEffect(() => {
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [items]);

  function resetOutput() {
    setOutput({ jira: "", notion: "", confluence: "" });
    setError("");
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

  async function handleGenerate() {
    if (!items.length) {
      setError("Upload one or more screenshots before generating.");
      return;
    }

    resetOutput();
    setLoading(true);
    setStatusText("Uploading screenshots...");

    try {
      const formData = new FormData();
      items.forEach((item) => {
        formData.append("files", item.file);
      });

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
        setStatusText("Done");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setStatusText("Failed");
    } finally {
      setLoading(false);
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
            console.log(trimmed);  
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
            continue;
          }

          if (event.type === "result") {
            setOutput({
              jira: event.jira || "",
              notion: event.notion || "",
              confluence: event.confluence || ""
            });
            setStatusText("Done");
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <section className="mx-auto flex max-w-7xl flex-col gap-12 px-6 py-10 md:px-10 lg:px-12">
        <header className="rounded-[32px] border border-zinc-200 bg-white p-8 shadow-sm md:p-12">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-600">
              <Sparkles className="h-4 w-4" />
              SnapSpec
            </div>

            <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
              From screenshot to production-ready specs.
            </h1>

            <p className="max-w-2xl text-base leading-7 text-zinc-600 md:text-lg">
              Upload one or many screenshots, arrange them in flow order, and generate cleaner Jira, Notion, and Confluence-ready output.
            </p>
          </div>
        </header>

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
                      <div className="text-sm font-medium text-zinc-900">
                        Step {index + 1}
                      </div>
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

            <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-zinc-500">
                {loading ? statusText : hasOutput ? "Generation complete." : "Ready when you are."}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
                    setItems([]);
                    resetOutput();
                    setStatusText("Ready");
                  }}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
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

          <div className="rounded-[28px] border border-zinc-200 p-6 shadow-sm md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-zinc-100 p-2">
                <Layers3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Generated output</h2>
                <p className="text-sm text-zinc-500">Review each format in tabs.</p>
              </div>
            </div>

            <div className="mb-5 flex gap-2 rounded-2xl bg-zinc-100 p-1">
              {tabOrder.map((tab) => {
                const isActive = tab === activeTab;
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
                    {tab}
                  </button>
                );
              })}
            </div>

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
    </main>
  );
}