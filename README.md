# AI-telefonist för svenska däckverkstäder (V0)

Backend and integration layer for a Swedish-speaking AI phone receptionist for tire shops.
[`PROJECT.md`](PROJECT.md) is the source of truth for scope, architecture and milestones.

Vapi owns the realtime voice pipeline (Twilio → Deepgram → OpenAI → ElevenLabs). This
repository only owns trusted business logic: authenticated Vapi tool endpoints, input
validation, and sending one structured email per request via Resend.

The demo company ("Svenssons Däck & Bil") is fictional.

## Status

| Milestone | State |
|---|---|
| 1 — Repository foundation | Done |
| 2 — Domain layer | Done |
| 3 — Email layer | Done |
| 4 — Vapi tool endpoints | Done |
| 5–10 | Not started |

## Requirements

- Node.js `>=20.19.0 <25` (production runs 24.x on Vercel; also verified locally on 20.19.4)
- npm (exact versions are enforced via `.npmrc` → `save-exact=true`; commit `package-lock.json`)

## Setup

```bash
npm ci
cp .env.example .env.local   # then fill in values locally; never commit .env.local
npm run dev
```

Check the server is up:

```bash
curl http://localhost:3000/api/health
# {"ok":true}
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (`eslint-config-next` core-web-vitals + TypeScript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (single run) |
| `npm run check` | lint + typecheck + test + build |

## Environment variables

See [`.env.example`](.env.example). Required by the backend:

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key for workshop emails |
| `VAPI_WEBHOOK_TOKEN` | Shared bearer token Vapi sends to the tool endpoints |
| `BOOKING_NOTIFICATION_EMAIL` | Workshop inbox that receives requests |
| `EMAIL_FROM` | Sender, e.g. `AI-telefonist <noreply@your-domain>` (must be a Resend-verified domain) |
| `APP_BASE_URL` | Public base URL of the deployment |

These are validated with Zod in [`src/lib/env.ts`](src/lib/env.ts). Validation is lazy
(`getServerEnv()` on first use) so that `/api/health` and `next build` work before secrets
are configured. Error messages list variable names only, never values.

The `VAPI_*` / `TWILIO_*` variables are for optional setup/automation and are not read by the
backend. OpenAI, Deepgram and ElevenLabs credentials live in Vapi.

Locally use `.env.local`; on Vercel use encrypted environment variables. No secret may use a
`NEXT_PUBLIC_` prefix.

## Endpoints

| Route | Status |
|---|---|
| `GET /api/health` → `{ "ok": true }` | Implemented |
| `POST /api/vapi/tools/booking-request` (tool `submit_booking_request`) | Implemented |
| `POST /api/vapi/tools/callback-request` (tool `submit_callback_request`) | Implemented |
| `POST /api/vapi/events` | Later milestone |

## Workshop email

Each tool call sends one email to `BOOKING_NOTIFICATION_EMAIL` via Resend, using the idempotency key
`booking-request/<toolCallId>` or `callback-request/<toolCallId>`. A retried tool call therefore reuses the
same key and cannot create a duplicate email. The email time must come from the Vapi call (not
`new Date()`) so a retry renders an identical payload. Missing optional fields are shown as
"Ej angivet" rather than guessed. Resend idempotency keys are honoured for 24 hours.

## Vapi tool contract

Pipeline per request: bearer auth → envelope parsing → Zod validation → registration-number
normalization → Resend email → Vapi result.

**Auth.** Configure a Vapi *Bearer Token* credential (header `Authorization`, Bearer prefix on)
with the value of `VAPI_WEBHOOK_TOKEN`, and attach it to both tools' server. Missing/invalid auth
returns `401` before the body is read.

**Request** (Vapi `ServerMessageToolCalls`):

```json
{ "message": { "type": "tool-calls",
  "call": { "id": "...", "createdAt": "2026-09-25T16:43:00.000Z" },
  "toolCallList": [ { "id": "call_abc", "type": "function",
    "function": { "name": "submit_booking_request", "arguments": "{\"customerName\":\"...\"}" } } ] } }
```

`arguments` may be a JSON string or an object; the flat `{ id, name, parameters }` shape is also
accepted. The email's call time comes from `call.createdAt` (fallback `call.startedAt`, then
`message.timestamp`) so retries are identical; if none exists the tool fails rather than using the
current time.

**Response** — always HTTP 200 once a tool call can be identified:

```json
{ "results": [ { "name": "submit_booking_request", "toolCallId": "call_abc",
  "result": "{\"success\":true,\"message\":\"Booking request submitted successfully.\"}" } ] }

{ "results": [ { "name": "submit_booking_request", "toolCallId": "call_abc",
  "error": "{\"success\":false,\"message\":\"Could not submit the request.\",\"invalidFields\":[\"phone\"]}" } ] }
```

`invalidFields` (names only) is present for validation failures. Other statuses: `400` malformed
JSON / not a `tool-calls` message, `401` auth, `500` server env misconfigured.

## Deployment (Vercel)

- Git-connected Vercel project, framework preset **Next.js**, default build/install commands.
  No `vercel.json` is needed.
- Node.js: `engines.node` is `>=20.19.0 <25`, which Vercel maps to the latest **24.x**.
- Set the five required variables under **Settings → Environment Variables** for the
  **Production** environment, marked **Sensitive**, then redeploy (env changes only apply to new
  deployments). Preview deployments intentionally have no secrets; their tool endpoints return 500.
- Use the production domain (`https://<project>.vercel.app`) for Vapi. Per-deployment URLs are
  behind Vercel Deployment Protection; don't disable it.

Smoke test a deployment (reads the token from `.env.local`, never prints it):

```bash
node --env-file=.env.local scripts/smoke-test.mjs https://<project>.vercel.app
# optional: also send ONE marked test email to BOOKING_NOTIFICATION_EMAIL, twice with the same toolCallId
node --env-file=.env.local scripts/smoke-test.mjs https://<project>.vercel.app --send-test-email
```

Default checks never send email: health, 401 without/with wrong auth, 400 for malformed
requests, and a Vapi `results[].error` for invalid arguments on both tool endpoints.

## Repository structure

```text
prompts/                 canonical agent prompt (added in a later milestone)
src/app/api/             Next.js route handlers (no frontend in V0)
src/config/company.ts    fictional demo company (approved facts only)
src/lib/env.ts           server env validation
src/lib/email/           Resend wrapper (only file importing `resend`) + Swedish templates
src/lib/normalization/   registration-number normalization
src/lib/vapi/            auth, tool-call envelope parsing, response formatting, shared tool pipeline
src/schemas/             Zod schemas for tool input (+ shared field helpers)
src/types/               domain types (BookingRequest, CallbackRequest, CompanyConfig)
scripts/smoke-test.mjs   deployed-backend smoke test
tests/                   Vitest tests
```

## Future / explicitly deferred

Not part of V0 (see `PROJECT.md` §34): databases, dashboards, customer login, payments, CRM,
calendar integration / live availability, SMS, multi-tenancy, RAG, call recording/transcript
storage, custom voice stack, analytics, and Phase 2 prospecting tooling.
