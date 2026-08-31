---
title: "Admin Web Portal — Production Readiness"
date: "2026-08-29"
scope: "Administrator Web Portal (priority #1) — first production-ready release"
---

# Admin Web Portal — Production Readiness

This is a **launch-readiness synthesis for the admin web portal specifically**, not a
replacement for the existing infra docs. For depth on any topic, follow the pointer —
this document does not repeat their content, only what's new, what's stale, and what
blocks launch.

- **`DEVOPS_GUIDE.md`** — environments, Vercel/Railway, CI/CD, secrets, monitoring,
  backups, deployment strategy, per-release checklist (§1–§14).
- **`DATABASE_ARCHITECTURE.md`** — store-mode parity, multi-tenancy, migrations,
  indexing, backup strategy, Postgres migration path (§1–§17).
- **`PRODUCTION_AUDIT.md`** — ROI-ranked roadmap, dated **2026-07-29**.

## 0. Correcting stale documentation (verified in this session)

Two claims in the existing docs no longer match the repo and would mislead a launch
decision if trusted as-is:

1. **`PRODUCTION_AUDIT.md` §1/§2 says "no test runner, zero test files, no CI".**
   False today: `.github/workflows/ci.yml` exists, and the repo has 200+ vitest files
   (`src/lib/__tests__/**`) exercising contracts, RBAC, tenant isolation, homework,
   payments, auth, etc. — see `docs/contracts/CONTRACT_RENEWAL_INVITATION_AND_HOMEWORK_REPORT.md` for this session's own validation-gate run. The July audit's
   "Test: 1/10" and "CI/CD: 0/10" scores and the resulting Critical #1/#2 items are
   **out of date**; re-score before using that doc to prioritize work.
2. **`DEVOPS_GUIDE.md` §7.1 and §10.2 describe MySQL/MariaDB as the production
   database** (`DATABASE_URL=mysql://...`, `mysqldump`). The repo has since
   completed the Postgres migration described in `DATABASE_ARCHITECTURE.md` §15:
   `prisma/schema.prisma` datasource is `provider = "postgresql"`, and every
   migration under `prisma/migrations/` (including the two added in this session)
   uses Postgres SQL syntax. `DEVOPS_GUIDE.md`'s MySQL-specific env var docs and
   backup commands need a Postgres pass (`DATABASE_URL=postgresql://...`,
   `pg_dump`/managed Postgres snapshot instead of `mysqldump`) — **do not follow
   the MySQL instructions in that doc for a real deployment.**

Neither correction is applied to the source docs here (out of scope for this task) —
flagged so a launch decision isn't made on stale numbers.

## 1. What changed in this session (context for the blockers below)

- **Contract trial/formal business rule** (`src/lib/contracts.ts`): 1–2 month
  enrollments no longer generate a formal contract `DocumentInstance`/PDF; 3–12
  months do, unchanged. New migration:
  `prisma/migrations/20260828210000_contract_trial_optional_document/`.
- **Account invitation email flow** (`src/lib/email/*`, `src/lib/auth/invitation.ts`,
  `POST /api/v1/auth/accept-invitation`, `/hesap-aktivasyon`): new. Reuses the
  existing password-reset token machinery (`src/lib/auth/password-reset.ts`) —
  no new token table.
- A prior same-day session added the versioned contract/renewal system itself
  (`docs/contracts/CONTRACT_RENEWAL_AND_HOMEWORK_FEATURE_REPORT.md`) and a pending
  migration `prisma/migrations/20260828160000_student_contracts/`.

**None of these three migrations have been applied anywhere** (`prisma migrate
deploy` not run against staging or production — confirmed via `prisma migrate
status`, see §13). This is the top schema blocker below.

## 2. Release blockers (must fix before first production release)

| # | Blocker | Why it blocks | Owner action |
|---|---|---|---|
| 1 | **Three pending migrations not deployed anywhere** — `20260827150458_add_password_reset_token`, `20260828160000_student_contracts`, `20260828210000_contract_trial_optional_document` | Contracts, forgot-password, and the new invitation flow all depend on these tables/columns existing. Nothing here has been run against staging or prod. | Run the staging flow below (§5) with explicit human approval per `CLAUDE.md`; verify; then repeat for production on a separate approval. |
| 2 | **SMTP / transactional email is not configured anywhere in this environment** | `src/lib/email/config.ts` has no `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` set → `isEmailProviderConfigured()` is `false` → every invitation send returns `{delivered:false, blocked:true}` (verified by this session's own tests, never silently reported as sent). Admins can still use the "Anında erişim / geçici şifre" fallback in the UI, but the branded welcome-email flow the task requires is **non-functional in production until SMTP is set.** | Provision a transactional SMTP provider (e.g. a dedicated sending domain + provider of the owner's choice — this session does not pick one), set `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `APP_BASE_URL` in the target environment. Send one real test invitation end-to-end (§10) before relying on it. |
| 3 | **`APP_BASE_URL` unset** | Invitation links (`sendAccountInvitationEmail`) fall back to `http://localhost:3000` if unset — a broken/unusable link in any deployed environment. | Set `APP_BASE_URL` (or `NEXT_PUBLIC_APP_BASE_URL`) to the real public panel URL in every non-local environment. |
| 4 | **`DEVOPS_GUIDE.md` §12.1 pre-launch checklist items are unverified in this session** (`AUTH_*_PASSWORD` set, `JWT_SECRET` fresh, uptime monitor active, backups configured+tested) | These are prerequisites this session did not check against the actual target infra (no access to the deployment dashboard) — see §0, this doc only adds to that checklist, doesn't replace it. | Owner walks `DEVOPS_GUIDE.md` §12.1 against the real Vercel/DB project before go-live. |
| 5 | **No restore has ever been exercised** (`DEVOPS_GUIDE.md` §10.3 explicitly flags this as "documented, not yet tested") | A backup nobody has restored is not a verified backup. | Run one full restore-to-throwaway-instance drill before the admin portal carries real customer payment/contract data. |

## 3. Required production environment variables (additive to `DEVOPS_GUIDE.md` §7.1)

The full inventory lives in `DEVOPS_GUIDE.md` §7.1 and `.env.example` (source of
truth, kept in sync in this session). New for this work:

| Variable | Required | Purpose |
|---|---|---|
| `EMAIL_PROVIDER` | optional | `smtp` or `console`; auto-detects `smtp` if `SMTP_HOST`+`SMTP_USER`+`SMTP_PASS` are all set. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | ✓ for real invitation delivery | SMTP transport (`nodemailer`, added this session). |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | recommended | Sender identity on welcome/invitation emails. |
| `APP_BASE_URL` (or `NEXT_PUBLIC_APP_BASE_URL`) | ✓ prod | Base URL used to build `/hesap-aktivasyon` invitation links. |

If `SMTP_*` is left unset in production, the app **fails safe**: invitations are
still created (token + audit trail), the email is logged and reported as
`blocked: true` in the API/UI response — it is never reported as delivered when it
was not. This satisfies the task's "mark delivery as BLOCKED rather than faking it"
requirement without any code change needed once real credentials are supplied.

## 4. Database backup / restore (pointer + admin-portal-specific note)

Full policy, strategy, and the restore runbook live in `DEVOPS_GUIDE.md` §10 and
`DATABASE_ARCHITECTURE.md` §13. Two admin-portal-specific additions:

- **Contract PDFs are not stored as separate binary files** (see
  `docs/contracts/CONTRACT_RENEWAL_AND_HOMEWORK_FEATURE_REPORT.md` §6) — the
  rendered HTML lives in `DocumentInstance.renderedHtml` (a DB column). A
  database backup **is** the contract-document backup; there is no separate
  object-storage backup to configure for contracts specifically. Signed-scan
  uploads (`DocumentInstance.fileData`) are also DB-column-stored in this
  architecture — same implication.
- Storage-backend files that live outside Postgres (announcement attachments via
  `src/lib/storage/supabase-adapter.ts`, when Supabase Storage is the configured
  backend) are **not covered by a Postgres backup** — confirm the storage
  provider's own backup/versioning policy separately before launch if that path
  carries anything the institution can't afford to lose.

## 5. Migration checklist (for the three pending migrations in §2)

Follow `CLAUDE.md`'s mandated flow, per migration, in order:

1. `npx prisma validate` (already green in this session, re-run to confirm no drift).
2. `npx prisma generate`.
3. `npx prisma migrate status` against the **staging** `DATABASE_URL` — confirm
   exactly these three show "not yet applied" and nothing else is unexpected.
4. Get **explicit human approval naming staging** (per `CLAUDE.md` — an agent
   session must not do this unprompted).
5. `npx prisma migrate deploy` against staging.
6. Smoke-test: create a trial (1–2mo) enrollment, a formal (3–12mo) enrollment +
   print + signed-scan upload, a renewal, and one invitation end-to-end (§10) in
   staging.
7. Repeat steps 3–6 against production on a **separate, explicit approval**.

## 6. Rollback procedure

Application rollback: `DEVOPS_GUIDE.md` §5.5 (Vercel promote) / §11.4 (version map)
— unchanged by this work.

Schema rollback for this session's additive migrations specifically: all three are
additive (`ALTER TABLE ... ADD COLUMN`, `ALTER COLUMN ... DROP NOT NULL`, new
tables) — none drop or rename existing columns, so the safe rollback path is
**re-deploy the previous application version** (old code simply doesn't read the
new columns/tables) rather than reversing the migration. Do not write a `DOWN`
migration that drops the new columns while any contract/invitation data may
already reference them — data loss risk.

## 7. Seed / demo data policy

Unchanged from the existing architecture: `STORE_MODE=json`/`memory` are demo/test
only and **must never be the production `STORE_MODE`** (`DEVOPS_GUIDE.md` §5.3,
`CLAUDE.md`). One addition from this session: `provisionEntityLogin` (used by both
the temp-password and the new email-invite path) is a **no-op outside `db` mode**
— a brand-new invitee email will not resolve to a user in `json`/`memory` mode.
This is an existing, accepted limitation (predates this session), not a new
regression — but it means the invitation flow can only be manually verified
end-to-end in a `db`-mode environment (staging/production), not in local
`json`-mode dev. Bootstrap demo accounts (`src/lib/auth/users.ts`) already exist
for local testing of the token/accept-invitation mechanics.

## 8. Data-loss prevention plan

- Contract versioning is append-only by design: `createContract` never overwrites
  a prior `StudentContract` row; a renewal supersedes (`status="superseded"`) but
  never deletes or mutates the prior row's `contractDataSnapshot` — verified by
  this session's tests (`contracts.test.ts`, "önceki sözleşme artık superseded —
  ama içeriği değişmedi").
- Invitation tokens are hashed at rest (SHA-256, never the raw token) and
  single-use — a leaked token file/DB row cannot itself be replayed once
  consumed. Verified by `account-invitation.test.ts`.
- No destructive operation in this session's changes (no `DELETE`, no `db push`,
  no `db reset`) — all additive migrations, additive code paths.
- Existing tenant-isolation and RBAC test suites (`access-control-matrix.test.ts`,
  `tenant-isolation.test.ts` where present) were re-run and remain green with the
  new `contracts:read`/`contracts:write` permissions — see `docs/contracts/CONTRACT_RENEWAL_INVITATION_AND_HOMEWORK_REPORT.md`.

## 9. Monitoring / alert plan

Pointer: `DEVOPS_GUIDE.md` §9 (current state + production target table). Nothing
in this session changes the monitoring architecture. One addition worth wiring
before relying on the invitation flow in production: **alert on a sustained rise
in `blocked: true` invitation responses** (visible via the `student.portal_invitation_sent`
/ `teacher.invitation_sent` audit log entries this session added, `meta.delivered`)
— a spike means SMTP broke, and today nothing pages anyone about it (no APM/Sentry
wired per §9.1 "current state").

## 10. User invite / email test plan

Before trusting invitation email in production:

1. Set real `SMTP_*`/`EMAIL_FROM`/`APP_BASE_URL` in the target environment.
2. As `SCHOOL_ADMIN`, invite one real teacher and one real guardian (use the new
   "E-posta ile davet gönder" mode in the student/teacher detail pages) to an
   inbox you control.
3. Confirm the email arrives, contains **no plaintext password**, and the link
   points at the real `APP_BASE_URL` + `/hesap-aktivasyon?token=...`.
4. Click the link, set a password ≥ 8 chars, confirm redirect to `/login`.
5. Log in with the new password; for the guardian case, confirm the student's
   record is now visible (portal access flipped from `invited` to `active`).
6. Confirm the same link is rejected on a second use (token single-use).
7. Confirm the "Anında erişim" fallback path still works independently — it must
   keep functioning as a manual fallback if SMTP is ever misconfigured.

This exact flow has been exercised in this session **at the unit/route level**
(`account-invitation.test.ts`, 11/11 passing) but **not against a real inbox or a
deployed environment** — step 1–2 require real infra this session does not have
access to.

## 11. Admin portal acceptance checklist (this task's scope)

- [x] Contract trial (1–2mo) vs formal (3–12mo) business rule implemented and tested.
- [x] Formal contract PDF/print/wet-signature/signed-scan flow unchanged and still green (prior session + re-verified this session).
- [x] Contract renewal/versioning chain, price-guarantee immutability, overlap guard — implemented and tested (prior session).
- [x] Student/guardian contract portal visibility, admin-only fields excluded — implemented (prior session), trial-record messaging added this session.
- [x] Invitation email workflow (teacher, student, guardian) implemented, no plaintext password ever transmitted, token single-use/expiring/rate-limited/audited.
- [ ] **New student registration form ("Kayıt ve Ödeme Planı" section) is a separate step from contract creation**, not a single merged form (deliberate prior-session decision, documented in the prior report §7/§16 — still true; revisit only if the owner wants the two flows merged).
- [ ] SMTP not yet configured anywhere → real email delivery unverified end-to-end (§10 blocked on infra access).
- [ ] Migrations not yet applied to staging/production (§2, §5).
- [ ] `DEVOPS_GUIDE.md` §12.1 pre-launch checklist not walked against real infra by this session (no access).
- [ ] Homework audio attachment + due-date update — implemented and tested (prior session), unaffected by this session's changes.

## 12. Staged rollout plan

1. **Staging**: apply the three pending migrations (§5), run the full validation
   gate (§13, and `docs/contracts/CONTRACT_RENEWAL_INVITATION_AND_HOMEWORK_REPORT.md`), run the invite email test plan (§10) with a staging SMTP
   sandbox or a real-but-throwaway inbox.
2. **Production, admin-only smoke**: apply migrations to production (separate
   approval), have one real `SCHOOL_ADMIN` create one trial enrollment, one
   formal contract end-to-end (create → print → mark signed → upload scan), and
   one real invitation — before any wider rollout.
3. **Production, general availability**: once step 2 is clean, no code change is
   needed to "turn on" the feature for all admins — it's already live per-tenant
   the moment the migration is applied and SMTP is configured. Communicate the
   new "E-posta ile davet gönder" option to institution staff.
4. **Mobile/teacher/student/guardian portals**: explicitly out of scope for this
   release per the task's stated priority order — do not build broader mobile
   work against this release without re-confirming priority.

## 13. Schema / migration status (as of this session)

```
$ npx prisma migrate status
Following migrations have not yet been applied:
20260827150458_add_password_reset_token
20260828160000_student_contracts
20260828210000_contract_trial_optional_document
```

`npx prisma validate` and `npx prisma generate` are green (see
`docs/contracts/CONTRACT_RENEWAL_INVITATION_AND_HOMEWORK_REPORT.md` for exact
output of the full validation gate). No `migrate deploy`/`db push`/`db reset`
was run against any target in this session, per the standing safety rule.

## 14. Confirmation

- No stage, no commit, no push, no deployment in this session.
- No shared/staging/production migration applied.
- No other worktree modified — all changes are in the canonical checkout
  (`/Users/hidircanyagiz/Projects/notaplan`, `main`).
- Supabase (where used, storage-only per this repo's architecture — see
  `CLAUDE.md`) was not touched; no paid-plan or dashboard settings were altered.

## 15. Addendum — enrollment/payment/contract package (later same-day session)

A later same-day session closed the remaining gaps identified against a more detailed
spec (payment due-window policy, the metadata-only-PDF risk, title/filename, the
overlap-validation UI bug, template management visibility, and a fast contract CTA
from registration). Full detail: `docs/contracts/ADMIN_WEB_ENROLLMENT_PAYMENT_CONTRACTS_REPORT.md`.
Summary relevant to launch readiness:

- **No new migration.** The payment-policy override (`contractCardWindowEndDay`,
  `contractBankCashDueDay`) reuses the existing `School.collectionsSettings` JSON
  column — §13's three pending migrations are still the only schema blocker; nothing
  was added to that list.
- **New release-relevant behavior to verify during the staging walkthrough (§5/§10):**
  a formal contract now blocks generation (clear Turkish error, no PDF produced) if
  the active `student_enrollment_contract` template predates this session's
  required-placeholder set (`{{titleMain}}`, `{{paymentDueRuleText}}`, taksit/total/
  signatory/start-date fields). Any tenant whose template was created before this
  session and never edited will hit this on its next formal contract — the fix is to
  open **Panel → Evraklar → Sözleşme Şablonları** (now always visible, no longer
  gated behind `SHOW_TEMPLATE_SECTIONS`) and either re-save the template (bumps
  version) or let the default reseed on a tenant with zero templates.
- **Legal-text note:** the in-code contract body (`src/lib/documents/index.ts`,
  `STUDENT_ENROLLMENT_CONTRACT_BODY`) and the canonical template
  (`docs/contracts/student-enrollment-contract-template.md` §5 "Sözleşme metni",
  now synced verbatim from the owner-supplied root file) are **not word-for-word
  identical** in a few articles (notably Madde 4 and Madde 7) — see the final report
  §5/§7 for the exact diff. This predates this session and was not silently
  resolved either way (no legal wording was rewritten); it needs the institution's
  legal reviewer to pick the authoritative wording before the first real contract is
  signed off of it.
