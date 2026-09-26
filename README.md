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
| 3–10 | Not started |

## Requirements

- Node.js `>=20.19.0` (developed on 20.19.4)
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
| `POST /api/vapi/tools/booking-request` | Milestone 4 |
| `POST /api/vapi/tools/callback-request` | Milestone 4 |
| `POST /api/vapi/events` | Later milestone |

## Repository structure

```text
prompts/                 canonical agent prompt (added in a later milestone)
src/app/api/             Next.js route handlers (no frontend in V0)
src/config/company.ts    fictional demo company (approved facts only)
src/lib/env.ts           server env validation
src/lib/email/           Resend wrapper + templates (Milestone 3)
src/lib/normalization/   registration-number normalization
src/lib/vapi/            auth, tool-call parsing, responses (Milestone 4)
src/schemas/             Zod schemas for tool input (+ shared field helpers)
src/types/               domain types (BookingRequest, CallbackRequest, CompanyConfig)
tests/                   Vitest tests
```

## Future / explicitly deferred

Not part of V0 (see `PROJECT.md` §34): databases, dashboards, customer login, payments, CRM,
calendar integration / live availability, SMS, multi-tenancy, RAG, call recording/transcript
storage, custom voice stack, analytics, and Phase 2 prospecting tooling.
