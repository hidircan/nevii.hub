# DEVOPS_GUIDE.md

**Nevii Hub Engineering Handbook — Operations & Deployment**

| | |
|---|---|
| **Owner** | Helios (DevOps) |
| **Audience** | All engineers, AI coding assistants, on-call operators |
| **Status** | Official handbook section |
| **Last validated** | 2026-07-31 · HEAD `0cab45d` |

This guide is the canonical reference for how Nevii Hub is built, deployed, operated, and recovered. Follow it in every environment: local development, CI, preview, and production.

---

## 1. Principles

1. **Production = `STORE_MODE=db`.** The `json`/`memory` stores exist for demos and tests only. Never run a customer-facing deployment on a file or in-memory store.
2. **Secrets never live in the repo.** All secrets come from the environment or a secret manager. `.env` is for local dev only and is gitignored.
3. **CI must pass before merge.** `lint` → `typecheck` → `prisma generate` → `test` → `build` gate every PR.
4. **Every deploy is reproducible.** A clean `npm ci` from `package-lock.json` must produce the same artifact.
5. **Deployments are immutable and reversible.** Prefer full-app redeploys over in-place mutation; keep the previous deploy available for rollback.
6. **Observability is a feature.** Every production incident must be visible through logs, metrics, and alerting before a customer reports it.
7. **Everything is tested and documented.** If it isn't in CI, it isn't proven; if it isn't in this guide, it isn't operational knowledge.
8. **Change is small, reviewed, and committed.** No long-lived feature branches, no direct pushes to `main`, no uncommitted production config.

---

## 2. Local Development

### 2.1 Prerequisites

- **Node.js ≥ 22** (LTS). Current CI uses `22.x`; Vercel runtime uses `24.x`. Keep both compatible — do not use Node-only APIs that differ across 22/24.
- **npm ≥ 10**. The project uses `npm` exclusively (lockfile `package-lock.json`).
- **No global tooling required.** `next`, `prisma`, `tsx`, `vitest` are all project devDependencies.

### 2.2 First-time setup

```bash
cd notaplan
npm ci                       # reproducible install from lockfile (use npm ci, not npm install)
cp .env.example .env         # then fill local values (see §7)
npm run dev                  # http://localhost:3000
```

> **`.env.example` does not exist yet** — it is backlog item #1 (§13). Until it ships, create `.env` from the inventory table in §7.1. The repo's committed `.env`-adjacent config is not committed at all (`.env*` is gitignored); do not rely on a template that is not in the tree.
>
> Local demo runs with `STORE_MODE=json` (persists to `./data/`, gitignored) — **not** SQLite. A `DATABASE_URL` starting with `file:` is rejected by `src/lib/db.ts` (it throws; the provider is MySQL/MariaDB). Only set `DATABASE_URL` when running `STORE_MODE=db` with a real `mysql://…` connection string (see §7.4).
>
> **`prisma.config.ts`** (repo root) feeds the Prisma **CLI** (`db push`/`migrate`/`validate`) a datasource URL from `DATABASE_URL` — required under Prisma 7 because `prisma/schema.prisma`'s own `datasource` block has no `url` (the *app* connects via an explicit driver adapter in `src/lib/db.ts`, not the schema URL). Without this file, `npx prisma db push` fails with "The datasource.url property is required in your Prisma config file" — if you hit that error, check this file exists and `DATABASE_URL` is set in your shell.

### 2.3 Store modes (local)

| Mode | Env | When to use |
|------|-----|-------------|
| `memory` | `STORE_MODE=memory` | Fastest demo, cold-start seed, zero persistence |
| `json` | `STORE_MODE=json` | Default demo; persists to `./data/` (gitignored) |
| `db` | `STORE_MODE=db` + `DATABASE_URL` | Local parity with production |

The mode is selected at runtime by `src/lib/config.ts`. Tests run in `json` mode with isolated temp data files — never against your dev database.

### 2.4 Common commands

```bash
npm run dev          # Next.js dev server
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run build        # production build (runs prisma generate via prebuild)
npm start            # serve production build
npx prisma validate  # validate schema
npx prisma generate  # regenerate client after schema change
npm run db:push      # sync dev DB schema (non-production only, see §8.4)
```

---

## 3. Docker

> **Current state:** Nevii Hub deploys to Vercel today and has no committed `Dockerfile`. Docker is the recommended path for self-hosting, Railway, and local DB parity.

### 3.1 When to use Docker

- **Local services**: run MySQL/MariaDB, Redis, and supporting services via `docker compose` instead of installing them on the host.
- **Self-host / Railway / managed containers**: an immutable, multi-stage image is the deployment unit.
- **NOT on Vercel**: Vercel builds from source. Do not attempt to run a Docker image on Vercel.

### 3.2 Recommended `Dockerfile` (multi-stage, when adopted)

```dockerfile
# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

For `output: "standalone"` support you must set it in `next.config.ts` (see §10 backlog). The multi-stage image keeps the final artifact small and runnable without source or `node_modules`.

### 3.3 `docker-compose.yml` (local services, when adopted)

```yaml
services:
  db:
    image: mariadb:11
    environment:
      MARIADB_DATABASE: notaplan
      MARIADB_USER: notaplan
      MARIADB_PASSWORD: notaplan
      MARIADB_ROOT_PASSWORD: root
    ports: ["3306:3306"]
    volumes:
      - db-data:/var/lib/mysql

volumes:
  db-data:
```

### 3.4 Docker rules

- Multi-stage builds only; never ship `node_modules` or source in the runner stage.
- Run containers as a non-root user.
- `NEXT_TELEMETRY_DISABLED=1` in all stages.
- Pin base images to a major version (`node:22-alpine`), not floating `latest`.
- `.dockerignore` must exclude `node_modules`, `.next`, `.git`, `data/`, `.env*`, coverage.

---

## 4. CI/CD (GitHub Actions)

### 4.1 Pipeline (`.github/workflows/ci.yml`)

The existing `ci.yml` runs on every push to `main` and every pull request:

| Step | Command | Failure = |
|------|---------|-----------|
| Checkout | `actions/checkout@v4` | — |
| Setup Node | `actions/setup-node@v4`, Node `22`, npm cache | — |
| Install | `npm ci` | lockfile mismatch |
| Prisma generate | `npx prisma generate` | client/schema mismatch |
| Lint | `npm run lint` | style/static rules |
| Typecheck | `npm run typecheck` | type errors |
| Test | `npm run test` | broken tests |
| Build | `npm run build` | production build failure |

**Rules**

- `npm ci` — never `npm install` (respects the lockfile exactly).
- CI must run the **full** test suite, never a scoped subset.
- Add `npx prisma validate` to CI as part of the schema step so invalid schemas fail fast.
- Never store secrets in CI YAML — use GitHub Actions secrets or the platform secret manager.
- Pin actions to commit SHAs or at minimum major versions (`@v4`); supply a `.github/dependabot.yml` for action/dependency updates.

### 4.2 Proposed pipeline additions (backlog)

- ~~**`prisma validate`** in the schema step (recommended, 1 line).~~ **Done** (EPIC 0) — added to `ci.yml`. Required `prisma.config.ts` (new file, §2.4) for the CLI to resolve a datasource at all under Prisma 7; `validate`/`generate` don't need a live `DATABASE_URL`, so this adds no new CI secret requirement.
- **Staging/preview gate**: deploy each PR to a preview environment and run a smoke test (`GET /api/v1/health` 200 + DB readiness) before merge.
- **Deployment job** on `main` that triggers the Vercel/Railway deploy and then runs a post-deploy smoke test.
- **Migration safety check**: fail a PR if it changes `prisma/schema.prisma` without a committed migration.
- **Coverage threshold**: report coverage for the agent/test core.

### 4.3 Branch & PR policy

- Protect `main`: require CI green, require PR review (Sentinel gate on code, human approval on merges).
- `main` is the only long-lived branch. Feature work lives in short-lived branches or the shared worktree, merged via PR.
- Every commit carries the human operator's `Signed-off-by` and `Co-authored-by` trailers (see repo `AGENTS.md`).

---

## 5. Vercel

### 5.1 Current deployment

- Framework preset: **Next.js** (`vercel.json` → `framework: nextjs`, `buildCommand: npm run build`).
- Build runs `npm run build`, whose `prebuild` hook runs `npx prisma generate`.
- Runtime Node `24.x` (project setting). Keep CI (22) and runtime (24) in sync where possible.

### 5.2 Environment setup (Vercel)

Configure env vars in the Vercel dashboard (Production / Preview / Development) or `vercel env` CLI. Minimum set:

```env
NODE_ENV=production
STORE_MODE=db
DATABASE_URL=mysql://user:pass@host:3306/notaplan
JWT_SECRET=<64+ random chars>
```

Do not commit these to the repo. The full variable inventory lives in §7.

### 5.3 Serverless constraints

- **No persistent local disk**: in `json`/`memory` mode, data resolves to `/tmp` (`resolveDataDir`, `src/lib/config.ts`) and is lost on cold start. This is demo-only behavior. **Production uses `STORE_MODE=db`.**
- **Function duration limits**: keep AI/agent HTTP handlers within Vercel function limits; long-running work belongs in the autonomous workflow engine triggered by cron, not in a request handler.
- **Edge vs Node runtime**: `src/middleware.ts` runs on the edge runtime and only has access to the env vars it reads (JWT_SECRET); keep it dependency-free.

### 5.4 Cron (autonomous workflows)

Autonomous workflows (e.g., daily tahsilat intake) must be triggered by a scheduler. The endpoint `POST /api/v1/workflows/tick` requires an authenticated call. Recommended production wiring:

```jsonc
// vercel.json (crons require a paid plan)
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "crons": [
    { "path": "/api/v1/cron/workflows", "schedule": "0 3 * * *" }
  ]
}
```

The cron route MUST validate the Vercel-provided `x-vercel-cron` header (and a `CRON_SECRET` if self-hosted) before running — never expose a public, unauthenticated trigger. A cron-triggered tick is idempotent by design (see database guide) so overlapping schedules are safe.

### 5.5 Rollback (Vercel)

- Vercel keeps previous deployments; use **Promote** on the last known-good deployment for instant rollback.
- Never "hotfix" the production deployment directly — roll back, fix in a branch, verify in CI, redeploy.

---

## 6. Railway

> **Current state:** Railway is a supported target (README documents MySQL persistence on hosted DBs) but is not the primary deployment. This section defines the standards if/when Railway becomes a primary or backup platform.

### 6.1 When to use Railway

- Managed **MySQL/MariaDB** for production when you want a turnkey DB (or as a stepping stone before a dedicated RDS/PlanetScale-class service).
- Self-contained container deployment of the Next.js app.

### 6.2 Recommended service layout

| Service | Source | Notes |
|---------|--------|-------|
| `notaplan-web` | Dockerfile | `NODE_ENV=production`, `STORE_MODE=db`, build from §3.2 |
| `notaplan-db` | Railway-provided MySQL/MariaDB | separate from app, network-restricted |
| (optional) `redis` | Railway Redis | cache/queue for future job system |

### 6.3 Railway specifics

- **Networking**: internal networking between web and DB; never expose the DB port publicly.
- **Secrets**: use Railway **Variables** (or a linked secret manager); they are injected at runtime, never baked into the image.
- **Deploy**: push to `main` triggers deploy; gate with the same CI that Vercel uses.
- **Rollback**: Railway supports redeploying a prior deployment — keep the documented version map (§11) so you know which commit is "known good."
- **Scaling**: run ≥2 web replicas for production. Because state lives in the DB (not the filesystem), horizontal scaling is safe.

---

## 7. Environment Variables

### 7.1 Inventory (65+ referenced in code)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NODE_ENV` | ✓ | `production`/`development`/`test` |
| `STORE_MODE` | ✓ | `db` (prod) / `json` / `memory` |
| `DATABASE_URL` | ✓ (db mode) | MySQL/MariaDB connection string |
| `DATABASE_PROVIDER` | prod | `mysql` (default) |
| `JWT_SECRET` | ✓ prod | ≥32 chars, ≥16 required; signs access/refresh tokens |
| `JWT_ACCESS_TTL` | | default `15m` |
| `JWT_REFRESH_TTL` | | default `7d` |
| `DEFAULT_TENANT_ID` | | bootstrap tenant (default `tenant_nilufer_acar`) |
| `AUTH_SUPER_PASSWORD` | ✓ prod | must be set; **no demo fallback in prod** |
| `AUTH_ADMIN_PASSWORD` | ✓ prod | bootstrap admin |
| `AUTH_TEACHER_PASSWORD` | ✓ prod | bootstrap teacher |
| `AUTH_PARENT_PASSWORD` | ✓ prod | bootstrap parent |
| `AUTH_AGENT_PASSWORD` | ✓ prod | bootstrap agent |
| `AI_PROVIDER` | | `auto`/`openai`/`grok`/`gemini`/`local`/`heuristic` |
| `AI_MODEL` | | model override |
| `OPENAI_API_KEY` | by provider | OpenAI |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | by provider | Gemini |
| `XAI_API_KEY` / `GROK_API_KEY` | by provider | Grok/xAI |
| `LOCAL_LLM_URL` / `LOCAL_LLM_KEY` | by provider | local model endpoint |
| `OPENAI_BASE_URL` / `XAI_BASE_URL` | | provider base URLs |
| `AI_TIMEOUT_MS`, `AI_RETRY_COUNT` | | LLM timeout/retry |
| `PLANNER_MAX_STEPS`, `PLANNER_MAX_RETRIES` | | agent planner limits |
| `EMBEDDING_PROVIDER`, `EMBEDDING_DIMS`, `MEMORY_TOP_K`, `MEMORY_MIN_SCORE` | | memory/vector config |
| `VECTOR_BACKEND` | | `pgvector`/`qdrant`/file |
| `PGVECTOR_URL`, `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` | by backend | vector stores |
| `WHATSAPP_PROVIDER` | | `console`/`meta`/`twilio`/`evolution` |
| `WHATSAPP_VERIFY_TOKEN` | | webhook verification |
| `WHATSAPP_WEBHOOK_SECRET` | prod | webhook shared secret |
| `WHATSAPP_META_TOKEN`, `WHATSAPP_META_PHONE_NUMBER_ID`, `WHATSAPP_META_API_VERSION` | by provider | Meta Cloud API |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | by provider | Twilio |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` | by provider | Evolution API |
| `CRON_SECRET` | prod | self-hosted cron trigger auth |
| `AGENT_LOG_DEBUG`, `AUDIT_LOG_DEBUG` | | debug toggles |
| `VERCEL`, `AWS_LAMBDA_FUNCTION_NAME` | (set by platform) | serverless detection |

### 7.2 Rules

- `.env` is **local only** and gitignored. Never commit real values.
- `.env.example` (tracked) holds the full inventory with empty/dummy values and comments — the source of truth for onboarding.
- Every new `process.env.*` read must be **added to `.env.example` and this table** in the same change.
- Production must **fail closed**: if a required variable is missing, the app should fail fast at startup, not silently use a demo default. (Backlog: startup env schema validation — see §10.)
- Never log or render secret values. Watch for secrets in stack traces, error responses, and AI tool outputs.

---

## 8. Secret Management

### 8.1 Policy

- **Never commit secrets** to the repo, including in tests, fixtures, or seed files.
- Secrets live in **platform secret managers**, not in code or image layers:
  - **Vercel**: Project Environment Variables (Production/Preview/Development scopes).
  - **Railway**: Service Variables / linked secret store.
  - **CI**: GitHub Actions secrets / environment-scoped secrets.
- Long-lived keys (LLM API keys, DB credentials) are set once in the platform and rotated on suspicion or schedule (see §8.4).

### 8.2 Production-critical secrets

| Secret | Guidance |
|--------|----------|
| `JWT_SECRET` | Generate with `openssl rand -hex 64`. Rotate by issuing new tokens with the new secret; never truncate below 32 chars. |
| `DATABASE_URL` | Least-privilege DB user; scope to the Nevii Hub schema. |
| `AUTH_*_PASSWORD` | Must be overridden in prod. The code must refuse demo fallbacks under `NODE_ENV=production`. |
| LLM / WhatsApp keys | Provider-scoped tokens with minimal permission; rotate immediately on leak. |

### 8.3 Handling a suspected leak

1. Rotate the leaked credential immediately (platform + provider).
2. Deploy the rotation via the normal pipeline.
3. Audit access logs and the audit table for unauthorized use.
4. Open an incident note (see §12).

### 8.4 Secret rotation checklist

- JWT: rotate signing secret, confirm old tokens expire within `JWT_ACCESS_TTL`.
- DB: change password, update `DATABASE_URL` in all environments, restart.
- Provider keys: rotate in provider console, update platform vars, verify with a smoke test.

---

## 9. Monitoring & Logging

### 9.1 Current state

- `src/lib/logger.ts`: structured-ish console logging with a `[nevii-hub]` prefix; errors logged via the API handler wrapper.
- `src/lib/auth/audit.ts` (`auditLog()`): authorization/authentication/error events. **Now persists** (EPIC 0, `IMPLEMENTATION_PLAN.md`) to `AuditLog` via `src/lib/audit/log.ts` — previously a documented no-op. Only persists in `STORE_MODE=db` (writes go through `prisma`); fails closed (silently, logged only via `AUDIT_LOG_DEBUG=1`) in `json`/`memory` mode, same accepted limitation as `AiAuditLog` below.
- `src/lib/audit/log.ts` (`AuditLog` table): general critical-action trail — payments marked paid, teacher fee rule create/update, makeup confirm/cancel, student create, plus everything already routed through `auditLog()` (login success/failure, authz denials, API errors). Tenant-scoped reads via `listAuditLogs(tenantId)`.
- `src/lib/ai/audit-hook.ts` (`AiAuditLog` table): AI capability invocations specifically (separate table, same fire-and-forget/DB-only pattern).
- `src/lib/ai/metrics.ts`: AI usage metrics (per-tenant cost basis).
- `GET /api/v1/health`: liveness endpoint (`service`, `storeMode`, `time`).

### 9.2 Production requirements (target)

| Concern | Mechanism |
|---------|-----------|
| **Liveness** | `GET /api/v1/health` returns 200 when the process is up. |
| **Readiness** | Health endpoint must also verify DB connectivity in `db` mode (e.g., `SELECT 1`) — return non-200 when the DB is unreachable. |
| **Structured logs** | JSON-formatted logs with `requestId`, `tenantId`, `userId`, `path`, `durationMs`. The API handler already builds a `requestId`; propagate it into logs. |
| **Errors** | All unhandled errors → logger + audit entry with correlation ID (already partly present in `withApiHandler`). |
| **AI cost/usage** | Persist AI metrics to the DB (or external metrics endpoint) in prod — file metrics are lost on serverless cold start. |
| **Alerting** | Health-check pings, error-rate thresholds, and failed-cron alerts. |
| **APM** (backlog) | Sentry for frontend/API errors and performance traces. |

### 9.3 Uptime checks

- Use an external uptime monitor (UptimeRobot/StatusCake/BetterStack or Vercel monitoring) hitting `/api/v1/health` every 1–5 min from ≥2 regions.
- Alert on: 2 consecutive failures, slow response > threshold, DB-unready state.

### 9.4 Log retention & privacy

- Logs may contain personal data (parent/student info). Apply retention limits and treat logs as PII-bearing.
- Never log passwords, tokens, full message bodies, or secret values. Redact before emitting.

---

## 10. Backups

### 10.1 Policy

- Production DB backups are **mandatory**; payment data must be recoverable to meet SLAs and legal/accounting requirements.
- Backups are tested restores, not just dumps.

### 10.2 Backup strategy (db mode)

| Requirement | Implementation |
|-------------|----------------|
| **Daily full** | `mysqldump --single-transaction` (or managed snapshot) daily, off-host. |
| **Point-in-time** | Enable the DB provider's PITR/binlog retention (managed MySQL/MariaDB). |
| **Retention** | ≥ 14 daily, ≥ 8 weekly, ≥ 12 monthly (tune to data/privacy policy). |
| **Encryption** | Encrypt backups at rest and in transit; store in a separate bucket/region from the primary. |
| **Restore test** | Restore into a throwaway instance and run `SELECT COUNT` sanity checks + the app smoke test at least monthly. |
| **PII handling** | Follow KVKK/GDPR: document retention, support tenant deletion, redact/encrypt sensitive columns as required. |

### 10.3 Restore runbook (sketch)

1. Isolate the incident; place app in read-only / maintenance if needed.
2. Provision a fresh DB instance (or restore over the affected one).
3. Restore the chosen backup + apply PITR to the target time.
4. Point a smoke environment at the restored DB; verify health + a known row set.
5. Flip `DATABASE_URL` in prod, restart, verify.
6. Post-incident review; update this guide if the runbook diverged.

> **Status: documented, not yet exercised against a live restore.** This runbook has
> not been run end-to-end against a real backup/restore cycle in this environment
> (no managed-backup provider is wired up yet — see §13 backlog item #11). Treat step
> 4's "verify" as the gate: do not consider the runbook validated until someone has
> actually restored a backup into a throwaway instance and confirmed a known row set.
> Do not claim this procedure is "tested" until that has happened at least once.

### 10.4 Personal data retention, deletion & anonymization (EPIC 0)

- **Financial/legal records are never hard-deleted.** `Payment`, `TeacherPayout`, and
  audit trail rows (`AuditLog`, `AiAuditLog`) must be retrievable for accounting/legal
  retention windows even after a student/teacher/tenant is otherwise removed — this is
  why those tables intentionally carry `tenantId` **without** a cascading `@relation`
  to `Tenant` (see the model comments in `prisma/schema.prisma`).
- **Student/teacher/parent personal data (name, contact info, notes) may be
  anonymized on request**, not necessarily deleted: replace `name`/`email`/`phone`/
  `parentName`/`parentPhone`/`notes` with a fixed anonymization marker, keep the row
  (and its id) so foreign keys (`Lesson`, `Payment`, `Attendance`, …) stay valid and
  historical reporting/payout totals stay correct. `active: false` already exists on
  `Student`/`Teacher` as the "no longer enrolled" signal; anonymization is a distinct,
  additional step on top of that.
- **Every anonymization/deletion action must produce an `AuditLog` row**
  (`action: "student.anonymize"` / `"teacher.anonymize"`, `outcome: "success"`,
  `meta` carrying only the fact that it happened — never the erased content).
- **Status: this is the accepted design, not yet implemented as a tool/UI.** No
  `anonymizeStudentTool`/admin action exists yet — building it is future work, tracked
  in `IMPLEMENTATION_PLAN.md` under EPIC 0's follow-ups. Do not claim a self-serve
  anonymization flow exists until it does.
- **Tenant-level deletion**: a `Tenant` row's Prisma relations mostly cascade
  (`onDelete: Cascade`) — deleting a `Tenant` removes its `School`/`Branch`/`Teacher`/
  `Student`/`Lesson`/… rows. `AuditLog`/`AiAuditLog` rows deliberately do **not**
  cascade (see above) and remain queryable by `tenantId` after a tenant is gone —
  this is intentional, not an oversight.

### 10.5 Incident response (data exposure / cross-tenant leakage)

Beyond §8.3's credential-leak procedure, a suspected **data isolation** incident
(a user saw or received another tenant's data) follows this path:

1. **Contain**: identify the exact route/query/tool involved; if a specific endpoint
   is implicated, disable it (feature flag or emergency deploy) rather than taking the
   whole app down.
2. **Scope**: query `AuditLog`/`AiAuditLog` for the affected `tenantId`(s) and time
   window to determine what was actually read/written and by whom
   (`listAuditLogs(tenantId)` / direct DB query — this is exactly why the audit trail
   exists).
3. **Fix**: the root cause is almost always a query/tool that trusts a client-supplied
   tenant/entity id instead of deriving it from `ctx.tenantId` (JWT/session) — see
   `src/lib/services/context.ts`'s `canAccessStudent`/`canAccessTeacher` and
   `IMPLEMENTATION_PLAN.md §1`'s role matrix for what the CORRECT scoping looks like
   per role. Add a regression test in `access-control-matrix.test.ts` or
   `tenant-isolation.test.ts` that fails without the fix.
4. **Notify**: affected tenant(s) per the applicable data-protection obligation
   (KVKK) — this is a product/legal decision, not an engineering one; escalate to the
   human operator.
5. **Post-incident review**: record what leaked, how long, root cause, and the fix's
   commit SHA; update this guide and `IMPLEMENTATION_PLAN.md` if the incident reveals
   a gap in the role matrix.

---

## 11. Deployment Strategy

### 11.1 Deployment model

| Layer | Platform | Flow |
|-------|----------|------|
| **Preview** | Vercel Preview (per-PR) | On every PR push |
| **Staging** | Vercel/other, `STORE_MODE=db` on a staging DB | From `main`, pre-release |
| **Production** | Vercel (primary) / Railway (alt) | From `main`, after CI + review |

### 11.2 Release process

1. PR opened → CI runs full pipeline → Sentinel review (code + security) → human approval.
2. Merge to `main` → preview/staging deploy → smoke test (`/api/v1/health` + a read endpoint).
3. Promote to production → post-deploy smoke test → verify cron fires.
4. Record the release: commit SHA, deploy URL/version, env delta, any schema changes (§11.3).

### 11.3 Schema changes

- Schema changes require a **migration** (see database guide) and must be applied **before** or **with** the app deploy, never after the app starts querying new columns.
- In `db` mode, run migrations as part of the release pipeline (or a dedicated, one-at-a-time migration job). `prisma db push` is acceptable for dev/staging only — **never for production**; adopt `prisma migrate` with committed migrations for prod.
- Every schema change ships with `prisma validate` green in CI.

### 11.4 Version map (documented rollback)

| Release | Commit | Deploy URL/ID | Env delta | Schema change | Rollback path |
|---------|--------|---------------|-----------|---------------|---------------|
| *(record every release here)* | `0cab45d` | … | … | none | Vercel promote previous |

---

## 12. Production Checklist (pre-launch & per-release)

### 12.1 Pre-launch (one-time)

- [ ] `STORE_MODE=db` with a managed MySQL/MariaDB; `DATABASE_URL` uses least-privilege credentials.
- [ ] All `AUTH_*_PASSWORD` set; demo fallbacks verified disabled under `NODE_ENV=production`.
- [ ] `JWT_SECRET` set to a fresh ≥32-char random value.
- [ ] `.env.example` current; `PROJECT.md`/handbook documents every env var.
- [ ] CI green on `main`; `prisma validate` in CI.
- [ ] Vercel cron configured for autonomous workflows; cron route validates `x-vercel-cron`.
- [ ] Health endpoint does DB readiness in `db` mode.
- [ ] Uptime monitor active on `/api/v1/health` with alerting.
- [ ] Backups configured, encrypted, retention policy set, one restore test performed.
- [ ] Security headers policy documented and applied (`next.config.ts` headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options) — see backlog.
- [ ] Rate limiting on public endpoints (login, webhook, AI) — see backlog.
- [ ] Rollback path verified (Vercel promote / Railway redeploy).

### 12.2 Per-release checklist

- [ ] `npm run lint` && `npm run typecheck` && `npm run test` && `npm run build` green locally and in CI.
- [ ] `npx prisma validate` green; any schema change has a migration and a documented apply step.
- [ ] Env changes mirrored in `.env.example` and the §7 table.
- [ ] Secrets rotated or confirmed unchanged; no secrets in the diff.
- [ ] Smoke test passed in staging/preview; health + one authed read route.
- [ ] Release recorded in the §11.4 version map.
- [ ] No debug logging left behind; `AGENT_LOG_DEBUG`/`AUDIT_LOG_DEBUG` off in prod.

---

## 13. Backlog (accepted follow-ups)

Tracked operational improvements not yet implemented:

1. `.env.example` (blocking onboarding — create in the next sprint).
2. Startup env validation (fail fast on missing required vars in prod).
3. Remove prod demo fallbacks for `AUTH_*_PASSWORD` and `JWT_SECRET` (`src/lib/auth/users.ts`, `src/middleware.ts`).
4. Cron route + `vercel.json` `crons` for autonomous workflows (validating `x-vercel-cron`).
5. DB readiness check in `/api/v1/health`.
6. `prisma migrate` adoption + committed migrations (replaces `db:push` for prod).
7. Security headers in `next.config.ts` (CSP/HSTS/XFO/XCTO).
8. Rate limiting (login, webhook, AI endpoints).
9. Sentry/APM + structured logging with `requestId`/`tenantId`.
10. Persist AI metrics to DB/external store in prod.
11. Backup automation + restore-test runbook.
12. `output: "standalone"` + Dockerfile (Railway/self-host readiness).
13. Staging environment + deploy gating + post-deploy smoke test.
14. Multi-tenant cron tick (all tenants, not a single default tenant).

---

## 14. Reference

- **Repo**: `https://github.com/hidircan/notaplan` · local checkout `~/Projects/notaplan`
- **CI**: `.github/workflows/ci.yml`
- **Platform config**: `vercel.json`, `.vercel/project.json`
- **Runtime config**: `src/lib/config.ts`, `src/lib/db.ts`, `src/lib/auth/config.ts`
- **Health**: `src/app/api/v1/health/route.ts`
- **Workflow trigger**: `src/app/api/v1/workflows/tick/route.ts`
- **Related handbook docs**: `PROJECT.md` (Atlas), `AGENTS.md` (Forge), `DATABASE_ARCHITECTURE.md` (Prisma), `FRONTEND_GUIDELINES.md` (Nova), `PRODUCT_REQUIREMENTS.md` (Orion)

---

*Owned by Helios (DevOps). Changes require a PR + CI green + Sentinel review. Last updated 2026-07-31.*
