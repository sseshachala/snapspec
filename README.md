
# 🚀 SnapSpec

**From screenshot to production-ready specs — instantly.**

SnapSpec transforms UI screenshots into structured, implementation-ready outputs for:

* 🧾 Jira (user stories + acceptance criteria)
* 🧠 Notion (product requirements)
* 📘 Confluence (technical specs)

Upload one or multiple screenshots, arrange them as a flow, and generate structured documentation powered by AI.

---

## ✨ Features

### 📸 Multi-Screenshot Upload

* Drag & drop multiple images
* Reorder screenshots to define user flow
* Visual preview with step ordering

### 🧠 AI-Powered Spec Generation

* Interprets UI as a complete user journey
* Generates:

  * Jira-ready stories
  * Notion PRDs
  * Confluence specs

### ⚡ Streaming UX

* Real-time generation feedback
* Progressive output rendering

### 🧩 Tabbed Output

* Switch between:

  * Jira
  * Notion
  * Confluence

### 🛠️ Custom Prompt System

* Prompts live in `/prompts/ui-spec.txt`
* Easily customizable without changing code

---

## 📁 Project Structure

```bash
/app
  /api
    /generate
      route.ts        # AI integration + prompt handling
  layout.tsx
  page.tsx

/components
  Landing.tsx         # Main UI (upload + tabs + streaming)

/lib
  formatters.ts       # Optional formatting utilities

/prompts
  ui-spec.txt         # Customizable AI prompt

/public
  ...

tailwind.config.js
postcss.config.js
tsconfig.json
package.json
```

---

## ⚙️ Setup

### 1. Install dependencies

```bash
npm install
```

---

### 2. Configure environment variables

Create `.env.local`:

```bash
CLAUDE_API_URL=
CLAUDE_API_KEY=
CLAUDE_MODEL=

# Enable streaming (optional)
CLOUD_AI_STREAM=true
```

---

### 3. Run the app

```bash
npm run dev
```

Open:

```
http://localhost:3000
```

---

## 🧠 Prompt Customization

Edit:

```bash
/prompts/ui-spec.txt
```

This controls:

* Output structure
* Writing style
* Level of detail

### Example (simplified)

```txt
Analyze the UI screenshots as a complete user flow.

Return JSON with:
- jira
- notion
- confluence

Each must be a string.
```

👉 No code changes required — just edit the file.

---

## 🔌 API Overview

### POST `/api/generate`

#### Request

* `multipart/form-data`
* key: `files` (multiple images supported)

#### Response (JSON)

```json
{
  "jira": "...",
  "notion": "...",
  "confluence": "..."
}
```

#### Streaming (NDJSON)

Events include:

```json
{ "type": "status", "message": "Analyzing..." }
{ "type": "chunk", "tab": "jira", "content": "..." }
{ "type": "result", "jira": "...", "notion": "...", "confluence": "..." }
```

---

## 🧪 How It Works

1. Upload screenshots (ordered)
2. Backend:

   * Encodes images
   * Builds prompt from `/prompts/ui-spec.txt`
   * Sends to Claude / Cloud AI
3. Response is:

   * Parsed into structured output
   * Streamed or returned as JSON
4. UI displays output per tab

---

## ⚠️ Important Notes

### Prompt Contract Must Match UI

Your prompt **must return exactly**:

```json
{
  "jira": "...",
  "notion": "...",
  "confluence": "..."
}
```

If extra keys (e.g. `engineering_spec`) are included, parsing may fail and UI may display raw JSON.

---

### Streaming Behavior

Current streaming:

* Simulates progressive output after full AI response
* Not token-by-token streaming

---

## 🔮 Roadmap

* [ ] True token streaming from AI
* [ ] Export to Jira / Notion APIs
* [ ] Save history / sessions
* [ ] Auth & team collaboration
* [ ] Prompt templates (switchable)
* [ ] Engineering spec tab (optional)

---

## 🧠 Design Philosophy

SnapSpec is not just a generator — it’s a **thinking tool** for:

* Product Managers
* Designers
* Engineers

It bridges the gap between:

> idea → structure → execution

---

## 💡 Contributing

PRs welcome. Keep changes:

* simple
* modular
* UX-first

---

## 📄 License

MIT

---

This is shaping into a very strong product 👍
