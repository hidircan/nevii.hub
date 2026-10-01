# DATABASE_ARCHITECTURE.md

> ⚠️ **2026-10-01'den beri güncel değil:** canlı DB `wsbucznpujcfzhitzrbl`; `vxzewyiwfshobjizzetw` gerçek veri
> taşıyan salt-okunur geri dönüş kaynağıdır (test hedefi DEĞİL); `uqkafczrplqitzumtrqy` artık erişilebilir değil.
> Güncel model ve ortam haritası: `docs/operations/LOCAL_FIRST_DEPLOYMENT.md`.

**Nevii Hub Engineering Handbook — Data Architecture**

| | |
|---|---|
| **Owner** | Prisma (Data Architecture) |
| **Audience** | All engineers, AI coding assistants, DBA/on-call operators |
| **Status** | Draft · awaiting independent review by Sentinel before it becomes part of the official Engineering Handbook |
| **Last validated** | 2026-07-31 · HEAD `f2fe8d83` (schema & deps unchanged since `0cab45d`) |
| **⚠️ Düzeltme (2026-08-31)** | Bu belgenin altındaki "MySQL/MariaDB" anlatısı ARTIK YANLIŞ. `prisma/schema.prisma` (`provider = "postgresql"`), `package.json` (`@prisma/adapter-pg`, mariadb bağımlılığı YOK) ve `src/lib/db.ts` (`PrismaPg` adapter) koddan DOĞRULANDI: proje PostgreSQL kullanıyor — canlı veritabanı Supabase Postgres 17 (`db.uqkafczrplqitzumtrqy.supabase.co`, proje adı Supabase panelinde hâlâ eski "Maestron Project" — kozmetik, yeniden adlandırılabilir). §1, §2, §7.4, §15, §18 aşağıda düzeltildi. §8/§9/§13'teki MySQL'e özgü ayrıntılar (mysqldump, MariaDB CI vb.) henüz tek tek doğrulanmadı — Postgres için DevOps tarafından yeniden gözden geçirilmeli, DOĞRULANMADI olarak işaretli bırakıldı. `PROJECT.md` §12 ve `DEVOPS_GUIDE.md` de AYNI eski MySQL varsayımını taşıyor — bu belge düzeltilirken onlar HENÜZ düzeltilmedi, bkz. `docs/project-brain/KNOWN_GAPS.md`. |

This document is the canonical reference for how Nevii Hub models, persists, migrates, queries, and protects its data. It is written to optimize for **long-term scalability**: a clean, tenant-isolated core that survives from one pilot school to thousands of schools.

---

## 1. Scope and Reality Check (düzeltildi 2026-08-31)

**Repo'nun güncel gerçeği: PostgreSQL**, Prisma üzerinden (`provider = "postgresql"`, `@prisma/adapter-pg`), production'da **Supabase** üzerinde barındırılıyor, hosting/deploy **Vercel**. Bu belgenin önceki hali "mevcut gerçeklik MySQL/MariaDB" diyordu — bu artık DOĞRU DEĞİL; § 15'te anlatılan geçiş zaten TAMAMLANMIŞ (ne zaman/nasıl yapıldığı bu taramada doğrulanmadı, yalnızca BUGÜNKÜ hedef durum doğrulandı).

1. **Bu belge artık PostgreSQL gerçeğini belgelemeli** — MySQL'e özgü anlatılan bölümler (§ 2 tablosu, § 7.4, § 15, § 18) aşağıda düzeltildi. Kalan bazı MySQL'e özgü ayrıntılar (§ 8/§ 9/§ 13 içindeki mysqldump/EXPLAIN gibi araç-spesifik cümleler) henüz tek tek Postgres için yeniden doğrulanmadı — DOĞRULANMADI etiketiyle bırakıldı, DevOps/Helios tarafından ayrı bir geçişte tamamlanmalı.
2. `PROJECT.md` §12 ve `DEVOPS_GUIDE.md` hâlâ eski MySQL varsayımını taşıyor olabilir — bu belgeyle senkron değiller, ayrı düzeltme gerektiriyor (bkz. `docs/project-brain/KNOWN_GAPS.md`).

Multi-tenant kurallar, migration/transaction/backup sözleşmeleri dialekt-bağımsızdır ve bu belgenin geri kalanında halen geçerlidir.

---

## 2. Persistence Layer Overview

| Concern | Current state |
|---|---|
| ORM | **Prisma 7.8.x** with **`@prisma/adapter-pg` 7.9.1** (driver adapter, no `DATABASE_URL` literal in schema) — DOĞRULANDI (`src/lib/db.ts`, `package.json`) |
| Dialect | **PostgreSQL** (`provider = "postgresql"`), `datasource db` in `prisma/schema.prisma` — DOĞRULANDI |
| Hosting | **Supabase** (production Postgres, `db.uqkafczrplqitzumtrqy.supabase.co`, Postgres 17, `ap-southeast-1`) · **Vercel** (app hosting/deploy) — DOĞRULANDI via Supabase/Vercel proje kayıtları, bu belgede önceden yoktu |
| Config | `prisma/prisma.config.ts` — schema path + `DATABASE_URL` from env (Prisma 7 config split) |
| Runtime selection | `STORE_MODE` in `src/lib/config.ts`: `json` (file demo) · `db` (Postgres/Supabase, production) · `memory` (in-process demo) |
| Client wiring | `src/lib/db.ts` — lazy `PrismaClient` + `PrismaPg` adapter (`@prisma/adapter-pg`, `pg` pool); only constructed in `db` mode — DOĞRULANDI |
| Migration tooling | `prisma/migrations/` — **60 committed migration klasörü DOĞRULANDI** (bu belgenin önceki "no committed migrations" iddiası YANLIŞTI) |
| Schema size | Bu taramada yeniden sayılmadı — DOĞRULANMADI, orijinal "14 models, 317 lines" iddiası güncel şemaya karşı tazelenmeli |
| Vector memory | Optional `pgvector-store.ts` connects directly to a Postgres URL for AI semantic memory — artık operasyonel DB ile AYNI ailede (ikisi de Postgres), ayrı dialekt değil |

### 2.1 Store-mode parity (hard contract)

`json` / `db` / `memory` must behave identically for the same operation. File stores are demo-only: `src/lib/store-db.ts` (operational data), `src/lib/workflows/state.ts` (workflow state/runs), `src/lib/tahsilat/cases.ts` (follow-up cases) all branch on `isDbMode`. A feature that only works in one mode is not done. Production **must** run `STORE_MODE=db`.

> **Accepted debt:** `src/lib/store.ts` `withTenantScope` and `src/lib/store-db.ts` `tenantId()` (line 21, used by `readData`) both fall back to `DEFAULT_TENANT_ID` when no tenant context exists. In `db` mode the correct behavior is *fail closed* — a missing tenant context must not silently read the default tenant. Mutations already fail closed via `requireTenantId()`; reads do not. See § 18 (Gap DB-3).

---

## 3. Data Model

### 3.1 Entity map

| Model | PK | Tenant-scoped | Notes |
|---|---|---|---|
| `Tenant` | `id` cuid | — (the boundary) | `slug @unique`, `active` |
| `User` | `id` cuid | ✅ | `@@unique([tenantId, email])`; `passwordHash` (bcrypt), never plaintext |
| `School` | `id` cuid | ✅ | `@@unique([tenantId])` → **one school per tenant, enforced** |
| `Branch` | `id` (app-generated) | ✅ | belongs to `School` |
| `Teacher` | `id` (app-generated) | ✅ | belongs to `School` + `Branch` |
| `Student` | `id` (app-generated) | ✅ | belongs to `School` + `Branch`; primary `Teacher` |
| `Room` | `id` (app-generated) | ✅ | belongs to `Branch` + `School` |
| `Lesson` | `id` (app-generated) | ✅ | `student/teacher/room/branch/school`; `type`, `status`, `startAt/endAt` |
| `Attendance` | `id` cuid | ✅ | `lessonId @unique` (1:1 lesson→attendance) |
| `MakeupRequest` | `id` cuid | ✅ | `attendanceId @unique`; lifecycle `pending→suggested→confirmed/cancelled` |
| `Payment` | `id` (app-generated) | ✅ | `amount`/`paidAmount` as **Int (whole TL)**; `status` |
| `PaymentFollowUpCase` | `id` (app-generated) | ✅ | Tahsilat cases; `@@index([tenantId, status])` |
| `WorkflowState` | `id` | ❌ **known gap** | per-workflow singleton; **missing `tenantId`** (Sentinel High finding) |
| `WorkflowRun` | `id` (app-generated) | ✅ | run history; `@@index([workflowId, tenantId, startedAt])` |

### 3.2 Prisma conventions (rules for this repo)

1. **Model names:** PascalCase, singular, one word (Prisma default). **Field names:** camelCase. **Relation fields:** lowercase plural (`students Teacher[]`).
2. **Every tenant-owned model** carries `tenantId: String` + a relation to `Tenant` with `onDelete: Cascade` (§ 5).
3. **IDs:** `@default(cuid())` on auth/platform models (`Tenant`, `User`, `Attendance`, `MakeupRequest`). Core operational entities (`Branch`, `Teacher`, `Student`, `Room`, `Lesson`, `Payment`, `PaymentFollowUpCase`, `WorkflowState`, `WorkflowRun`) use **app-generated IDs** (e.g., `stu_…`, `tch_…`, `case_…`). Prefer cuid going forward — see Gap DB-8.
4. **Timestamps:** `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` on mutable models. This is **not applied uniformly** today (§ 18, DB-7); new models must include both.
5. **Enums:** business statuses are stored as `String` (MySQL native enums are migration-fragile). Status sets are centralized in `src/lib/types.ts` and re-validated at the service layer (zod) and in `store-db.ts` mapping casts.
6. **Money:** **`Int`, whole Turkish lira** (`amount`, `paidAmount`, `monthlyFee`). Never floats. If sub-lira precision or multi-currency reporting becomes necessary, move to `Decimal` behind a migration (Gap DB-9).
7. **Flexible data:** `Json` columns for genuinely unstructured payloads only — `School.workingDays`, `Teacher.instruments`, `Teacher.availability`, `Student.instruments`, `MakeupRequest.suggestedSlots`, `WorkflowRun.steps`. JSON is **not indexable**; anything you must filter/sort belongs in a real column (Gap DB-5).
8. **Comments:** document non-obvious models/fields with `///` doc comments (`Tenant`, `User`, `WorkflowState`, `PaymentFollowUpCase` follow this; the rest don't yet — add as touched).
9. **Booleans for lifecycle:** soft-lifecycle flags are booleans (`Tenant.active`, `User.active`, `Teacher.active`, `Student.active`), **not** soft-delete timestamps (§ 10).

---

## 4. Multi-Tenancy

> **Tenancy is the security boundary.** Every row belongs to exactly one tenant; tenant identity comes from the authenticated session, never from client input.

### 4.1 Data model

- Every tenant-owned model carries `tenantId` + `Tenant` relation with `onDelete: Cascade`.
- Composite uniqueness is tenant-scoped: `@@unique([tenantId, email])` on `User`.
- Tenant-first composite indexes serve tenant-scoped reads (§ 8).
- `School @@unique([tenantId])` enforces **one school per tenant** at the constraint level — an intentional MVP simplification (one tenant = one school); revisit before multi-branch school groups become a product requirement.

### 4.2 Context propagation

- `AsyncLocalStorage` (`src/lib/tenant-context.ts`) carries `tenantId` through the request.
- API handlers wrap execution in `runWithTenantAsync(tenantId, …)` (`src/lib/api/handler.ts`).
- `requireTenantId()` throws when context is missing or `"public"` — used by all `store-db.ts` **mutations**.
- Web-session fallback exists in `src/lib/store.ts` (`withTenantScope`); in `db` mode the demo default must be removed (Gap DB-3).

### 4.3 Two access paths, one rule

- **Web/API:** JWT claims contain `tenantId`; `buildServiceContext` derives it from the verified token.
- **Store layer:** tenant resolved from ALS or the authenticated web session; mutation paths use `requireTenantId()`.
- **Agents:** tool execution enforces `requiredRoles` + `ctx.tenantId` (`src/lib/agent/*`); the agent never supplies its own tenant.

### 4.4 Tenant-first query rule

Every Prisma `find*`/`update*`/`delete*` on a tenant-owned model **must** include `tenantId` in its `where`. The codebase already models this pattern (e.g., `updateMany({ where: { id, tenantId: tid } })` in `store-db.ts`). Code review treats a missing tenant predicate as a High-severity bug.

---

## 5. Foreign Keys and Referential Integrity

- **Tenant cascade:** all tenant relations use `onDelete: Cascade` — deleting a `Tenant` removes its entire data graph. For a production multi-tenant SaaS this is dangerous as a runtime path; deletion should be a controlled, audited operation (§ 10, § 11).
- **School cascade:** `Branch`, `Teacher`, `Student`, `Room`, `Lesson`, `Attendance`, `MakeupRequest`, `Payment` all cascade from `School`. Because `Teacher → Branch`, `Student → Branch/Teacher`, `Room → Branch`, `Lesson → Branch` are **required relations with default `RESTRICT`**, the multi-path cascade graph on `School` delete is subtle: a school delete must satisfy the child RESTRICT constraints while deleting them. This works today only because every child of a school belongs to that school's own branches. **Do not introduce cross-school relationships without auditing the cascade graph** (Gap DB-6).
- **`Lesson.makeupRequestId`** and **`MakeupRequest.confirmedLessonId`** are **logical references without FK constraints** — referential integrity is not enforced between lessons and their makeup requests. Restore real relations (with `@relation`) so the DB, not just the app, guarantees consistency (Gap DB-2).
- **`Attendance.lessonId @unique`** and **`MakeupRequest.attendanceId @unique`** correctly enforce the 1:1 invariants (one attendance per lesson; one makeup request per attendance).

---

## 6. Transactions

### 6.1 Rules

1. **Multi-statement business operations are atomic.** Any operation that performs >1 write (or a read-then-write that must not race) uses `prisma.$transaction`.
2. **Prefer interactive transactions** for read-modify-write flows: `$transaction(async (tx) => { … })` — the callback form allows using the transaction client (`tx`) for every statement.
3. **Keep transactions short.** Never hold a transaction across an LLM call, an external HTTP call, or a long computation. Agent tool executions that need atomicity must precompute all inputs, then run a fast transaction.
4. **No transaction nesting.** Guard against calling a transactional function inside another transaction (MySQL doesn't nest; Prisma interactive transactions can't be entered twice).
5. **Idempotency for autonomous jobs.** Workflows are designed check-then-create with DB-level guarantees where warranted; duplicate side effects are bugs (see `recordWorkflowRunDb`, which wraps run-insert + state-upsert in one `$transaction`).

### 6.2 Current usage (verified)

| Site | Form | Correct? |
|---|---|---|
| `seedDatabase` (`store-db.ts`) | Array form `$transaction([…deleteMany])` | ✅ atomic teardown |
| `recordWorkflowRunDb` (`workflows/state.ts`) | Array form: run insert + state upsert | ✅ atomic state+history |
| `markAttendance` (`store-db.ts`) | Sequential writes: lesson status → attendance upsert → makeup cleanup → makeup create | ❌ **not atomic** — a failure mid-way leaves inconsistent state (Gap DB-1) |
| `confirmSlot` (`store-db.ts`) | Lesson create → makeup request update | ❌ not atomic (Gap DB-1) |
| `setWorkflowEnabledDb` | read → upsert (non-transactional) | ⚠️ acceptable for a toggle; move to upsert-only when the tenant gap is fixed |

---

## 7. Migrations

### 7.1 Current state

- Only `db:push` exists (`package.json` scripts). There is **no `prisma/migrations/` directory** and no committed migration history.
- `db:push` is acceptable for local dev/staging only. **It is never acceptable for production** — it can drop or alter data without review, and it is not replayable.

### 7.2 Target workflow (adopt `prisma migrate`)

1. **Develop:** `npx prisma migrate dev --name <descriptive>` creates a migration + regenerates the client locally.
2. **Review:** the generated SQL is reviewed like code — check it against § 5 (FK/cascade) and § 8 (indexes) before it ships.
3. **Commit:** migrations live in the repo (`prisma/migrations/`) and are part of the PR.
4. **CI gate:** fail a PR that changes `prisma/schema.prisma` without a committed migration (Helios `DEVOPS_GUIDE.md` §4.2 agrees).
5. **Apply:** production migrations run **before or with** the app deploy, never after new code queries new columns. One-at-a-time, with `prisma migrate deploy` in the release pipeline (not in a request handler).

### 7.3 Migration safety rules (non-negotiable)

- **No destructive migrations.** Never write a migration that drops a table or a column, deletes data, or breaks the rollback path without a two-phase plan (add → backfill → switch → drop in a later release).
- **Expand-and-contract for risky changes:** add the new column/table in release N, backfill + dual-write, then switch reads in N+1, then drop the old path in N+2.
- **Data backfills are reviewed:** an `UPDATE` over a production table runs in batches, not one giant statement.
- Every schema change keeps `npx prisma validate` green (PROJECT.md §14 validation gate).

### 7.4 Dialect change (tarihsel — TAMAMLANDI)

Proje `"mysql"`'den `"postgresql"`'e ZATEN geçti (bkz. § 15, düzeltilmiş). Bu bölüm artık ileriye dönük bir plan değil, geçmiş bir geçişin notudur — geçişin ne zaman/hangi commit'te yapıldığı bu taramada doğrulanmadı.

---

## 8. Indexing

### 8.1 Principles

1. **Every tenant-scoped query has a tenant-first index.** The leading column of any hot index is `tenantId` (or the tighter `schoolId`/`branchId` when the query is scoped that way).
2. **Index the `WHERE`, then `ORDER BY`, then `SELECT` (covering).** Composite indexes follow that order.
3. **No filesort scans at scale.** Dashboard and calendar reads are the first places to check.
4. **JSON columns are not indexable** — don't try to index inside `Json`; promote to a column (Gap DB-5).

### 8.2 Verified index coverage (HEAD `f2fe8d83`)

| Model | Present |
|---|---|
| `User` | `@@unique([tenantId, email])` · `@@index([email])` · `@@index([tenantId])` ✅ |
| `School` | `@@unique([tenantId])` ✅ |
| `Branch` | `@@index([tenantId])` · `@@index([schoolId])` ✅ |
| `Teacher` | `@@index([tenantId])` · `@@index([schoolId])` ✅ |
| `Student` | `@@index([tenantId])` · `@@index([schoolId])` ✅ |
| `Room` | `@@index([tenantId])` ✅ |
| `Lesson` | `@@index([tenantId])` · `@@index([schoolId])` ⚠️ no time-range index |
| `Attendance` | `@@index([tenantId])` ⚠️ no `[schoolId]`, no `[studentId]` |
| `MakeupRequest` | `@@index([tenantId])` · `@@index([sourceLessonId])` ⚠️ no status/expiry index |
| `Payment` | `@@index([tenantId])` ⚠️ no `[tenantId, status]`, no `[studentId]` |
| `PaymentFollowUpCase` | `@@index([tenantId, status])` · `@@index([paymentId])` ✅ |
| `WorkflowRun` | `@@index([workflowId, tenantId, startedAt])` · `@@index([tenantId, startedAt])` ✅ |
| `WorkflowState` | PK only (will change with the tenant fix, Gap DB-4) |

### 8.3 High-value additions (backlog, as data grows)

| Query | Missing index |
|---|---|
| Calendar/program by day | `Lesson @@index([tenantId, startAt])` (or `[schoolId, startAt]`) |
| Attendance lookup by student | `Attendance @@index([studentId])` (+ `status`) |
| Makeup-expiry sweep job | `MakeupRequest @@index([status, expiresAt])` |
| Dashboard: overdue/partial payments | `Payment @@index([tenantId, status])` |
| Active-entity counts | `Student @@index([tenantId, active])`, `Teacher @@index([tenantId, active])` |

Add these with a migration, not with `db:push`, when the relevant query is proven hot. Premature indexes cost writes and storage on MySQL (each index is a B-tree maintained on every write).

---

## 9. Constraints

| Kind | Current practice |
|---|---|
| **Uniqueness** | `Tenant.slug @unique`; `User @@unique([tenantId, email])`; `School @@unique([tenantId])`; `Attendance.lessonId @unique`; `MakeupRequest.attendanceId @unique` |
| **Not-null** | All core business fields are required in the schema; `String?`/`DateTime?` reserved for genuinely optional data |
| **Check constraints** | Not used. Statuses are `String` validated at the service layer (zod) + Prisma client. MySQL 8.0.16+/MariaDB 10.2.1+ support `CHECK`; consider adding `CHECK (status IN (…))` only if DB-level integrity becomes necessary — do not duplicate the full status enum in two places |
| **Referential** | See § 5 — cascade policy is defined per relation; missing FKs are tracked (Gap DB-2) |
| **Naming** | Constraint/index names come from Prisma by default; do not rename without a documented reason |

---

## 10. Soft Deletes

**Not implemented — by design, and it stays that way for now.**

- Lifecycle is expressed with **`active` boolean flags** (`Tenant`, `User`, `Teacher`, `Student`) and **status lifecycles** (`MakeupRequest`, `Payment`, `PaymentFollowUpCase`). "Removed" entities are deactivated, not deleted.
- **Hard deletes** exist only where semantics demand them: `seedDatabase` tears down a tenant's demo data (`deleteMany`), and `markAttendance` clears stale makeup requests on re-mark.
- **Do not add `deletedAt` to every table as a knee-jerk.** Soft delete has real costs: every query must filter `deletedAt IS NULL`, every unique constraint must become partial/derived, and cross-table integrity gets fuzzier. Adopt it **only** for tables that need point-in-time recovery or audit-driven retention (typically `Payment` and audit rows).
- **KVKK/right-to-erasure tension:** soft deletes and "right to be forgotten" conflict. Plan a **hard-purge job** (offline, batch, audited) that physically removes rows after the legal retention window (see `PRODUCTION_AUDIT.md` memory/KVKK backlog).

---

## 11. Audit Logs

### 11.1 Current state

`src/lib/auth/audit.ts` defines `auditLog(event)` but its body is **intentionally empty** (a hook; `AUDIT_LOG_DEBUG=1` prints to stdout). There is **no audit table**. The `PaymentFollowUpCase` fields (`approvedBy`, `approvedAt`, `sentAt`, `resolvedAt`) and `WorkflowRun` history are the only durable audit-ish records today.

### 11.2 Target: `AuditEvent` table

When the hook becomes persistent, use a dedicated append-only table:

| Column | Notes |
|---|---|
| `id` | cuid |
| `tenantId` | nullable for platform events, otherwise required |
| `userId` / `userRole` | acting identity |
| `eventType` | `authz_denied` · `auth_error` · `tool_called` · `api_error` · `case_approved` · `case_sent` · `tenant_created` · `data_export` … |
| `resource` / `resourceId` | what was acted on |
| `requestId` | correlation with logs (already built in `withApiHandler`) |
| `outcome` | success/denied/error |
| `detail` | `Json` — redacted payload |
| `createdAt` | `@default(now())` |

Rules:

1. **Append-only:** no UPDATE/DELETE paths in application code. Retention is a scheduled purge job (window per legal/privacy policy, § 13).
2. **Tenant-scoped** like everything else; `tenantId` indexes `[tenantId, createdAt]` and `[userId, createdAt]`.
3. **Never log secrets, passwords, full message bodies, or token values.** Redact in the `detail` payload.
4. Audit rows are written **inside or immediately after** the action's transaction so an audited action can't exist without its audit record (Gap DB-1 is the prerequisite).

---

## 12. Performance Guidelines

### 12.1 The load-bearing problem

`readData()` (`src/lib/store-db.ts`) loads **an entire school's data graph** — school + branches + teachers + students + rooms + lessons + attendances + makeupRequests + payments — in one `include`, maps it to `AppData`, and dashboard stats are computed in JS from that in-memory snapshot. This is correct for one school with ~10² rows and **does not scale to thousands of schools with hundreds of students each.** It is the single most important scaling constraint.

**Guideline:** keep the snapshot path for the small-school MVP, but introduce **query-level projections** as the first scale investment:

1. **Dashboards** get aggregate SQL (`GROUP BY status`, `COUNT`, `SUM`) instead of a full-graph load.
2. **Lists** (lessons, payments, students) paginate with `take`/`skip` or keyset pagination — never `findMany` without a limit on production tables.
3. The **calendar** queries `Lesson` by time range with the `[tenantId, startAt]` index (§ 8.3), not a full load + in-memory filter.

### 12.2 Other rules

- **Connection pooling:** serverless (Vercel) runs many cold instances; MySQL/MariaDB has connection limits. Use a pooling layer / low max connections per instance / serverless-compatible credentials (same advice as `DEVOPS_GUIDE.md` §5.3). Prisma's `PrismaMariaDb` adapter pools per process — bound it.
- **`select` over `include` when you need a subset.** Full-graph `include` on every read is the default today; it must become the exception.
- **Batched writes:** use `createMany`/`updateMany` where atomicity allows; `seedDatabase` already does this for users.
- **No N+1s:** prefer a single `include`/`select` with relations over per-row queries (today's code is clean here; keep it that way).
- **JSON reads:** `JSON.parse(JSON.stringify(...))` round-trips on `Json` columns (`store-db.ts`) are correctness crutches for Prisma's JSON typing — fine, but avoid adding new ones on hot paths.
- **Explain before shipping a hot query.** MySQL `EXPLAIN` should show an index on the tenant predicate.

### 12.3 Autonomy workloads

- Workflow runs are bounded (`take: limit = 50`) ✅.
- `workflows/state.ts` file-mode caps runs at 500 ✅; apply the same bound mindset to any future unbounded history table.
- Long-running work belongs in the workflow engine, not in request handlers (per `DEVOPS_GUIDE.md` §5.3).

---

## 13. Backup Strategy

Aligned with `DEVOPS_GUIDE.md` §10 (Helios owns the operational runbook; this is the data-integrity contract).

| Requirement | Implementation |
|---|---|
| **Daily full** | `mysqldump --single-transaction` (or managed snapshot) off-host, daily |
| **Point-in-time** | DB provider binlog/PITR retention enabled; restores target a time, not just a dump |
| **Retention** | ≥ 14 daily, ≥ 8 weekly, ≥ 12 monthly (tune to privacy/legal policy) |
| **Encryption** | At rest and in transit; backups in a separate bucket/region from the primary |
| **Restore test** | Monthly restore into a throwaway instance + row-count sanity + app smoke test — a backup that has never been restored is a hope, not a backup |
| **KVKK/PII** | Tenant deletion path, documented retention, encryption/redaction for sensitive columns |
| **Rollback** | Schema-versioned restores: the migration version must be restored with the data, so app↔schema compatibility holds after a restore |

**Backup of file stores (`json` mode) is not a production backup.** It is a demo convenience. Production persistence is `STORE_MODE=db`; the DB backup strategy above is the only one that matters operationally.

---

## 14. Performance-at-Scale Target

| Dimension | Now | Target |
|---|---|---|
| Tenants | Single default tenant (`tenant_nilufer_acar`) | Thousands of schools, each isolated |
| State | `json` files + MySQL | All persistent state in MySQL now; Postgres path reserved (§ 17) |
| Query model | Full-graph `readData()` snapshot | Projections + aggregates + pagination (§ 12.1) |
| Autonomous jobs | Single-process tick; `WorkflowState` not tenant-scoped | Durable, per-tenant scheduling (Gap DB-4) |
| Concurrency | Stateless API ✅ | Multiple Vercel instances safe because state lives in the DB |
| Tests | File-mode unit tests (vitest) | MariaDB CI integration tests for store parity (Gap DB-10) |

Non-negotiables: **tenant isolation at every scale**, **statelessness** (shared nothing except the DB), **identical behavior** across store modes.

---

## 15. PostgreSQL Migration — TAMAMLANDI (düzeltildi 2026-08-31)

Bu bölüm önceden "ileride yapılacak plan" olarak yazılmıştı. **Artık geçmiş zaman**: operasyonel veritabanı ZATEN PostgreSQL/Supabase (§ 2 DOĞRULANDI). Aşağıdaki alt bölümler tarihsel referans olarak bırakıldı; ne zaman/nasıl uygulandığı bu taramada doğrulanmadı.

### 15.1 (tarihsel) Geçişi tetikleyen kararlar — artık geçerli değil, gerçekleşmiş durum

Orijinal tetikleyiciler (pgvector'ün ana bellek katmanı olması, MySQL ölçek sınırı, JSONB ihtiyacı) — hangisinin/hangilerinin fiilen gerekçe olduğu doğrulanmadı, sonuç aynı: proje Postgres'te.

### 15.2 (tarihsel) Geçiş adımları — referans, doğrulanmadı

Bu adımların (checksum doğrulama, freeze-sync-cutover, index yeniden doğrulama) fiilen bu şekilde uygulanıp uygulanmadığı DOĞRULANMADI — orijinal plan metni referans için korundu, DevOps geçmişiyle karşılaştırılmalı:

1. Her Prisma modeli, her `Json` kolonu, her index Postgres karşılığına eşlendi (`Json`→`Jsonb`, `DateTime`/`cuid` aynen taşındı) — DOĞRULANMADI.
2. `provider = "postgresql"`, adapter `@prisma/adapter-pg` — DOĞRULANDI (bugünkü kod).
3. Kesme/senkron/cutover süreci nasıl yürütüldü — DOĞRULANMADI.
4. Index'lerin Postgres'e göre yeniden doğrulanması (GiST/HNSW/BRIN/expression index) — DOĞRULANMADI, § 8 prensipleri (tenant-first) hâlâ geçerli.
5. Point-in-time recovery `pg_dump`/WAL tabanlı mı kuruldu — DOĞRULANMADI, § 13/DEVOPS_GUIDE ile birlikte DevOps tarafından teyit edilmeli.

### 15.3 Bugün kodda var olan

`src/lib/ai/memory/vector/pgvector-store.ts` bağımsız bir vektör deposu — artık operasyonel DB ile AYNI Postgres ailesinde (ayrı dialekt değil, ayrı bir bağlantı/şema olabilir, bu taramada ayrımı doğrulanmadı). Tenant-kapsamlı, yalnızca AI bellek embedding'leri için kullanılıyor.

---

## 16. Operational Checklist (data layer)

- [ ] Every tenant-owned query includes `tenantId` in `where`.
- [ ] Multi-write operations are inside `$transaction` (Gap DB-1 closed).
- [ ] No `db:push` on production; migrations committed + reviewed (§ 7).
- [ ] No destructive migration without a two-phase plan.
- [ ] Hot queries have tenant-first indexes (§ 8.3) and no filesort scans.
- [ ] Backups configured, encrypted, retention set, restore-tested monthly (§ 13).
- [ ] `WorkflowState` tenant-scoped (Gap DB-4).
- [ ] Audit hook wired to a persistent, append-only, tenant-scoped table (§ 11).
- [ ] `db` mode fails closed on missing tenant context (Gap DB-3).

---

## 17. Known Gaps and Accepted Debt

Tracked for the next sprints; **owned by Prisma, severity-graded like security findings.**

| ID | Severity | Gap | Fix |
|---|---|---|---|
| DB-1 | **High** | `markAttendance` / `confirmSlot` multi-writes not atomic | Wrap in interactive `$transaction`; write audit row in the same tx |
| DB-2 | **High** | `Lesson.makeupRequestId` / `MakeupRequest.confirmedLessonId` have no FK relation | Add `@relation`; enforce referential integrity |
| DB-3 | **High** | `store.ts` `withTenantScope` and `store-db.ts` `tenantId()` (line 21) fall back to `DEFAULT_TENANT_ID` when context is missing — `readData` can read the default tenant in `db` mode | Fail closed in `db` mode: reads and writes both require tenant context |
| DB-4 | **High** | `WorkflowState` not tenant-scoped (echoes Sentinel High finding) | Add `tenantId` + `@@unique([tenantId, id])` or per-tenant keys; migration |
| DB-5 | **Medium** | JSON columns unfilterable/indexable | Promote hot filters to real columns |
| DB-6 | **Medium** | Multi-path `School` cascade + required `RESTRICT` relations is subtle | Document cascade graph; audit before cross-school relations |
| DB-7 | **Medium** | `createdAt`/`updatedAt` inconsistent: absent on `Branch`, `Room`, `Lesson`, `Attendance`, `WorkflowRun`; `Student`/`MakeupRequest` have `createdAt` but no `updatedAt` | Add uniformly in a migration |
| DB-8 | **Low** | App-generated string IDs (`stu_…`) vs cuid inconsistency | Standardize on cuid for new models |
| DB-9 | **Low** | Money as `Int` (whole TL) | `Decimal` if sub-lira/multi-currency needed |
| DB-10 | **Medium** | No DB-mode integration tests; parity only file-mode tested | Postgres/Supabase CI integration tests (store parity) — düzeltildi 2026-08-31, önceki hali "MariaDB CI" diyordu |

---

## 18. Consistency Notes for Sentinel Review

Cross-checked against the sibling documents at `HEAD f2fe8d83` (schema/deps unchanged since `0cab45d`):

1. **DÜZELTME (2026-08-31):** bu maddenin orijinali "canonical dialect MySQL/MariaDB" diyordu — YANLIŞTI. Gerçek dialekt PostgreSQL/Supabase (§ 1, § 2 DOĞRULANDI). `PROJECT.md` §12 hâlâ eski ifadeyi taşıyor olabilir — bu belgeyle senkronize edilmedi, ayrı görev (bkz. `docs/project-brain/KNOWN_GAPS.md`).
2. **Migrations:** `DEVOPS_GUIDE.md` §11.3 (migrate adoption, never `db:push` in prod) matches § 7 here. The CI "fail PR without migration" gate appears in both (DEVOPS §4.2, here § 7.2). 60 migration klasörü DOĞRULANDI (§ 2) — "no committed migrations" iddiası da düzeltildi.
3. **`DEVOPS_GUIDE.md` §2.2** claims a local `.env` ships `DATABASE_URL="file:./dev.db"` (SQLite-style) for the demo path — bu belgede henüz düzeltilmedi, DevOps/Helios sahipliğinde ayrı görev.
4. **Multi-tenancy:** `PROJECT.md` §10, `AGENTS.md`, and this § 4 agree on ALS + tenant-first + `WorkflowState` known gap.
5. **Backups:** `DEVOPS_GUIDE.md` §10'daki mysqldump/PITR anlatısı Postgres için henüz yeniden doğrulanmadı (Supabase kendi otomatik backup/PITR mekanizmasını sağlıyor olabilir — bu taramada Supabase panelinden teyit edilmedi). DOĞRULANMADI.
6. **`WorkflowRun` tenant history** and `PaymentFollowUpCase` already persist in `db` mode; only `WorkflowState` and AI memory/metrics remain partially file-based in `db` mode (AI metrics persist to file even in `db` mode — see `DEVOPS_GUIDE.md` §9.2 and the PRODUCTION_AUDIT backlog).

---

## 19. Reference

- **Schema:** `prisma/schema.prisma` (14 models) · **Config:** `prisma/prisma.config.ts`
- **Client:** `src/lib/db.ts` · **Store selection:** `src/lib/config.ts`, `src/lib/store.ts`
- **DB store:** `src/lib/store-db.ts` · **Workflow state:** `src/lib/workflows/state.ts` · **Tahsilat cases:** `src/lib/tahsilat/cases.ts`
- **Tenant context:** `src/lib/tenant-context.ts` · **Auth:** `src/lib/auth/*` · **Audit hook:** `src/lib/auth/audit.ts`
- **Vector memory:** `src/lib/ai/memory/vector/pgvector-store.ts` (+ qdrant / file)
- **Companion handbook docs:** `PROJECT.md` (Atlas) · `AGENTS.md` (Forge) · `FRONTEND_GUIDELINES.md` (Nova) · `DEVOPS_GUIDE.md` (Helios) · `PRODUCT_REQUIREMENTS.md` (Orion) · `PRODUCTION_AUDIT.md`

---

*Owned by Prisma (Data Architecture). Changes require a PR + CI green + Sentinel review. Last validated 2026-07-31 at `HEAD f2fe8d83`.*
