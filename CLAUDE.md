# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The import above pulls in the full multi-agent engineering pipeline (Orion → Atlas → Prisma →
Nova → Helios → Forge → Sentinel) that governs how work is scoped, reviewed, and committed in
this repo — read it before making non-trivial changes. `PROJECT.md` is the canonical source of
truth for product/business context (mission, roadmap, pricing) if that's ever needed; it is not
duplicated here.

**Before starting any non-trivial task, read `docs/agent-memory/PROJECT_STATE.md`** (cheap,
low-token "resume from here" snapshot of current focus and open work) **and
`docs/agent-memory/LESSONS_LEARNED.md`** (mistakes already made and corrected — don't repeat
them). Update `PROJECT_STATE.md`'s "Current focus"/"Open work" at the end of a work session, and
append to `LESSONS_LEARNED.md` when a real mistake is found and fixed.

## Commands

```bash
npm run dev              # next dev — http://localhost:3000
npm run build             # prisma generate (prebuild) + next build
npm run typecheck         # tsc --noEmit
npm run lint               # eslint
npm test                   # vitest run — full suite (src/lib/__tests__/**/*.test.ts)
npx vitest run <path>       # a single test file, e.g. src/lib/__tests__/makeup-engine.test.ts
npx vitest run <path> -t "<name>"   # a single test by name within a file
npx prisma validate        # validate prisma/schema.prisma
npx prisma generate         # regenerate the Prisma client (also runs automatically as `prebuild`)
npx prisma migrate status   # check applied/pending migrations against the target PostgreSQL DB
npx prisma migrate deploy   # apply pending migrations — staging only, after explicit approval (see below)
```

**Staging PostgreSQL migration flow** — `db push` is not the day-to-day path (that was true for a
legacy MySQL/MariaDB setup this project no longer uses; see below). The controlled flow is:
`prisma validate` → `prisma generate` → `prisma migrate status` → (only for an approved staging
target) `prisma migrate deploy`. Never run `migrate deploy`/`db push`/`db reset` against
production from an agent session without explicit, per-run human approval naming the target
environment.

**Validation gate before considering any change done** (in this order, per `AGENTS.md` §6):
`npm run typecheck` → `npm run lint` → `npm test` → `npx prisma validate` → `npm run build`.

**Test gotcha:** `vitest.config.mts` sets `fileParallelism: false` — every test file shares the
same on-disk `STORE_MODE=json` store (`/tmp/notaplan-data/store.json` in CI, `./data` locally),
so running files in parallel produces flaky cross-test data corruption. Don't try to work around
this; it's intentional. Tests always run with `STORE_MODE=json`, `VERCEL=1`.

**No `.env.example`** exists yet — copy the vars referenced in `src/lib/config.ts`,
`src/lib/auth/config.ts`, and `src/lib/ai/config.ts` (`STORE_MODE`, `DATABASE_URL`, `JWT_SECRET`,
`AI_PROVIDER` + per-provider API keys) into a local `.env`/`.env.local`.

## Architecture

Nevii Hub is a Next.js 16 (App Router) + React 19 + TypeScript, multi-tenant SaaS for music
schools, with an AI agent layer that is architecturally *forced* through the same authorization
path as every human-driven request — there is no AI-only shortcut to the database.

### Layered pipeline (the one rule that matters most)

```
UI (panel / portals)              REST API v1 (withApiHandler)
        │                                │
        ▼                                ▼
  Service / Tool layer  ─────────►  Agent Runtime (executeAgentTool)
  (business ops, RBAC)               (Tool Registry → guards → execute)
        │                                │
        ▼                                ▼
  Store layer (readData / cases / workflows)  ◄──  LLM Orchestrator (plan → execute → narrate)
        │                                          │
        ▼                                          ▼
  Prisma (PostgreSQL, @prisma/adapter-pg) · JSON/memory   LLM providers (Gemini/Groq/NVIDIA NIM/Cerebras/heuristic)
```

**Every business action — human or AI — goes through `src/lib/services/tools.ts` (the Tool
Layer).** Tool functions are the *only* place that reads/writes the store; nothing else does.
`src/lib/agent/registry.ts` (`TOOL_REGISTRY`) wraps each tool function with a `zod` input schema
and a `requiredRoles` list, and is the single source of truth consumed by both the REST API
(`src/app/api/v1/agent/execute`) and the LLM tool-calling path (`src/lib/agent/index.ts`
`executeAgentTool`). Adding a new AI-callable capability means adding a tool function + a
registry entry, not writing bespoke AI-side DB access.

### Multi-tenancy — the security boundary

- Every row belongs to exactly one tenant (`tenantId`). Tenant identity comes **only** from the
  authenticated session/JWT, never from client input.
- `AsyncLocalStorage` (`src/lib/tenant-context.ts`, `runWithTenantAsync`) carries `tenantId`
  through an entire request; API handlers (`src/lib/api/handler.ts`, `withApiHandler`) establish
  it before the handler body runs.
- `readData()` (`src/lib/store.ts`) resolves its tenant from ALS first, then the web session,
  falling back to `DEFAULT_TENANT_ID` only for public/demo contexts — this fallback is
  intentionally narrow; don't widen it.
- **"Kurum" (institution) selector is a layer above raw tenancy**, not a replacement for it:
  `SUPER_ADMIN` can view a **read-only, merged** view across multiple kurumlar
  (`src/lib/institution/context.ts`, `getInstitutionContext` + `readScopedData`), but every
  *write* still resolves to exactly one tenant and is blocked in the merged "all kurumlar" view.
  Nearly every `/panel/*` page follows the same shape: `requireSessionContext()` →
  `getInstitutionContext(session)` → `readScopedData(kurum.scope)` → render, with a
  `<KurumScopeNote>` when in merged view.
- `STORE_MODE` (`json` / `db` / `memory`, `src/lib/config.ts`) selects the backend, but all three
  must implement identical tenant-filtered behavior — "mode parity" is a hard requirement, not
  an implementation detail. `json`/`memory` effectively run single-tenant; real cross-tenant
  isolation is only observable under `STORE_MODE=db` with 2+ real `Tenant` rows (see README's
  "Multi-Tenant Demo" walkthrough for the seed script and manual verification steps).

### Auth & RBAC

JWT access/refresh cookies verified in `src/middleware.ts` (route guard for `/panel`, `/veli`,
`/ogretmen`) and again per-request in `src/lib/auth/*` (`authenticateRequest`, `assertPermission`).
Roles: `SUPER_ADMIN | SCHOOL_ADMIN | TEACHER | PARENT | AI_AGENT` (`src/lib/auth/types.ts`).
`SUPER_ADMIN` bypasses role gates by design. Entity-level scoping (e.g. "can this PARENT see
this specific student") is enforced separately in `src/lib/services/context.ts`
(`canAccessStudent`/`canAccessTeacher`), not by role alone.

### AI platform

Three execution surfaces share the same Tool Layer/Agent Runtime:

1. **Interactive chat** — `src/lib/ai/orchestrator.ts` (`runChatTurn`/`streamChatTurn`, SSE
   streaming via `/api/v1/chat/stream`). Single-shot per turn: the LLM plans tool calls once,
   the runtime executes them, the LLM narrates — there is no multi-step agentic re-planning loop
   within a turn, which matters when designing a new capability (a tool that needs a lookup
   *then* an action must do both internally, in one call, rather than assuming the model can
   chain two separate tool calls together).
2. **Autonomous workflows** — `src/lib/workflows/*` (6 scheduled jobs; `engine.ts` ticks them,
   every step is a tool call through the same runtime).
3. **Headless tool execution** — `/api/v1/agent/execute`, for any future channel (WhatsApp,
   voice, MCP).

**Provider chain** (`src/lib/ai/provider-chain.ts`, `config.ts`, `provider-bridge.ts`): `auto`
mode tries Gemini → Groq → NVIDIA NIM → Cerebras → heuristic, in that fixed order, skipping any
provider with a missing/blank key and never retrying a provider after an auth/key failure
(`isAuthConfigError`); heuristic (`providers/heuristic.ts`, keyless, regex-based intent
detection) is the deterministic final fallback and is always "configured". Gemini needs its own
JSON-schema sanitization (`providers/gemini.ts`) because its function-calling schema is a
restricted JSON Schema subset — don't touch that without re-reading why. Two independent
single-provider resolvers exist and are meant to stay in the same order:
`getProviderConfig()`/`getLlmProvider()` (chat orchestrator, and `describeIdentity()`'s
deterministic "hangi modelsin" answer) and `resolveChainProviderConfig()`/`resolveLiveProvider()`
(the capability fallback chain in `provider-bridge.ts`).

**Capability policy layer** (`src/lib/ai/capabilities.ts`, `plan-invocation.ts`) is distinct from
the chat orchestrator: each named capability (e.g. `collectionsMessageDraft`) declares
`allowedRoles`, `requiresApproval`, and a `preferredProvider`, and `planAiInvocation` fails closed
on missing tenant/role before anything runs. Anything that sends an external message
(`collectionsMessageDraft` and friends) drafts only — a human approves before send; this is a
non-negotiable product rule (`PROJECT.md` §8.3), not just a UI convention.

**Global AI assistant UI** (`src/components/ai/*`) is a floating, draggable popup — never a
docked side-panel or fullscreen takeover — mounted once in the root layout
(`AssistantProvider`/`GlobalAssistant` in `src/app/layout.tsx`) so it persists across
client-side navigation. Pages register "what this page is about" via
`<AssistantPageContext entity={...} />` (a thin wrapper over `useAssistantEntity`), which drives
context-aware quick-action prompts — it does not inject hidden context into the LLM prompt.

**Memory Layer** (`src/lib/ai/memory/*`) is scoped (conversation/user/tenant/workflow) with
pluggable vector storage (pgvector/Qdrant/file) and embedding providers — separate from, and not
required to understand, the provider chain above.

### Store abstraction

`STORE_MODE` env var picks one of three backends behind the same `StoreApi`
(`src/lib/store.ts`, `store-json.ts`, `store-db.ts`, `store-memory.ts`): `json` (file-backed,
local dev/tests/demo), `db` (Prisma → PostgreSQL via `@prisma/adapter-pg`, production), `memory` (in-process, seeded on
cold start, serverless demo without disk). On Vercel/Lambda, `json` mode writes to `/tmp`, not
the repo (`resolveDataDir`). The AI platform's own persistence (follow-up cases, workflow
state/runs, conversations, memory) follows the same per-mode parity contract.

### Notable conventions

- Turkish is the primary UI/UX language and much of the in-code commentary (variable/domain
  names are still English: `Student`, `Teacher`, `Lesson`, `Payment`, `MakeupRequest`). Don't be
  surprised by Turkish strings and comments mixed with English identifiers — that's the norm
  here, not an inconsistency to "fix".
- Portals: `/panel` (admin/staff, has `Sidebar`), `/ogretmen` (teacher, own layout, no shared
  chrome with `/panel`), `/veli` (parent, same), `/makbuz/[paymentId]` (printable receipt).
  Only `src/app/layout.tsx` (root) and `src/app/panel/layout.tsx` exist as shared layouts — the
  other portals render their own header directly in the page.
- `ServiceResult<T>` (`src/lib/services/result.ts`, `ok`/`fail`) is the uniform return shape for
  every service/tool function; API routes convert it via `fromServiceResult`
  (`src/lib/api/http.ts`). Don't throw from a tool for an expected failure — return `fail(...)`.
- **Every error a user can see must be a clear Turkish sentence stating the real cause and how
  to fix it** (owner rule, 2026-09-15 — one of the product's most important requirements). Never
  surface raw/technical text ("Invalid or expired access token", stack/Prisma messages) or a
  vague "İşlem başarısız." when the cause is known; name the conflicting values/field and the
  screen where it is fixed. Client fetches use `friendlyApiErrorMessage`
  (`src/lib/api/friendly-error.ts`) for auth codes and must retry once after
  `/api/v1/auth/refresh` on `UNAUTHORIZED` (access token TTL is 15 min).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
