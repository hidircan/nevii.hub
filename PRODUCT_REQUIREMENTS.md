# Nevii Hub — Product Requirements Document

**Status:** Approved by Sentinel review — PRODREQ-F1 resolved (R1 exit criteria → 27 tests). Part of the Nevii Hub Engineering Handbook.
**Owner:** Orion (Product Owner)
**Sources of truth:** README.md, PRODUCT_ROADMAP.md, PRODUCTION_AUDIT.md, src/lib/auth (RBAC), src/lib/seed.ts, sprint planning docs
**First customer (reference):** Nilüfer Acar Müzik Akademisi — İzmir (2 branches: Erzene, Evka 3)

---

## 1. User Roles

Roles are enforced end-to-end by RBAC (`src/lib/auth/rbac.ts`) and are embedded in the
JWT (`src/lib/auth/types.ts`). The role is the single source of authorization; the
tenantId in the JWT is the single source of tenant scoping.

| Role | Code | Access | Key permissions |
|---|---|---|---|
| Platform Super Admin | `SUPER_ADMIN` | Cross-tenant | Everything + `tenant:all` |
| School Admin | `SCHOOL_ADMIN` | Own tenant | Full school operations + `demo:reset` |
| Teacher | `TEACHER` | Own tenant, own scope | Attendance, makeup, schedule, messages |
| Parent | `PARENT` | Own tenant, own child scope | Read students, balance, schedule |
| AI Agent | `AI_AGENT` | Own tenant, tool-gated | All operational tools (15), no `tenant:all`, no `demo:reset` |

**Access channels:** Web panel (`/panel`, school staff), Parent portal (`/veli`),
Teacher portal (`/ogretmen`), REST API v1, AI Assistant (chat), WhatsApp (inbound webhook),
Workflow engine (autonomous AI_AGENT).

## 2. Personas

### P1 — Okul Sahibi (Business Owner)
Music school owner/manager, runs 1–3 branches. Cares about cash flow, attendance
(lesson revenue leakage), teacher utilization, and not losing students to churn.
**Pain:** manually chasing overdue tuition, no visibility into make-up lessons or
teacher occupancy. **Definition of value:** money collected, lessons retained.

### P2 — Okul Yöneticisi / Operasyon (School Administrator)
Daily operator: schedules, attendance, make-up planning, WhatsApp comms, payment
follow-up. Time-poor, non-technical. **Pain:** administrative overhead, error-prone
manual tracking. **Definition of value:** a single screen that closes the daily loop.

### P3 — Öğretmen (Teacher)
Teaches multiple students/instruments across branches. **Pain:** schedule conflicts,
no-shows. **Definition of value:** clear schedule, simple attendance marking, make-up
rights handled automatically.

### P4 — Veli (Parent)
Pays tuition, cares about the student's progress and being informed. **Pain:** no
visibility into missed lessons or make-up planning, payment reminders arriving late.
**Definition of value:** timely, polite, personal communication; trust.

### P5 — Öğrenci (Student)
Receives lessons. Indirect user — represented by parent and teacher. **Definition of
value:** lessons happen, progress is visible.

### P6 — AI Asistan (AI Agent)
Operates on behalf of the school with bounded autonomy: drafts messages, opens
collection follow-up cases, proposes make-up slots, prepares reminders. **Constraint:**
human approval before any outbound communication; full audit trail.

## 3. Business Processes

### BP1 — Student lifecycle
Enrollment (student + instrument + teacher + branch) → schedule → attendance →
make-up credit accumulation → payment obligations → possible churn/lost.

### BP2 — Attendance → make-up credit (`/panel/yoklama`)
Each lesson is marked `present | absent | cancelled_by_school | no_show`.
`absent` / `cancelled_by_school` with `createsMakeupCredit=true` grants a make-up right.
**Demo flow (README):** mark "Gelmedi (+telafi)" → credit appears in make-up center.

### BP3 — Make-up planning (`/panel/telafi`, makeup-engine)
Open make-up requests are matched to available slots by branch + teacher + room
scoring (`src/lib/makeup-engine.ts`). Admin or AI proposes the best slot → human
confirms/cancels → parent is notified.

### BP4 — Payments & collections (ödemeler + AI Tahsilat Asistanı)
Payments have status `paid | overdue | partial` (plus due date / paid amount / method).
The AI Tahsilat Asistanı turns overdue/partial payments into **follow-up cases**
(`draft → approved → sent → replied → paid | lost`) with a generated WhatsApp draft.
Human approval is required before sending; marking a payment paid closes open cases
and attributes ROI (`getCollectionRoi`).

### BP5 — Notifications (`/panel/bildirimler`)
Template-based WhatsApp messages (wa.me deep links in MVP) for make-up created,
payment reminders, lesson reminders. Human review before send (agent messages).

### BP6 — AI-assisted operations
School staff converse with the AI Assistant (chat/stream); the agent executes RBAC-gated
tools. Recurring jobs run on the workflow engine (6 workflows; e.g. payment_reminders,
makeup_suggestions). A planner adds guard-railed execution steps.

## 4. Functional Requirements

Priorities: **M** = MVP/must, **S** = should (near-term), **C** = could (later).

### Domain modules
| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Manage students, teachers, rooms, branches, instruments under a tenant | M |
| FR-02 | Manage weekly schedules (lesson × student × teacher × room × branch) | M |
| FR-03 | Mark attendance per lesson and grant make-up credit on qualifying absences | M |
| FR-04 | Propose and confirm make-up slots via the scoring engine | M |
| FR-05 | Track payments (status, due date, paid amount, method, description) | M |
| FR-06 | Generate WhatsApp message drafts from templates and deep-link send (wa.me) | M |
| FR-07 | Provide parent portal: child schedule, balance, communication | S |
| FR-08 | Provide teacher portal: own schedule, attendance, make-up rights | S |
| FR-09 | Multi-branch operation within one tenant (per-branch rooms/lessons) | M |

### AI & automation
| ID | Requirement | Priority |
|---|---|---|
| FR-10 | AI Assistant chat with streaming and tool execution (15 tools, RBAC-gated) | M |
| FR-11 | Tahsilat (collections) agent: overdue/partial intake → draft case → approval → send → closure | M |
| FR-12 | Collection ROI: monthly attributed amount + resolved/active case counts | M |
| FR-13 | Workflow engine: scheduled autonomous jobs, tenant-scoped, persistent state | M |
| FR-14 | Scoped memory (conversation / user / tenant / workflow) + vector search | S |
| FR-15 | Planned, guard-railed execution (planner) for multi-step agent tasks | S |
| FR-16 | WhatsApp inbound webhook → agent drafts a reply for human approval | C |

### Platform
| ID | Requirement | Priority |
|---|---|---|
| FR-17 | Multi-tenant isolation on every data path (`tenantId` from JWT only) | M |
| FR-18 | JWT auth (access + refresh) with role-based authorization on all API routes | M |
| FR-19 | REST API v1 with validated inputs (zod) and consistent `ServiceResult` envelope | M |
| FR-20 | Persistence abstraction: `STORE_MODE=json | db | memory` with behavior parity | M |
| FR-21 | Audit log of sensitive/agent actions | S |
| FR-22 | AI metrics, logs, and dashboard (billing/observability foundation) | S |

## 5. Non-Functional Requirements

| ID | Category | Requirement (measurable) |
|---|---|---|
| NFR-01 | Performance | Panel pages and API routes respond < 300 ms p95 on reference hardware; make-up engine < 200 ms for a branch's open requests. |
| NFR-02 | Scalability | Stateless API; all persistent state in the DB store so N serverless instances operate safely. JSON/memory modes are demo-only. |
| NFR-03 | Security | No tenant can read/write another tenant's data (verified by tests); secrets never in source; webhook endpoints verify signatures; rate limiting on public endpoints. |
| NFR-04 | Availability | No single process holds state; workflow runs survive restart (DB-backed). |
| NFR-05 | Observability | Every request has a `requestId`; AI agent actions and errors are logged with tenant/user attribution. |
| NFR-06 | Data integrity | Payments and follow-up case closures are consistent; case status transitions are idempotent and auditable. |
| NFR-07 | Maintainability | TypeScript strict; shared `ServiceResult`; store abstraction; documented conventions (see Engineering Handbook). |
| NFR-08 | Accessibility | Parent/teacher portals reach WCAG 2.1 AA; keyboard navigable; contrast and label requirements enforced. |
| NFR-09 | Privacy (KVKK) | Data retention / delete flow for tenant data; PII handling documented (AI memory PII redaction planned). |
| NFR-10 | Testability | Core logic covered (engine, ROI, RBAC, agent executor); CI runs lint + typecheck + prisma validate + tests + build. |

## 6. User Stories & Acceptance Criteria

### US-01 — Attendance to make-up credit (P3, P2) · M
As a **teacher**, I want to mark attendance and have make-up credit granted automatically
so I do not track rights manually.
- **AC-01:** Marking `absent` or `cancelled_by_school` with `createsMakeupCredit=true`
  creates exactly one make-up right; duplicate marks do not double-credit.
- **AC-02:** `present` marks never grant credit.

### US-02 — Make-up proposal (P2, P4) · M
As a **school administrator**, I want the best available make-up slot proposed
(branch + teacher + room scored) so the decision is fast and fair.
- **AC-03:** For every open request, the engine returns at least one valid slot when one
  exists (compatible branch/teacher/room, no overlap).
- **AC-04:** Confirming a slot allocates it; no double-booking with existing lessons.

### US-03 — Payment tracking (P2) · M
As a **school administrator**, I want payment statuses tracked so overdue amounts are
visible at a glance.
- **AC-05:** Payments reflect `paid | overdue | partial` from due date / paid amount.
- **AC-06:** Risk totals on the collections screen equal the sum of overdue + partial.

### US-04 — Collections agent intake (P1, P2) · M
As a **school administrator**, I want overdue/partial payments to appear automatically
as draft follow-up cases with a ready WhatsApp draft so I don't hunt for debtors.
- **AC-07:** Daily intake opens a `draft` case (non-empty message draft) for each
  overdue/partial payment with no open case; idempotent — never two open cases per payment.
- **AC-08:** `paid` / `lost` cases are never reopened.
- **AC-09:** Intake is tenant-scoped; a tenant only ever opens cases for its own payments.
- **AC-10:** Intake behaves identically in `json` and `db` modes.

### US-05 — Human-approved send (P2, P4) · M
As a **school administrator**, I want to approve, edit, and send the agent's message
draft so parents are contacted professionally and nothing is sent without consent.
- **AC-11:** Draft → approved → sent → replied → paid/lost transitions work from the panel.
- **AC-12:** The "WhatsApp'ta aç" action is disabled until a case is approved.
- **AC-13:** Marking the payment paid closes open cases and attributes ROI.

### US-06 — Collection ROI (P1) · M
As the **business owner**, I want to see the agent's monthly collection contribution
so I can justify the subscription.
- **AC-14:** ROI = sum of `attributedAmount` for cases `paid` with `resolvedAt` this month.
- **AC-15:** Active/resolved case counts match the case store exactly.

### US-07 — AI assistant with tools (P2) · S
As a **school administrator**, I want to ask the assistant questions that run real,
permission-checked operations so routine work is faster.
- **AC-16:** Every tool execution checks the requester's role; denied actions return a
  clear error and are audited.
- **AC-17:** Assistant responses stream in chat; failures surface a useful message.

### US-08 — Multi-tenant safety (P1, P2, all) · M
As any **user**, I want to see only my school's data.
- **AC-18:** All data reads/writes scope by JWT `tenantId`; cross-tenant access is
  rejected at the API and store layers (covered by tests).

### US-09 — Demo reset (P2, P1) · S
As a **school administrator**, I want to reset demo data in one click for sales demos.
- **AC-19:** Reset restores the seeded demo dataset and clears tenant state; requires
  `demo:reset` permission (not available to `AI_AGENT`, `PARENT`, `TEACHER`).

## 7. MVP Scope (first paying customer)

**In MVP (per Faz 1 — first paying customer):**
- Core domain: students, teachers, schedules, attendance, make-up, payments, templates.
- Collections agent loop: intake → draft → approval → send → closure → ROI.
- Tenant isolation + JWT/RBAC + REST API v1.
- Parent & teacher portals (responsive, accessible).
- CI + automated tests for core logic.
- Persistent DB store for all tenant state (production multi-instance safe).
- Sales demo pack: one-click reset + guided scenario.

**Out of MVP (roadmap later phases):**
- Billing/subscriptions, payment gateway (iyzico/Stripe)
- Real WhatsApp Business API send (Meta) — MVP uses wa.me deep links
- Onboarding wizard, PWA/push, OpenAPI spec
- Voice agent, agent marketplace, white-label, SSO/SCIM

## 8. Release Plan

| Release | Scope | Exit criteria |
|---|---|---|
| **R0 (done)** | Next.js skeleton + demo data | Demo scenario works locally |
| **R1 (done)** | Domain modules, JWT/RBAC, multi-tenant core, REST v1, AI assistant + tools, workflows | CI + 27 tests green (5 files); audit baseline documented |
| **R2 (current sprint)** | Collections agent autonomous intake (daily workflow), queue + ROI verification | AC-07..15 verified; no destructive migration; lint/typecheck/test/build green |
| **R3 — First paying customer** | DB-backed persistence complete for all state, MariaDB/MySQL integration tests in CI, onboarding pack, pilot at 3 İzmir schools | ≥1 paying tenant; case study with measurable collection ROI |
| **R4 — Scale** | PostgreSQL/pgvector, rate limiting, webhook signature verification, Sentry/alerting | Production readiness ≥ 80%; enterprise security baseline |
| **R5 — Platform** | Billing (plan + quota), onboarding wizard, real Meta WhatsApp, second vertical | Self-serve signup + automated revenue |

## 9. Feature Prioritization

Ranked by business impact / effort (RICE-style), current date 2026-07-31:

| Rank | Feature | Impact | Effort | Priority |
|---|---|---|---|---|
| 1 | Collections agent autonomous intake (Sprint 2) | High | Small | **Must** |
| 2 | DB-backed persistence for all state (finish Critical #3) | High | Medium | **Must** |
| 3 | DB integration tests in CI (MariaDB/MySQL) | High | Medium | **Must** |
| 4 | Rate limiting + WhatsApp webhook signature validation | High | Small | **Should** |
| 5 | Onboarding flow (15-min school setup) | High | Medium | **Should** |
| 6 | Billing v1 (plan + quota + payment link) | High | Large | **Should** |
| 7 | Sentry + error alerting | Medium | Small | **Should** |
| 8 | Memory PII redaction + retention/TTL (KVKK) | Medium | Medium | **Should** |
| 9 | OpenAPI spec + API documentation | Medium | Medium | **Could** |
| 10 | PWA + push notifications | Medium | Medium | **Could** |
| 11 | Make-up planner agent (AI slot suggestion + parent approval msg) | Medium | Medium | **Could** |
| 12 | Workflow → durable queue + dead-letter | Medium | Medium | **Could** |
| 13 | Voice agent, agent marketplace, SSO/SCIM, white-label | Low | Large | **Won't (short-term)** |

## 10. Explicit Non-Goals (short-term)

- Voice agent, multi-agent collaboration marketplace, general-purpose RAG.
- Building for scale before the first paying customer is proven.
- Scope creep beyond the approved sprint goal in any single sprint.

---

*This document is part of the Nevii Hub Engineering Handbook and is subject to the
unified review performed by Sentinel before being considered canonical.*
