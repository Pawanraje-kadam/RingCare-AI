# RingCare AI

**Your front door, understood.**

RingCare AI is a production-quality demo of a calm, privacy-respecting smart-home
awareness workspace. It turns **simulated** doorbell and camera-style event metadata
into structured explanations, deterministic attention suggestions, daily summaries,
constrained natural-language search, and caregiver-arrival records.

The application is built with Next.js (App Router), TypeScript, Tailwind CSS, Zod, and
optional server-side Groq analysis with **Llama 3.3 70B**
(`llama-3.3-70b-versatile`). It runs fully without a Groq key by falling back to
deterministic rules, and every AI-generated versus rules-generated result is clearly
labelled with the model that produced it.

> **This is a simulation, not a security system.**
> No Ring account, camera, doorbell, or live device is connected. There is no facial
> recognition or identity verification, and the app does not infer criminality, danger,
> or intent from unfamiliarity, duration, or appearance. Event records are stored only
> in your browser.

---

## Contents

- [What is implemented](#what-is-implemented)
- [How the intelligence works](#how-the-intelligence-works)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Demo walkthrough](#demo-walkthrough)
- [Pages](#pages)
- [Architecture and data flow](#architecture-and-data-flow)
- [Privacy, safety, and security decisions](#privacy-safety-and-security-decisions)
- [Accessibility](#accessibility)
- [Tests and verification](#tests-and-verification)
- [Deploying to Vercel](#deploying-to-vercel)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Project structure](#project-structure)
- [Scripts](#scripts)

---

## What is implemented

### Monitoring and explanation

- **Overview dashboard** with metric cards computed from the actual local demo records:
  total events, suggested-review count, delivery-related events, caregiver arrivals, and
  uncertain events.
- **Recent activity feed** and a **needs-review queue** sorted by rule severity and time.
- **Activity chart** (today in four-hour blocks, or the last seven days) with a complete
  table alternative and a text description. Color is never the only meaning.
- **AI daily summary** grounded in deterministic facts. Llama 3.3 70B via Groq may phrase
  it; it cannot invent counts. The source and fallback reason are always visible.
- **Event timeline** with natural-language search, manual filters (type, attention,
  location, date, time of day, caregiver-rule match), sorting, pagination, and a full
  detail dialog.
- **Event detail panel** containing:
  - the originating description and metadata, marked as untrusted source data;
  - the rule attention level, reasons, matched rules, and every rule checked;
  - missing-information and uncertainty notes;
  - the deterministic recommendation;
  - the Llama 3.3 70B explanation (if requested and available) or an explicit
    deterministic fallback, including the model that answered, confidence, limitations,
    and a retry action;
  - a remove action with confirmation.
- **AI insights** comparing the current period with the immediately preceding period,
  including total events, deliveries, caregiver arrivals, review items, top location,
  busiest hour, and explicit limitations.
- **Caregiver activity** with a configurable metadata-based rule. Arrivals are labelled
  matched or not matched, and the UI states repeatedly that a match is not verified
  identity and no facial recognition is used.
- **Settings** for the prolonged-presence threshold, per-event notification preferences,
  retention limit, caregiver label/criteria/alerts, AI enablement, AI status, simulator
  auto-generation, and destructive demo-data actions (all with confirmation).

### Simulator and demo mode

- **Seven clearly labelled simulated scenarios**: delivery, doorbell, caregiver arrival,
  person detection, motion, prolonged presence, and unknown activity.
- **Auto-generation controls** (off by default) for synthetic events at a configured
  interval while the tab is open. It never sends AI requests automatically.
- **Guided “Run demo” dialog** with two options before starting — reset to a reproducible
  dataset, and whether to send the single AI explanation request — plus a footer that stays
  outside the scrolling step list so **Start guided demo** is always reachable, including
  on short mobile viewports. The sequence has visible progress:
  1. reset to a reproducible dataset (optional);
  2. add a simulated delivery event;
  3. run deterministic delivery rules;
  4. request a Llama 3.3 70B explanation or explicitly fall back to rules;
  5. show a proportionate recommendation;
  6. add a simulated caregiver arrival with your configured label;
  7. evaluate the caregiver rule (metadata match only);
  8. add a prolonged-presence event above your threshold;
  9. highlight the event according to the rule engine;
  10. link to the highlighted event and generate a grounded daily summary.
- **Deterministic seed dataset** with valid simulated events across days, including
  review, high-attention, matched and unmatched caregiver, and incomplete-information
  examples. Seed explanations are marked as generated without live AI calls.

### API and safety layer

- **Health endpoint** at `GET /api/health` reporting service status, demo mode, the
  active model and label, prompt version, which env var supplied the key, and a real
  `verificationStatus` from Groq's free `/models` endpoint (cached five minutes;
  `?refresh=1` forces a check) — never the key itself.
- **Server-side Groq integration** over the OpenAI-compatible Chat Completions API
  (`POST /chat/completions`, JSON mode), with schema hints in the prompt, a Zod
  validation pass, prompt-injection delimiters, safety guardrails, bounded input sizes,
  timeouts, and deterministic fallbacks.
- **Event ingestion boundary** at `POST /api/events` that accepts only validated,
  explicitly simulated events and rejects live Ring sources.
- **Demo dataset endpoint** at `POST /api/demo`.
- **In-memory fixed-window rate limiting** per route and client IP, with `429` and
  `Retry-After`. This is a per-instance safeguard, not global distributed limiting.

---

## How the intelligence works

The architecture deliberately separates **classification** from **narration**.

```
Event metadata ──► Zod validation ──► deterministic rule engine ──► rule facts
                                             │
                                             ▼
                               optional Groq narration (bounded)
                                             │
                    constrained JSON ──► Zod validation ──► guardrails
                                             │
                                accepted? ───┴──► rejected → deterministic fallback
```

### Deterministic rules decide

The rule engine (`lib/events/rules.ts`) only evaluates objective, configured conditions:

- delivery-related source labels (never “delivery completed”);
- caregiver arrival criteria against supplied metadata (never verified identity);
- doorbell presses and person-related detections (never identity or intent);
- duration relative to your threshold;
- repeated related events at the same location within 15 minutes;
- high attention only when **the duration threshold is met and at least two related
  person events occurred nearby within the window**;
- notification preferences (motion is quiet by default);
- insufficient information, which produces an `unknown`/uncertain state instead of a
  guess.

Every matched rule carries a plain-language reason. Unfamiliarity, appearance, time of
day, and raw duration alone never produce a high-attention result.

### Groq only explains

When `GROQ_API_KEY` is present and AI is enabled, server routes may ask Groq
(`llama-3.3-70b-versatile` by default) to:

- interpret a single event using its metadata and deterministic rule result;
- write a daily summary from deterministic facts;
- write contextual observations from deterministic comparison facts;
- interpret a natural-language event query into a **constrained filter plan**.

Every request includes the computed facts and rules. The model must return structured
JSON matching an allow-listed schema. The server then:

1. parses and validates the JSON with Zod;
2. scans narrative text for unsupported criminality, danger, identity, emergency,
   reassurance, monitoring, and prompt-injection claims;
3. checks unsupported numeric claims against computed counts;
4. verifies the model’s event attention level exactly equals the rule engine’s level;
5. rejects and falls back on any mismatch.

For search, the model can only choose allow-listed fields and enum values. The app then
executes the validated plan **against its own local records**; no model-generated SQL,
shell command, URL, or arbitrary instruction is executed.

### Model and request settings

- **The default model is `llama-3.3-70b-versatile`** (shown in the UI as
  **Llama 3.3 70B**). The identifier lives in `lib/constants/ai.ts`; the health endpoint,
  Settings, status cards, AI badges, and the guided demo all read from it, so no surface
  can name a different model than the one that answered.
- **`GROQ_MODEL` may select another Groq model.** The value is normalized (case,
  whitespace) and validated; an invalid identifier falls back to the default and produces
  a `modelNotice` that Settings displays.
- **JSON mode, not a schema.** Groq's
  `response_format: { type: "json_object" }` guarantees syntactically valid JSON but not a
  particular shape. Each prompt therefore carries an explicit JSON *shape hint*
  (`lib/ai/response-schemas.ts`), and every response is still validated with Zod and the
  safety guardrails.
- **Bounded output.** `max_completion_tokens` is 2048 for narration and 1024 for search.
  A completion that stops with `finish_reason: "length"` is treated as
  `invalid_response` rather than shown half-parsed.
- **Temperature 0.2**, `stream: false`, and a 15–24 s timeout per request.
- **One retry, only when it is safe.** 5xx responses and transport timeouts are retried
  once after 350 ms. Auth and quota errors are never retried. A schema or guardrail
  rejection gets one corrective retry with a stricter instruction.

### Every result is labelled

AI responses carry `meta.mode` (`groq` or `fallback`), an optional safe reason, an
optional short diagnostic (`meta.detail`, for example `HTTP 401 · Invalid API Key`),
the model that answered, cache status, and timestamp. UI badges and notices display
whether content came from Groq/Llama 3.3 70B, the short-lived server cache, or
deterministic rules. The app never claims AI was used when a fallback produced the text.

If a schema-valid answer fails a semantic check (wrong attention level, an unsupported
count, or a prohibited claim), the server retries **once** with a corrective instruction
before falling back. Auth, quota, timeout, and network failures are never retried
blindly.

### Fallback behavior

Fallbacks occur when:

- AI is disabled in Settings (`ai_disabled`);
- `GROQ_API_KEY` is absent (`missing_api_key`);
- the server route is unreachable (`network_error`);
- a request times out;
- Groq reports quota/rate limits (`rate_limited`);
- the provider fails (`provider_error`);
- output fails schema validation (`invalid_response`);
- output makes unsupported claims (`unsafe_response`).

Fallback text is generated from the same deterministic facts as the AI path. The app stays
fully functional without a key.

---

## Requirements

- **Node.js 20.9 or newer** (Node 22 recommended)
- npm (a `package-lock.json` is included)
- Optional: a Groq API key from <https://console.groq.com/keys>

---

## Quick start

```bash
npm install
cp .env.example .env.local
# Optional: add GROQ_API_KEY to .env.local
npm run dev
```

Open **http://localhost:3000**. The root redirects to `/dashboard`.

Without a Groq key:

- the dashboard, simulator, rules, timeline, caregiver, and settings all work;
- the header shows **Rules-only**;
- explanations and summaries are clearly labelled deterministic fallbacks;
- `/api/health` reports `"configured": false`.

With a key:

- AI analysis is attempted only when you request an explanation, summary, insight, or
  search (or when the dashboard auto-requests today’s summary);
- if the key is invalid, quota-limited, or the model is unavailable, the same fallback is
  shown with an honest reason.

### Production build locally

```bash
npm run build
npm start
```

---

## Environment variables

| Variable | Required | Scope | Purpose |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | No | Server only | Groq API key. Absent/empty → deterministic rules-only mode. |
| `GROQ_MODEL` | No | Server only | Optional Groq model override. Defaults to `llama-3.3-70b-versatile`; invalid values are ignored with a notice. |
| `GROQ_BASE_URL` | No | Server only | Optional base URL for the OpenAI-compatible API. Defaults to `https://api.groq.com/openai/v1`; useful for a local mock or proxy. |

Rules:

- **Never** rename these to `NEXT_PUBLIC_*`. Anything with that prefix is bundled into
  browser JavaScript and would expose the key.
- `.env.local` is git-ignored. `.env.example` contains placeholders only.
- Pasted values are normalized: surrounding quotes, a leading `Bearer`, and embedded
  whitespace/newlines are removed before use.
- The key is read only in `lib/ai/groq.ts` on the server. It is never returned by an
  API, stored in an event, written to a log, or rendered in Settings. Provider messages
  are sanitized (`gsk_…` keys and `Bearer …` tokens are redacted) before they reach the UI.
- The default model is `llama-3.3-70b-versatile`. If `GROQ_MODEL` is set, its value is
  normalized and validated; the model actually used is reported by `/api/health` and shown
  on every AI result.
- Legacy `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and `GEMINI_MODEL` variables are **not** read.
  Remove them from an existing deployment to avoid confusion.
- **On Vercel, adding or changing an environment variable requires a redeploy.** Existing
  deployments keep their original environment.
- Groq rate limits and free-tier availability are per account and per model. Check
  <https://console.groq.com/docs/rate-limits>.

### Verifying the key

`/api/health` reports whether a key is configured **and** whether Groq accepts it. When a
key exists, the server calls Groq's free `/models` endpoint with a short timeout and caches
the result for five minutes. It does not spend completion tokens, and it also confirms that
the configured model is listed for that key.

| `verificationStatus` | Meaning | What to do |
| --- | --- | --- |
| `ok` | Groq answered and lists the configured model. | Nothing. |
| `not_configured` | No `GROQ_API_KEY` was found. | Add `GROQ_API_KEY` and redeploy. |
| `invalid_key` | HTTP 401/403 — Groq rejected the key. | Replace the key, then redeploy. |
| `model_unavailable` | The key works but does not list `llama-3.3-70b-versatile`. | Check `GROQ_MODEL` or account access. |
| `quota` | HTTP 429 — account rate limit. | Wait or raise the limit. |
| `unreachable` | Network/timeout while contacting Groq. | Check outbound access and `GROQ_BASE_URL`. |
| `error` | Any other provider error. | Inspect the sanitized message. |

The same information appears in **Settings → AI analysis** with a **Test connection**
button (`GET /api/health?refresh=1`), in the header chip, and on the overview card.

---

## Demo walkthrough

1. Open `/dashboard`.
2. The local seed dataset loads automatically on first visit. All records are marked
   simulated.
3. Click a metric, attention item, or recent event to open its detail panel.
4. Use **Generate explanation** in the panel to exercise the AI path or its fallback.
5. In the **Event simulator**, add any scenario. Use **Auto-generate** only if you want a
   stream of synthetic events; no AI calls are made by that stream.
6. Click **Run demo** in the header or overview page for the guided ten-step sequence.
7. Use **Review highlighted event** at the end to open the timeline’s deep-linked detail
   panel, or **Open insights** to compare today with the previous period.
8. Go to **Settings** to change the threshold, caregiver label/criteria, notification
   preferences, retention, or AI preference. Save with confirmation.
9. Use **Reset demo data** to restore the seed dataset, or **Clear all recorded events**
   to start empty. Both require confirmation and affect only this browser.

### Reset behavior

- **Reset demo data**: fetches a freshly time-stamped seed dataset from `/api/demo`
  (falls back to local generation if the route is unavailable). Settings are preserved.
- **Clear all events**: removes all local records from this browser. The app does not
  silently re-seed until you reset or clear site data.
- Retention: when the configured limit is exceeded or reduced, the oldest records are
  removed locally. Settings and theme are kept.

---

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Redirects to `/dashboard`. |
| `/dashboard` | Overview: metrics, daily summary, attention queue, chart, recent activity, simulator, AI status. |
| `/dashboard/timeline` | Searchable, filterable, sortable, paginated event history with detail panel and deep link (`?event=<id>`). |
| `/dashboard/insights` | AI or deterministic contextual comparisons for today, 7 days, or 30 days. |
| `/dashboard/caregiver` | Caregiver arrivals, metadata rule matches, configuration summary, no-biometrics notice. |
| `/dashboard/settings` | Rules, notifications, caregiver setup, retention, AI settings/status, simulator defaults, demo data actions. |

---

## Architecture and data flow

- **Client-owned event store.** Events live in `localStorage` under
  `ringcare.events.v1`, validated on read and write. There is no server event database and
  no in-memory server state used as durable storage.
- **Stateless server AI routes.** The browser sends bounded event digests, never the full
  local store. The server recomputes deterministic rules and facts before calling Groq.
- **Short-lived in-memory cache** on the server (30-minute TTL, bounded entries) reduces
  duplicate Groq calls. It is per instance and disappears on restart.
- **Rate limits** are per server instance, per route, per client IP.
- **Retention and settings** live in the browser. Clearing site data resets the demo.

### API surface

| Route | Method | Limit | Notes |
| --- | --- | --- | --- |
| `/api/health` | `GET` | — | Configuration/status plus credential verification (`?refresh=1` bypasses the 5-minute cache). Never exposes secrets. |
| `/api/ai/analyze` | `POST` | 12/min | One event + up to 10 context digests. |
| `/api/ai/summary` | `POST` | 12/min | Up to 120 events, 90-day range. |
| `/api/ai/insights` | `POST` | 12/min | Up to 180 events across two windows. |
| `/api/ai/search` | `POST` | 12/min | Query → validated plan; never executes model output directly. |
| `/api/events` | `POST` | 30/min | Accepts **simulated** events only. |
| `/api/demo` | `POST` | 10/min | Generates a fresh simulated seed dataset. |

JSON error shape:

```json
{ "ok": false, "error": { "code": "invalid_request", "message": "…", "details": [] } }
```

Responses use `no-store` caching and `nosniff`. Request bodies have hard size caps
(128 KB for AI routes) and must be JSON.

### Browser storage keys

| Key | Contents |
| --- | --- |
| `ringcare.events.v1` | Versioned event envelope with validated events. |
| `ringcare.settings.v1` | Thresholds, notification preferences, retention, caregiver, AI preference. |
| `ringcare.theme.v1` | `system` \| `light` \| `dark`. |
| `ringcare.sidebar-collapsed.v1` | Sidebar layout preference. |
| `ringcare.summary-cache.v1` | Reserved for local summary caching. |

Corrupt or invalid stored data is skipped or replaced with a warning rather than crashing
the app.

---

## Privacy, safety, and security decisions

- **No Ring integration is claimed.** There are no Ring credentials, private endpoints,
  screenshots, or live camera feeds. `lib/integrations/ring` documents the adapter
  boundary and intentionally refuses live data.
- **No biometric processing.** No faces, voices, gait, appearance, or identity are
  analyzed. Caregiver status is a metadata rule match, not identity verification.
- **No intent/danger inference.** Rules are transparent heuristics. Recommendations are
  proportionate and may suggest doing nothing. The app never recommends contacting
  emergency services.
- **Untrusted text is data.** Event descriptions, labels, notes, and search queries are
  treated as untrusted input, sanitized, delimited in prompts, and never executed.
- **Constrained outputs.** Groq is asked for JSON in a documented shape (JSON mode plus an
  explicit shape hint in the prompt), and the result is re-validated with Zod and scanned
  by the guardrails before display. Attention levels are recomputed server-side.
- **Secrets stay server-side.** `GROQ_API_KEY` is read only by server-only modules; the
  health endpoint reports only a boolean. No secret appears in client bundles or logs.
- **Bounded requests.** Timeouts, maximum events/descriptions, body-size caps, and
  per-instance rate limits are enforced. Errors log only an error class/name, not request
  bodies or event text.
- **Security headers.** `nosniff`, strict referrer policy, and a restrictive permissions
  policy (camera, microphone, geolocation, payment disabled) are configured.
  Framing-protection headers are intentionally omitted so the review/preview environment
  can embed the app; add `X-Frame-Options`/`frame-ancestors` before a public launch where
  embedding is not required.
- **No authentication.** This is a single-user demo workspace. Do not store real
  household data in it.

---

## Accessibility

- Semantic landmarks, one `h1` per page, ordered headings, and a skip link.
- All controls are native buttons/inputs/selects or Radix primitives with focus-visible
  rings; dialogs have titles, descriptions, focus trapping, and Escape/overlay close.
- Labels are associated with inputs; validation errors use `aria-invalid` and alert text.
- Attention and AI source are always conveyed with text plus an icon, never color alone.
- Every chart has a text description, legend with counts, and an expandable data table.
- Live regions announce simulated events, toasts, and demo progress; progress has
  `role="progressbar"` with numeric values.
- Responsive layouts from small mobile through wide desktop, with a mobile navigation
  sheet and wrapping controls.
- Reduced-motion preferences disable animations via `prefers-reduced-motion`.
- Dark and light themes with contrast-checked semantic tokens.

---

## Tests and verification

Test stack: **Vitest**, Testing Library, jsdom for UI tests, and a Node environment for
domain/API tests.

```bash
npm test           # Vitest: all suites
npm run lint       # ESLint (flat config, next/core-web-vitals + next/typescript)
npm run typecheck  # tsc --noEmit, strict
npm run build      # Next.js production build
```

Coverage includes:

- deterministic rule behavior (delivery, caregiver metadata, motion, uncertain events,
  duration-only escalation prevention, high-attention combination, notification
  preferences);
- seeded dataset validity and presence of review/high-attention examples;
- Zod event, settings, incoming-event, and constrained search-plan validation;
- prompt-injection text treated as data, allow-listed plans, filtering/sorting, and
  no mutation of local records;
- deterministic fallback analysis/summary/insight and output guardrails;
- API behavior without a key: health honesty, summary fallback, analyze fallback, invalid
  bodies, wrong content types, and disabled AI;
- dashboard hydration, seeded data, simulated event creation, timeline local search, and
  settings validation/persistence;
- Groq request shape (`POST /chat/completions`, pinned `llama-3.3-70b-versatile`, bearer
  auth, JSON mode, output budget, temperature), key normalization without a legacy Gemini
  fallback, `GROQ_MODEL` override and invalid-model notice, credential verification
  outcomes (`ok`, `invalid_key`, `model_unavailable`, `quota`, `unreachable`), and
  redacted provider details;
- Groq narration success paths for analysis, summary, search, and insights, including one
  corrective retry after a schema/semantic rejection and a deterministic fallback after
  repeated unsafe claims;
- the guided demo: the primary action lives outside the scrolling body (so it is reachable
  on short viewports), both demo options toggle, and unchecking the AI option sends no
  `/api/ai/*` request.

### Verified in this workspace

At the time of writing this README, the following commands were actually run:

- `npm run lint` — passed with no errors or warnings.
- `npx tsc --noEmit` — passed.
- `npm test` — 12 test files, **85 tests passed**.
- `npm run build` — production build succeeded (Next.js 15.5.28), with static dashboard
  pages and dynamic API routes.
- `npm run dev` — started successfully; `/`, `/dashboard`, `/dashboard/timeline`,
  `/dashboard/insights`, `/dashboard/caregiver`, and `/dashboard/settings` returned
  HTTP 200 (the root returns a redirect), and `GET /api/health` reported
  `configured: false` with `verificationStatus: "not_configured"` in rules-only mode.
- `POST /api/demo` — returned a valid simulated seed dataset (29 events).
- `npm start` (production build) with a local mock of Groq's OpenAI-compatible API
  (`GROQ_BASE_URL=http://127.0.0.1:4010/openai/v1`):
  - `/api/health` reported `verificationStatus: "ok"`, `credentialsVerified: true`,
    `provider: "Groq"`, `model: "llama-3.3-70b-versatile"`, `modelLabel: "Llama 3.3 70B"`,
    `keySource: "GROQ_API_KEY"`, and a measured latency from a real `GET /models` call;
  - all four AI routes (`summary`, `analyze`, `search`, `insights`) returned
    `mode: "groq"` with `model: "llama-3.3-70b-versatile"`;
  - the captured request was `POST /chat/completions` with
    `Authorization: Bearer …`, `model: "llama-3.3-70b-versatile"`, `temperature: 0.2`,
    `max_completion_tokens: 2048` (1024 for search), `response_format: { type: "json_object" }`,
    `stream: false`, and `system` + `user` messages.
- Failure paths with the same mock:
  - HTTP 401 — health reported `invalid_key` with the actionable message, and a fresh
    analyze request fell back with `meta.reason: "provider_error"` and the sanitized
    `detail: "HTTP 401 · Invalid API Key"` (the key never appeared in any response);
  - an empty/truncated completion — `meta.reason: "invalid_response"` with
    `detail: "finish_reason length"`, after the single corrective retry;
  - a completion containing unsafe claims — `meta.reason: "unsafe_response"` after the
    corrective retry, with deterministic fallback text;
  - a malformed search plan (`datePreset: "all"`) — rejected by Zod, with the field named
    in `meta.detail`, and search interpreted locally instead.
- The guided demo is covered by a jsdom test that opens it, toggles both options, runs all
  ten steps to completion, and asserts that unchecking the AI option sends no `/api/ai/*`
  request. The primary action is asserted to sit outside the dialog's scrolling body so it
  remains reachable on short viewports.

**Not verified here:** calls against Groq's live service, because no real `GROQ_API_KEY`
exists in this environment. The HTTP path was verified end-to-end against a local mock of
the documented OpenAI-compatible API, and the same code path is covered by unit tests.
Account access, live rate limits, and real-world latency still need a real key in your
deployment. Visual browser testing was limited to jsdom interaction tests and
server-rendered response checks; no screenshot-based visual regression suite is included.

---

## Deploying to Vercel

The project uses standard Next.js App Router conventions and needs no custom build output
or database.

### Git + dashboard flow (recommended)

1. Push this repository to GitHub (the project is already a Git repository).
2. Sign in to <https://vercel.com> and choose **Add New → Project**.
3. Import the repository and select the branch/commit to deploy.
4. Keep the detected framework preset **Next.js**. Defaults are correct:
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output: Next.js default (`.next`)
   - Root directory: repository root
5. Under **Settings → General**, use **Node.js 20.x or newer** (22.x recommended).
6. Under **Settings → Environment Variables**, add for **Production, Preview, and
   Development** as appropriate:
   - `GROQ_API_KEY` = your key (mark it sensitive; do not select “Expose to browser”).
   - `GROQ_MODEL` = optional; defaults to `llama-3.3-70b-versatile`.
   - Do **not** create any `NEXT_PUBLIC_GROQ_*` variable.
7. Click **Deploy**.
8. After deployment, verify the key before judging the app:
   - open `https://<your-project>.vercel.app/api/health` and check
     `ai.verificationStatus` is `"ok"` and `ai.credentialsVerified` is `true`;
   - or open **Settings → AI analysis** and press **Test connection** (this calls
     `/api/health?refresh=1` and forces a fresh check);
   - if the status is `invalid_key`, `model_unavailable`, `quota`, or `unreachable`, the
     message tells you exactly which step failed;
   - then request a summary or explanation and confirm the badge names the model that answered
     (for example `Llama 3.3 70B`).
9. **Redeploy after any environment-variable change.** Adding a variable in Vercel does
   not update deployments that are already built. This is the most common reason a key
   appears to be ignored.
10. If you rename or rotate the key, repeat step 8 — a verified key is cached in the
    server instance for five minutes, and a built deployment keeps its old environment
    until it is redeployed.

### CLI flow

```bash
npm i -g vercel
vercel
# Follow prompts; link the project.
vercel env add GROQ_API_KEY production
vercel env add GROQ_MODEL production   # optional
vercel --prod
```

Enter the secret at the prompt; never put it in a shell history, commit, or chat message.

### Vercel notes

- AI routes run on the Node.js runtime with `maxDuration` between 15 and 30 seconds. On
  plans with shorter limits, timeouts fall back deterministically.
- No persistent server storage is used; Vercel’s stateless model matches the
  browser-local event design.
- Rate limits are in-memory and therefore **per serverless instance**. A public deployment
  needing reliable global limits should add a shared store (for example Upstash Redis) and
  authentication.
- The dashboard is statically prerendered; it hydrates from localStorage. No environment
  secret is required for the page to render.

### Optional production hardening

Before exposing this to real users or real data, add:

- authentication, household roles, and per-user storage;
- a durable database and an authorized event source;
- distributed rate limiting and abuse monitoring;
- a Content Security Policy and framing protection;
- a privacy review, consent flow, and retention policy;
- a model-availability and prompt regression suite with a test key;
- real-device accessibility and browser testing.

---

## Troubleshooting

### “Rules-only” badge / `configured: false`

- No `GROQ_API_KEY` was found in the running environment. Set it and **redeploy** —
  Vercel does not inject new variables into an existing deployment.
- Check that the variable is not named `NEXT_PUBLIC_GROQ_API_KEY` (that name is exposed to
  the browser and is deliberately not read by the server).
- Legacy `GEMINI_API_KEY`/`GOOGLE_API_KEY` variables are ignored by design; rename them.
- Settings now shows which variable supplied the key (`Key variable` row).

### Key is set but every result is a fallback

This was the most common failure mode before the current release. Work through it in order:

1. **Redeploy.** A deployment built before the variable was added will never see it.
2. Open **Settings → AI analysis → Test connection**. The badge and message identify the
   problem: `invalid_key` (401/403), `model_unavailable` (404), `quota` (429),
   `unreachable` (network), or `ok`.
3. Read the fallback notice on the event/summary. It now includes a safe
   `meta.detail`, e.g. `HTTP 401 · Invalid API Key`, plus a deployment hint.
4. Check that the key is pasted cleanly. Surrounding quotes, a leading `Bearer`, and
   embedded whitespace/newlines are stripped automatically, but a truncated key cannot be
   repaired.
5. Confirm the model. The default is `llama-3.3-70b-versatile`; if `GROQ_MODEL` names an
   invalid or unavailable model, Settings shows the active model and any notice.
6. Quota: Groq limits apply per account and per model. See
   <https://console.groq.com/docs/rate-limits>.

A completion that stops at the output limit (`finish_reason: "length"`) is reported as
`invalid_response` instead of being parsed; raise `max_completion_tokens` and the timeouts
together if you extend the prompts.

### Explanations say Groq was unavailable

- Inspect the badge and message on the event or summary. `timeout`, `rate_limited`,
  `provider_error`, `invalid_response`, and `unsafe_response` are distinct reasons, and
  `meta.detail` carries the sanitized provider status.
- `unsafe_response` means the model's wording claimed identity, intent, danger, or
  reassurance beyond the evidence. The server retries once with a correction, then falls
  back rather than showing the claim.
- `invalid_response` usually means truncated JSON (output budget) or a schema mismatch.
- Verify current model IDs and rate limits:
  <https://console.groq.com/docs/models> and
  <https://console.groq.com/docs/rate-limits>.

### `429 Too many requests`

- The per-instance limiter allows 12 AI requests per minute per IP, 30 ingestion
  requests, and 10 demo resets.
- Groq itself may also return rate-limit errors. Wait for the window to reset, or check
  your account tier.
- Restarting a serverless function clears only its in-memory limiter; it does not increase
  your Groq rate limit.

### Demo data disappeared

- Events are stored in `localStorage` for the current browser, origin, and profile. Private
  windows, cleared site data, a different browser, or a different deployment URL start
  fresh.
- Use **Settings → Demo data → Reset demo data** to restore the seed dataset.
- Clearing events is intentional and does not silently re-seed.

### Settings will not save

- The threshold must be a whole number from 10 to 1800 seconds.
- The caregiver label must be 2–40 characters; other settings have bounded enums.
- Browser storage may be unavailable/full. A banner explains when records cannot be saved;
  in-memory use continues for the tab.

### A dialog or page looks wrong after deployment

- Confirm the deployment completed and you are not viewing a stale cached deployment.
- Framing headers are intentionally omitted for embedding. If you add a strict CSP, allow
  the Next.js runtime and inline theme bootstrap script (or move the bootstrap to a nonce).
- Run `npm run build` locally to catch type/build errors.

### Search returns no results

- Natural-language search is intentionally constrained. Try a supported event type,
  location, date preset, duration, attention level, caregiver rule phrase, or quoted
  keyword.
- If the interpreter cannot map the request, it asks for clarification instead of
  guessing or returning arbitrary records.
- Searches only cover records retained in this browser.

---

## Limitations

This is a demonstration, not a validated safety, security, medical, or caregiving product.

- **All events are synthetic.** There is no Ring connection, camera feed, video, audio, or
  real observation.
- **No identity verification or biometrics.** A caregiver match is metadata-only and can
  be wrong.
- **No threat detection.** Rules and attention labels are configured heuristics and must
  not be used to judge people or make safety decisions.
- **AI can be wrong.** Llama 3.3 70B output is constrained and checked, but it can still
  be incomplete or misleading. The interface always labels its source and model.
- **No durable server history.** LocalStorage is per browser/profile and is not suitable
  for multi-user or audit use. There is no backup, sync, or export.
- **No push notifications.** “Notification preferences” shape rule labeling and in-app
  review; nothing is sent to a phone or email.
- **No authentication or authorization.** Anyone with the deployment URL can use its
  browser-local demo.
- **Rate limits are per instance** and not a production abuse control.
- **The live Groq endpoint was not exercised in this environment** (no real API key).
  The HTTP path was verified end-to-end against a local mock of the OpenAI-compatible API
  (`GROQ_BASE_URL`); key validity, model access, live rate limits, and real latency must
  still be confirmed in your deployment (Settings → Test connection).
- **Model availability changes.** `llama-3.3-70b-versatile` was current when this was
  written. Re-check Groq’s model and pricing documentation before relying on it.
- **Accessibility and responsive behavior** are implemented and covered by semantic and
  jsdom checks, but no formal WCAG audit or real-device matrix has been performed.
- **No browser visual regression testing** is included.

---

## Project structure

```text
app/
  api/
    ai/analyze|summary|insights|search/route.ts   Server-side Groq routes
    demo/route.ts                                 Simulated seed endpoint
    events/route.ts                               Simulated ingestion boundary
    health/route.ts                               Configuration health
  dashboard/
    page.tsx                                      Overview
    timeline/                                     Searchable event history
    insights/                                     AI contextual insights
    caregiver/                                    Caregiver activity
    settings/                                     Configuration and demo data
  globals.css                                     Design tokens and primitives
  layout.tsx                                      Fonts, theme bootstrap, providers
components/
  ai/            Summary card and source notice
  brand/         Logo and wordmark
  dashboard/     Metrics, attention queue, chart, recent activity, method card
  events/        Simulator, event rows, detail dialog, badges
  layout/        Sidebar, header, mobile nav, demo dialog, app shell
  providers/     Theme, app state/persistence, providers
  ui/            Accessible Radix/Tailwind primitives
lib/
  ai/            Groq client, prompts, schema hints, guardrails, fallback, service
  analytics/     Deterministic facts, overview stats, chart data
  api/           Fetch client and API response helpers
  constants/     Event vocabulary, settings, search, AI configuration
  events/        Rules, simulator, seed, search interpreter/executor, storage, digests
  integrations/  Ring adapter boundary (simulated only)
  security/      Body limits/errors and in-memory rate limiting
  storage/       Safe localStorage wrappers
  utils/         Dates, formatting, ids, class names
  validation/    Zod schemas for domain, API, and model output
tests/           Vitest domain, API, validation, fallback, and UI tests
types/           Shared TypeScript domain types
```

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run `tsc --noEmit` in strict mode. |
| `npm test` | Run all Vitest suites once. |
| `npm run test:watch` | Run Vitest in watch mode. |

---

**RingCare AI is a demonstration of calm, grounded smart-home awareness.** If you extend it
toward real integrations, begin with the safety, consent, storage, and authorization work
in [Limitations](#limitations) and [Deploying to Vercel](#deploying-to-vercel) rather than
connecting a camera directly.
