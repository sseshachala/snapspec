# SnapSpec

From screenshots to production-ready specs.

SnapSpec is a Next.js app that turns one or more ordered UI screenshots into three parallel outputs:

- Jira user stories with acceptance criteria
- Notion-style product requirements
- Confluence-style functional specs

The current app also supports optional user-provided context, Cloudflare Turnstile verification, rate limiting, downloadable outputs, and email delivery through Resend.

## Features

- Multi-image upload with ordered flow handling
- Optional context input to ground the generated spec
- Three output tabs: `jira`, `notion`, `confluence`
- NDJSON status/chunk/result streaming mode
- Output copy/download actions
- Email delivery for generated results with screenshots inline and attached in upload order
- Prompt customization through [`prompts/ui-spec.txt`](/Users/ctp1126/New_projj/snapspec/prompts/ui-spec.txt:1)

## Tech Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Cloudflare Turnstile
- Upstash Redis + `@upstash/ratelimit`
- Resend

## Project Structure

```text
app/
  api/
    email/route.ts       # Email delivery endpoint
    generate/route.ts    # Screenshot analysis + AI generation
  globals.css
  layout.tsx
  page.tsx               # Renders UnifiedPage

components/
  UnifiedPage.tsx        # Main landing page + generator UI

prompts/
  ui-spec.txt            # Prompt template used by /api/generate
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` with the variables your deployment uses.

```bash
# AI provider
CLAUDE_API_URL=               # or ANTHROPIC_API_URL
ANTHROPIC_API_KEY=
CLAUDE_MODEL=                 # or CLOUD_AI_MODEL
CLOUD_AI_STREAM=false

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Upstash Redis / ratelimiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Email delivery
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

Notes:

- The generate route reads `CLAUDE_API_URL` or `ANTHROPIC_API_URL`.
- The API key currently comes from `ANTHROPIC_API_KEY`.
- The model comes from `CLAUDE_MODEL` or `CLOUD_AI_MODEL`.
- If Upstash Redis env vars are present, both API routes enable rate limiting.
- If Upstash Redis env vars are missing or invalid, the routes still run and log a warning, but rate limiting is disabled.

### 3. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## How It Works

1. The user uploads up to 5 screenshots and orders them as a flow.
2. The client optionally resizes images, attaches context, and sends a `turnstileToken`.
3. `/api/generate` verifies Turnstile, enforces Redis-backed rate limits, loads [`prompts/ui-spec.txt`](/Users/ctp1126/New_projj/snapspec/prompts/ui-spec.txt:1), and sends the ordered screenshots to the configured AI endpoint.
4. The response is parsed into `jira`, `notion`, and `confluence`.
5. The UI renders the outputs and can copy, download, or email them.
6. Email sharing includes the generated outputs plus the uploaded screenshots in the same order.

## API Overview

### `POST /api/generate`

Request:

- Content type: `multipart/form-data`
- Fields:
- `files`: one or more images
- `turnstileToken`: required
- `context`: optional plain text, capped at 1000 chars server-side

Server-side validation:

- 1 to 5 image files
- Total upload size under 10 MB
- Non-empty image MIME types only
- Cloudflare Turnstile verification
- Cooldown limit: 1 request / 45 seconds per IP
- Hourly limit: 5 requests / hour per IP

Response:

- JSON when streaming is disabled
- NDJSON when `CLOUD_AI_STREAM=true`

JSON shape:

```json
{
  "jira": "...",
  "notion": "...",
  "confluence": "..."
}
```

NDJSON events:

```json
{ "type": "status", "message": "Analyzing UI flow..." }
{ "type": "chunk", "tab": "jira", "content": "..." }
{ "type": "result", "jira": "...", "notion": "...", "confluence": "..." }
```

If the AI response cannot be parsed into valid `jira` / `notion` / `confluence` JSON, the route returns an error instead of falling back to partial raw output.

### `POST /api/email`

Request body:

```json
{
  "email": "user@example.com",
  "jira": "...",
  "notion": "...",
  "confluence": "...",
  "screenshots": [
    {
      "filename": "screen-1.png",
      "contentType": "image/png",
      "content": "<base64>"
    }
  ]
}
```

Behavior:

- Validates email format
- Applies Redis-backed rate limiting
- Sends HTML and text email through Resend
- Includes uploaded screenshots inline and as attachments in upload order

## Prompt Contract

[`prompts/ui-spec.txt`](/Users/ctp1126/New_projj/snapspec/prompts/ui-spec.txt:1) must instruct the model to return valid JSON with exactly these keys:

```json
{
  "jira": "...",
  "notion": "...",
  "confluence": "..."
}
```

Each value must be a string. Do not return arrays, nested objects, or markdown fences.

## Current Behavior Notes

- Streaming is simulated at the app level after the model response is received; it is not token-by-token model streaming.
- `components/UnifiedPage.tsx` is the active UI rendered by `app/page.tsx`.

## Verification

- `npx tsc --noEmit` passes in the current workspace.
- `npm run build` was not verified in this sandbox because Next.js/Turbopack attempted a blocked port bind during CSS processing.

## License

MIT
