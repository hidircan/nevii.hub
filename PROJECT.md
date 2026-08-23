# NotaPlan — Project

> **Canonical source of truth for every engineer and every AI coding assistant working on NotaPlan.**
> This document defines what NotaPlan is, why it exists, how it is engineered, and where it is going.
> Read it before touching the repository. Companion documents: `AGENTS.md` (roles & pipeline),
> `DATABASE_ARCHITECTURE.md` (Prisma), `FRONTEND_GUIDELINES.md` (Nova), `DEVOPS_GUIDE.md` (Helios),
> `PRODUCT_REQUIREMENTS.md` (Orion), `PRODUCT_ROADMAP.md`, `PRODUCTION_AUDIT.md`.
>
> *Status: draft · awaiting independent review by Sentinel before it becomes the official Engineering Handbook.*

---

## 1. Executive Summary

NotaPlan is an AI-first, multi-tenant SaaS platform that runs music schools: **scheduling,
attendance, makeup-lesson planning, tuition payments, WhatsApp parent communication, and
administrative portals**, with AI agents that automate the operational work a small school
owner does by hand every day.

The product is built around a single, defensible thesis (see `PRODUCT_ROADMAP.md`): a *vertical*
SaaS core that a school pays for because it runs the business, augmented by *AI agent add-ons*
that each solve a concrete, revenue-relevant problem (collections, makeup planning, reminders,
occupancy, parent secretary). The first pilot school — **Nilüfer Acar Müzik Akademisi** (İzmir) —
is live in the seed data and drives every product decision.

Technically, NotaPlan is a **Next.js 16 + React 19 + TypeScript** application on **Vercel-ready
serverless**, with **Prisma 7 (PostgreSQL, `@prisma/adapter-pg`)** persistence, a **tenant-scoped REST API (v1)**,
a **JWT + RBAC** authorization layer, and an **Agent Runtime** that exposes a guardrailed
tool registry (15 tools today) to an LLM orchestrator, a **Workflow Engine** (6 autonomous jobs),
and a **scoped Memory Layer** with optional vector storage.

**Current engineering posture:** core operational modules complete; CI + test core (vitest)
established; collections follow-up (AI Tahsilat Agent) becoming autonomous; production readiness
is being raised sprint by sprint (see `PRODUCTION_AUDIT.md`, currently ~45% production-ready and
~72% SaaS-complete). Billing, onboarding, rate limiting, persistent queueing, and full DB
integration testing are the known next investments.

---

## 2. Mission

> **Help music school owners stop drowning in operational admin so they can focus on teaching.**

Small music schools run on paper, spreadsheets, and WhatsApp threads. Lessons get missed,
makeup rights expire unused, tuition goes uncollected, and the owner is the only person who
knows what is actually happening. NotaPlan's mission is to give a small school the operational
back office of a large academy, at a price a small school can afford, without adding admin work
for teachers or parents.

The mission is *operational, not transactional*: NotaPlan does not merely record lessons and
payments — it closes loops (absent lesson → makeup right → scheduled makeup → parent notified)
and chases outcomes (overdue tuition → follow-up case → payment) autonomously.

---

## 3. Vision

NotaPlan becomes the **default operating system for small music schools**, and then the
**default vertical AI platform for skills academies**.

- **Short-term (0–6 months):** Every operational loop in a music school runs on NotaPlan.
  AI agents visibly collect tuition, protect revenue from missed lessons, and remind parents —
  with human approval before anything is sent.
- **Mid-term (6–18 months):** The AI agent line becomes a product of its own — each agent is a
  separately billable add-on that demonstrably improves a financial or retention metric.
- **Long-term:** The same multi-tenant core, workflow engine, and agent runtime are
  re-configured for adjacent verticals (dance, language, sports academies), and the platform
  is opened to let customers define their own agents ("Agent Studio") and connect external
  agents via MCP.

We deliberately do **not** chase a horizontal "AI agent platform" first: a vertical base with
paying customers is the prerequisite for a credible platform (see `PRODUCT_ROADMAP.md`, §2).

---

## 4. Product Philosophy

1. **Solve a revenue-relevant problem or don't build it.** Every feature must trace to money
   made or money lost (collections, churn, occupancy, utilization). This is the binding
   constraint on scope (roadmap rule, `PRODUCT_ROADMAP.md` §2).
2. **Humans approve, agents act.** Autonomous agents *prepare* (drafts, follow-up cases,
   reminders) and *recommend*; a human approves before any external communication is sent.
   Autonomy without an approval gate is a bug, not a feature.
3. **The agent's value must be measurable.** ROI is not vibes: the platform tracks whether an
   agent's work led to an outcome (e.g., a follow-up case that ended in a paid tuition) and
   reports it (ROI card, workflow run history).
4. **Match the school's existing mental model.** Teachers think in schedules; owners think in
   monthly fees and branches; parents think in "my child's lesson". The UI is organized around
   these, not around entities.
5. **Small is a feature.** A two-person school must be onboardable in minutes and usable from a
   phone. Complexity is deferred to the platform, never surfaced to the user.
6. **Demo first, production next.** The product supports a one-click demo dataset and
   store modes that let a sales demo run with zero infrastructure, while the same code paths
   scale to PostgreSQL-backed production (mode-parity is a hard requirement).

---

## 5. Business Goals

| Goal | Metric / KPI | Status |
|------|--------------|--------|
| First paying customer | ≥1 school paying for the AI add-on | Pilot phase |
| Revenue engine | Tiered subscription: Basic ~1.500₺/mo + AI Pack ~750₺/mo | Pricing defined, billing not built |
| Proof of value | Case study: collections accelerated, missed-lesson loss reduced | In progress (ROI tracking) |
| Repeatability | 3-school pilot in İzmir → 1 converted to paid within 30 days | Roadmap Faz 1 |
| Scale | 10+ schools, then second vertical (dance/language) | Roadmap Faz 2–3 |
| Platform | Agent Studio + MCP + white-label licensing | Roadmap Faz 4 (only after revenue) |

The monetization strategy is a ladder, not a pivot: **vertical SaaS → AI agent add-ons →
first paying customers + case study → vertical expansion → platform sale** (`PRODUCT_ROADMAP.md` §2).

---

## 6. Target Users

| Role | Who | What they need | Access surface |
|------|-----|----------------|----------------|
| **School owner / manager** | Runs the school, handles money & parents | One place for schedule, attendance, collections, messages; automation that saves hours | `/panel` (admin) |
| **Teacher** | Gives lessons, has a schedule | Their schedule, makeup assignments, what to teach | `/ogretmen` portal |
| **Parent** | Pays fees, manages child's lessons | Lesson schedule, makeup rights, payment status, communication | `/veli` portal |
| **AI Agent (system)** | Automates operational loops | Guardrailed tool access under RBAC, approval queues, observability | Agent Runtime / workflows |
| **Platform admin** | Runs the SaaS | Tenants, billing, platform-wide oversight | `SUPER_ADMIN` role |

Roles in code: `SUPER_ADMIN`, `SCHOOL_ADMIN`, `TEACHER`, `PARENT`, `AI_AGENT`
(`src/lib/auth/types.ts`). A user belongs to exactly one tenant.

---

## 7. Core Features

Operational core (all live):

- **Scheduling & program** — lessons, teachers, rooms, branches; working-hours rules
  (`src/app/panel/program`).
- **Attendance** — mark present/absent; an absence with reason creates a makeup right
  (`src/lib/makeup-engine.ts`).
- **Makeup center (Telafi)** — the differentiator: suggest slots using branch + teacher + room
  scoring, confirm, notify (`/panel/telafi`).
- **Payments** — tuition records, statuses (`paid | pending | overdue | partial`), partial
  payments, mark-paid flow (`/panel/odemeler`).
- **WhatsApp messaging** — templated parent/teacher messages with wa.me deep links and a
  message queue preview (`/panel/bildirimler`, `src/lib/whatsapp-templates.ts`).
- **Portals** — admin panel (`/panel`), parent (`/veli`), teacher (`/ogretmen`).
- **REST API v1** — tenant-scoped JSON API with zod validation and RBAC
  (`/api/v1/*`, `src/lib/api/handler.ts`).

AI platform (live):

- **AI Assistant chat** — streaming LLM chat that plans tool calls and executes them
  (`/panel/chat`, `src/lib/ai/orchestrator.ts`).
- **Agent Runtime + Tool Registry** — 15 RBAC-guarded tools; business actions go through
  tools only, never direct DB (`src/lib/agent/*`, `src/lib/services/tools.ts`).
- **Workflow Engine** — 6 autonomous scheduled jobs (`payment_reminders`, `lesson_reminders`,
  `attendance_followup`, `weekly_reports`, `teacher_utilization`, `makeup_suggestions`) with
  run history and per-tenant state (`src/lib/workflows/*`).
- **Memory Layer** — scoped memory (conversation / user / tenant / workflow) with optional
  vector storage (pgvector, Qdrant, or file) and multiple embedding providers
  (`src/lib/ai/memory/*`).
- **AI Tahsilat Agent** — collections follow-up: draft cases with message drafts, human
  approval → send → paid/lost resolution, ROI tracking (`/panel/ai/tahsilat-agent`,
  `src/lib/tahsilat/cases.ts`).
- **Observability** — AI metrics/logs dashboard, audit log, request IDs
  (`/panel/ai/logs`, `src/lib/ai/metrics.ts`).

---

## 8. AI-First Architecture

NotaPlan is AI-first by design, not by add-on. The architecture makes one guarantee:

> **Every business action the AI performs goes through the Agent Runtime's tool registry,
> which applies the same RBAC and tenant scoping as a human API call. No AI code path touches
> the database directly.**

### 8.1 Layered pipeline

```
UI (panel / portals)          REST API v1 (withApiHandler)
        │                            │
        ▼                            ▼
   Service / Tool layer ──────►  Agent Runtime (executeAgentTool)
   (business ops, RBAC)         (Tool Registry → guards → execute)
        │                            │
        ▼                            ▼
   Store layer (readData / cases / workflows)  ◄── LLM Orchestrator (plan → execute → narrate)
        │                                   │
        ▼                                   ▼
   Prisma (PostgreSQL, @prisma/adapter-pg) · JSON/memory    LLM providers (OpenAI / Grok / Gemini / local / heuristic)
```

### 8.2 The three AI execution surfaces

1. **Interactive chat** (`src/lib/ai/orchestrator.ts`): the LLM plans tool calls, the runtime
   executes them, the LLM narrates results. Supports streaming. Long-term memory is injected
   into the prompt.
2. **Autonomous workflows** (`src/lib/workflows/engine.ts`): scheduled jobs run on a per-tenant
   basis; every step is a tool call through the runtime; outcomes are recorded to run history
   and long-term workflow memory.
3. **Headless tool execution** (`/api/v1/agent/execute`): any future channel (WhatsApp, voice,
   mobile, MCP) can invoke the same runtime.

### 8.3 Guardrails (non-negotiable)

- Tools are the only DB access path for agents (`ToolDefinition.execute` "never touches DB").
- Every tool declares `requiredRoles`; `executeAgentTool` enforces them.
- Tenant scoping comes from the authenticated context (`ctx.tenantId`), never from the agent's
  request input.
- Tool inputs are validated (zod); denied/errored calls are logged as audit events.
- External communication is human-approved first (e.g., Tahsilat message drafts).

---

## 9. Multi-Agent Vision

### 9.1 Inside the product (agent products)

Each agent is a separate billable add-on with a named revenue/retention problem:

| Agent | Problem it closes | Status |
|-------|-------------------|--------|
| **AI Tahsilat Agent** | Overdue/partial tuition → follow-up cases → collected payment | v1 live, intake becoming autonomous |
| **AI Telafi Planlayıcı** | Missed lessons → unused makeup rights → churn | Engine ready, not yet an agent product |
| **AI Ders Hatırlatıcı** | Forgot lessons → absenteeism | Workflow ready |
| **AI Doluluk Optimize** | Empty teacher hours | `weekly_reports` / utilization tooling |
| **AI Veli Sekreteri** | Unanswered parent questions, 7/24 | WhatsApp webhook ready |

The roadmap rule is explicit: **no multi-agent collaboration until a single agent has paid
customers** (`PRODUCT_ROADMAP.md` §5).

### 9.2 Inside the engineering team (delivery pipeline)

NotaPlan is built by a fixed team of specialized AI agents operating in a strict review
pipeline — **Orion (product) → Atlas (architecture) → Prisma / Nova / Helios (independent
review) → Forge (implementation) → Sentinel (independent approval gate)**. Full role
definitions, decision authority, collaboration rules, and constraints are in `AGENTS.md`.
That document is vendor-neutral so the same pipeline works in Claude Code, Cursor, OpenCode,
Codex CLI, and future systems.

---

## 10. Multi-Tenant Philosophy

**Tenancy is the security boundary.** Every row belongs to exactly one tenant; tenant identity
comes from the authenticated session, never from client input.

- **Data model:** every Prisma model carries `tenantId` and a relation to `Tenant` with
  `onDelete: Cascade`. Composite uniqueness where required (e.g., `@@unique([tenantId, email])`
  on `User`).
- **Context propagation:** `AsyncLocalStorage` (`src/lib/tenant-context.ts`) carries
  `tenantId` through the whole request; API handlers wrap execution in
  `runWithTenantAsync(tenantId, …)` (`src/lib/api/handler.ts`).
- **Two access paths, one rule:**
  - *Web/API:* JWT claims contain `tenantId`; `buildServiceContext` derives it from the
    verified token.
  - *Store layer:* `readData()` resolves the tenant from ALS or the authenticated web session,
    falling back to `DEFAULT_TENANT_ID` for public/demo contexts (`src/lib/store.ts`).
- **Service context:** `ctx.tenantId` is documented as "always from JWT (or trusted web
  session) — never from client spoof" (`src/lib/services/context.ts`).
- **Mode parity:** `json`, `db`, and `memory` stores implement the same tenant-filtered
  semantics; the `db` mode adds composite indexes (`@@index([tenantId, …])`) to serve
  tenant-first query patterns.
- **Known gap, tracked:** `WorkflowState` is still tenant-less (Sentinel High finding); its
  scoping or PATCH/tick authorization restriction is queued as the next sprint's first High
  item.

---

## 11. High-Level Architecture

### 11.1 Request lifecycle (web)

```
Browser → Next.js middleware (route guard: /panel,/veli,/ogretmen)
  → route handler (withApiHandler)
      → authenticateRequest (JWT verify, access/refresh)
      → assertPermission (RBAC)
      → runWithTenantAsync(tenantId, handler)   [ALS]
          → Service/Tool layer (business ops)
          → Store layer (tenant-scoped)
          → Prisma / JSON / memory
      → ServiceResult envelope → JSON response
```

### 11.2 Request lifecycle (AI)

```
Chat / Workflow / external channel
  → Agent Runtime (executeAgentTool)
      → role + tenant checks
      → Tool Registry lookup (zod input validation)
      → Tool layer executes (same stores as the API)
      → outcome logged (audit + AI metrics + memory)
```

### 11.3 Store abstraction

`STORE_MODE` selects the backend (`src/lib/config.ts`):

| Mode | Backend | Use |
|------|---------|-----|
| `json` | local file (`./data`) or `/tmp/notaplan-data` on Vercel | demos, local dev, tests |
| `db` | Prisma → PostgreSQL via `@prisma/adapter-pg` (`DATABASE_URL`) | production persistence |
| `memory` | in-process seed | serverless demo without disk |

All three implement the same tenant-scoped `StoreApi`; the AI platform's own stores
(follow-up cases, workflow state/runs, conversations, memory) follow the same json/db parity.

### 11.4 AI platform internals

- **LLM provider abstraction** (`src/lib/ai/provider-factory.ts`, `ai/config.ts`): OpenAI,
  Grok/xAI, Gemini, local (OpenAI-compatible), heuristic fallback. `AI_PROVIDER=auto` picks the
  first configured real provider, else heuristic.
- **Planner** (`src/lib/ai/planner/*`): guardrailed execution-plan creation from LLM tool calls.
- **Retry** (`src/lib/ai/retry.ts`): bounded retry/backoff around LLM calls.
- **Metrics** (`src/lib/ai/metrics.ts`): per-turn/per-tool execution records with
  `billableUnits`, tenant and user attribution (billing foundation).
- **Memory** (`src/lib/ai/memory/*`): scoped retrieval (conversation/user/tenant/workflow),
  post-turn memory update, optional vector store (pgvector / Qdrant / file) + embedding
  providers.

---

## 12. Technology Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 16** (App Router, React 19) | Serverless-ready; middleware route guards |
| Language | **TypeScript 5** (strict) | `tsc --noEmit` as typecheck gate |
| Styling | **Tailwind CSS 4** + `clsx`/`tailwind-merge` | `@tailwindcss/postcss` |
| Persistence | **Prisma 7** + **`@prisma/adapter-pg`** (`pg` `Pool`), PostgreSQL | `prisma validate` + `prisma migrate deploy`; migration history under `prisma/migrations/` |
| Runtime stores | `json` / `db` / `memory` via `STORE_MODE` | Parity contract |
| Auth | **jose** (JWT access/refresh), **bcryptjs** password hashing | RBAC in `src/lib/auth/rbac.ts` |
| Validation | **zod** | API payloads + tool schemas |
| UI kit | **lucide-react** icons; custom `ui.tsx` primitives | See `FRONTEND_GUIDELINES.md` |
| Dates | **date-fns** (+ `tr` locale) | |
| Env | **dotenv** | Local `.env`; Vercel env vars in prod |
| Tests | **vitest** (node env, `STORE_MODE=json`, `VERCEL=1`) | `src/lib/__tests__/*.test.ts` |
| CI | **GitHub Actions** (`.github/workflows/ci.yml`) | lint + typecheck + test + build + prisma generate |
| Deploy | **Vercel** (framework preset) | `vercel.json`; `prebuild` runs `prisma generate` |

Versions are pinned in `package.json` (Next 16.2.10, React 19.2.4, Prisma 7.8.x,
@prisma/adapter-pg 7.9.1, Tailwind 4, vitest 4.1.10).

> Note: the canonical DB dialect is **PostgreSQL** (`prisma/schema.prisma` → `datasource db { provider
> = "postgresql" }`; runtime connects via `@prisma/adapter-pg` + `pg`, see `src/lib/db.ts`).
> **Legacy:** this project ran on MySQL/MariaDB earlier in its history — `DATABASE_ARCHITECTURE.md`
> and some older migration files still reflect that dialect and have not been updated; do not treat
> them as the current source of truth for the DB dialect.

---

## 13. Product Modules

| Module | Path | Responsibility | Status |
|--------|------|----------------|--------|
| Landing / pricing | `/` | Marketing, pricing reference | ✅ |
| Auth & sessions | `/login`, `src/lib/auth/*` | JWT, RBAC, session refresh | ✅ |
| Admin panel | `/panel` + `src/app/panel/*` | Dashboard, program, attendance, makeup, payments, messages, AI | ✅ |
| Makeup engine | `src/lib/makeup-engine.ts` | Slot suggestion scoring (branch+teacher+room) | ✅ |
| WhatsApp | `src/lib/whatsapp/*`, `src/lib/whatsapp-templates.ts` | Templated messages, webhook, phone mapping | ✅ |
| Store | `src/lib/store*.ts` | Tenant-scoped data access (json/db/memory) | ✅ |
| API v1 | `src/app/api/v1/*` | REST: agent, ai, attendance, auth, chat, health, makeup, messages, payments, students, tahsilat, teachers, tools, whatsapp, workflows | ✅ |
| Agent Runtime | `src/lib/agent/*` | Tool registry, execution, logging | ✅ |
| AI Orchestrator | `src/lib/ai/*` | Chat, providers, planner, retry, metrics, memory | ✅ |
| Workflows | `src/lib/workflows/*` | Registry, engine, state, runtime | ✅ |
| Tahsilat Agent | `src/lib/tahsilat/*`, `/panel/ai/tahsilat-agent` | Follow-up cases, ROI | ✅ (v1) |
| AI admin | `/panel/ai/*` | Dashboard, logs, memory UI | ✅ |
| Tests | `src/lib/__tests__/*` | vitest suite | ✅ (27 tests) |

---

## 14. Engineering Principles

1. **SOLID, DRY, KISS.** Small modules with single responsibilities; reuse the store and tool
   layers instead of duplicating logic; prefer the simplest correct design.
2. **Clean Architecture layering.** UI → API handler → service/tool → store → ORM. Higher
   layers never reach past the layer below; the AI never bypasses the tool layer.
3. **Tenant-first security.** Every query is tenant-scoped; tenant identity derives from auth,
   never from client input. Cross-tenant reads are treated as High-severity security bugs.
4. **Mode parity.** `json`, `db`, and `memory` stores must behave identically for the same
   operation. A feature that only works in one mode is not done.
5. **Idempotency and safety for automated jobs.** Autonomous workflows are designed
   idempotent (check-then-create; DB-level guarantees where warranted). Duplicate side effects
   are bugs.
6. **Observability by default.** Request IDs, audit log, AI metrics, workflow run history —
   every action is traceable.
7. **Scope discipline.** Sprints define explicit in-scope and out-of-scope file lists. Working
   tree outside the approved scope is never touched, even when dirty.
8. **Validation gate.** Before reporting completion: `npm run typecheck` → `npm run lint` →
   `npm test` → `npx prisma validate` → `npm run build` — in that order, and claims are
   attributed to the exact `HEAD`.
9. **Tests for behavior.** New behavior ships with tests; run the full suite for the package
   touched, never a scoped subset.
10. **No secrets in code.** `.env` is local-only; production secrets live in the deployment
    platform's secret store.

---

## 15. Security Principles

- **AuthN:** JWT access tokens (short TTL, default 15m) + refresh tokens (7d); passwords
  hashed (bcryptjs) — never plaintext. Issuer/audience pinned (`notaplan` / `notaplan-api`).
- **AuthZ:** RBAC roles (`SUPER_ADMIN | SCHOOL_ADMIN | TEACHER | PARENT | AI_AGENT`); every API
  route and every agent tool declares required roles; `SUPER_ADMIN` bypasses role gates by
  design. Denials are audited.
- **Tenant isolation:** ALS + JWT-derived `tenantId`; store filters always include the tenant.
  Security reviews treat cross-tenant leakage as critical.
- **Input validation:** zod schemas on API bodies and tool inputs; strict-mode objects reject
  unknown fields.
- **Audit trail:** `auditLog` records authZ denials and API errors with request ID, user,
  tenant, role, path, outcome.
- **AI guardrails:** agents cannot touch DB directly; external messages require human approval;
  tool calls are logged.
- **Known hardening backlog** (from `PRODUCTION_AUDIT.md`): rate limiting (missing), webhook
  signature verification (needs verification), CORS policy (undefined), refresh-token rotation
  (unclear), JWT/secret management moved out of plain `.env`, and an `.env.example`.
  These are prerequisites for public API/enterprise selling.

---

## 16. Scalability Goals

| Dimension | Current state | Target |
|-----------|---------------|--------|
| **Tenants** | Single default tenant (`tenant_nilufer_acar`) | Thousands of schools, each isolated |
| **Concurrency** | Stateless API; JSON/memory stores are single-process | All persistent state in DB; multiple Vercel instances safe |
| **Query patterns** | Tenant-first composite indexes present on major models | Index coverage for every tenant-scoped read/write; no filesort scans |
| **Autonomous jobs** | Single-process tick; workflow state not yet tenant-scoped | Durable, per-tenant scheduling with dead-letter handling |
| **AI cost** | Per-execution `billableUnits` recorded | Tenant-attributed budgets, rate limiting, token budgets |
| **Data** | JSON files + PostgreSQL (legacy: MySQL/MariaDB) | pgvector path for semantic search at scale |
| **Testing at scale** | File-mode unit tests (27) | PostgreSQL CI integration tests for store parity |

Key non-negotiables: **tenant isolation at every scale**, **statelessness** (shared nothing
except the DB), and **identical behavior** across store modes.

---

## 17. Long-Term Roadmap

### Faz 0 — Foundation (≈now, weeks 0–1)
- Commit uncommitted AI work (vector memory, planner, Tahsilat UI); move AI models to Prisma.
- Establish CI + test core as a permanent gate.

### Faz 1 — First paying customer (weeks 2–4)
- **AI Tahsilat Agent v2**: autonomous daily intake (overdue/partial → draft follow-up cases),
  ROI card showing agent contribution, human approval flow intact.
- One-click demo reset + sales scenario; 3-school İzmir pilot; convert ≥1 to paid.
- Pricing: Basic ~1.500₺/mo + AI Pack ~750₺/mo (50% pilot discount for first customers).

### Faz 2 — Proof and repeatability (months 1–2)
- Telafi Planlayıcı Agent (existing engine + AI slot suggestion + parent approval message).
- Veli Sekreteri v1 (WhatsApp inbound → AI reply draft → approval).
- Case study with real metrics; 15-minute onboarding wizard.

### Faz 3 — Scale (months 2–4)
- Second vertical (dance / language academy) on the same core.
- Real WhatsApp Business API (Meta) sending (replacing wa.me links).
- Billing: usage/kota-based AI pricing; self-serve signup + payment (iyzico/Stripe TR).

### Faz 4 — Platform phase (6+ months, revenue-gated)
- Agent Studio (customers define their own agents); MCP server for external agents;
  white-label licensing for education chains; optional voice agent only after vertical proof.

### Standing do-not list (short term)
No voice agent, no multi-agent collaboration, no agent marketplace, no general-purpose RAG —
until the vertical base has paying customers (`PRODUCT_ROADMAP.md` §5).

---

## 18. Document Governance

- **Owner:** Atlas (CTO). Reviewed by Sentinel before adoption; content changes go through the
  team pipeline like code.
- **Sibling docs** (each owned and reviewed this round): `AGENTS.md` (Forge),
  `DATABASE_ARCHITECTURE.md` (Prisma), `FRONTEND_GUIDELINES.md` (Nova), `DEVOPS_GUIDE.md`
  (Helios), `PRODUCT_REQUIREMENTS.md` (Orion). Sentinel produces a consolidated Engineering
  Documentation Review Report.
- **Living source:** this document reflects the repository at `HEAD 0cab45d` and the approved
  Sprint 2 scope (AI Tahsilat intake). Update it when architecture decisions land.
