# Nevii Hub — Change Log (this session)

## A. Attendance calendar bug fix (`src/components/attendance-calendar-panel.tsx`)

**Root cause:** `loadMonths()` fetched all months of a term sequentially, then called
`setByMonth(results)` unconditionally — replacing the *entire* map. The old effect used a
`cancelled` flag, but it was only checked *after* the fetch had already resolved and
`loadMonths()` had already called `setByMonth` internally, so the flag never actually
prevented anything. Result: if a user switched term/year quickly, a slow, stale request
that started earlier could resolve *after* a newer request and clobber the fresher data —
a genuine race condition, not a timing/remount issue.

**Fix:**
- Added a monotonically increasing `requestIdRef` + `AbortController` per load; a response is
  only applied if it's still the most recent request (`shouldApplyMonthsResult`, exported and
  unit-tested).
- Added a visible error banner with a "Tekrar dene" (retry) button when any month fetch fails
  (previously errors were silently swallowed with a `catch {}`).
- Added a proper skeleton loading state (per-month animated placeholder grid) instead of a bare
  "loading…" text line.
- Kept the existing optimistic-update + settle-refetch pattern for lesson ops status changes
  (already correct, not touched) to avoid redundant refetches.

**Test:** `src/lib/__tests__/attendance-calendar-race.test.ts` (pure-function test of
`shouldApplyMonthsResult`, matching the repo's existing "extract pure logic, no
jsdom/@testing-library" test convention — see `pagination-controls.test.ts`).

**Manual verification:** Open a student detail page → Yoklama Takvimi. Throttle network to
"Slow 3G" in DevTools, then rapidly click Güz → Yaz → Güz. Confirm the calendar never shows
stale/wrong-term data, and confirm the retry button appears (and works) when the network tab
is offline.

## B. Tahsilat screen — removed subtitle

`src/app/panel/ai/tahsilat-agent/page.tsx` — removed the `description` line under the "Tahsilat"
`PageHeader` ("Riskteki ödemeleri önceliklendirir, veliye gönderilecek mesaj taslağını
hazırlar…"). This is the only screen literally titled "Tahsilat" in the app (there is no
separate `/panel/tahsilat` route); title, filters, queue, and empty states are untouched.

## C. Teacher login bug

**Root cause:** `src/lib/seed.ts` was hand-edited (pre-existing, user's own change) to rename
the demo teachers `t1..t7` to real people with real `@niluferacar.com.tr` emails matching the
CSV import (`turgay.hosbas@…`, `olcay.ozdemir@…`, etc.), and `src/components/login-form.tsx`
(also pre-existing uncommitted change) was updated to offer these as clickable demo personas
with passwords `demo-teacher-csv-1..7`. However, `src/lib/auth/users.ts`'s `BOOTSTRAP` array —
the only source of auth `User` identities in `STORE_MODE=json`/`memory` (the default local/dev
and **all test** mode, per `CLAUDE.md`) — had **no entries at all** for `t1`, `t3`–`t7`, and its
one teacher entry (`user_teacher_t2`) still pointed at the *old*, now-nonexistent email
`can@niluferacar.com.tr`. The corresponding real `User` rows are only ever created by
`scripts/seed-demo-csv-teachers.ts`, which is explicitly gated `if (isDbMode)`. This is a
**mode-parity bug**: teacher login only worked under `STORE_MODE=db` after that script had been
run, never under the default json/memory mode — so every teacher demo persona failed with
"Invalid email or password" (correct generic message, wrong underlying cause: no user, not a
wrong password).

**Fix (`src/lib/auth/users.ts`):**
- Added 7 `BOOTSTRAP` entries (`user_teacher_t1`..`t7`), one per seeded teacher, with the exact
  emails from `seed.ts` and the exact `demo-teacher-csv-N` passwords the login form and the CSV
  seed script already use (env-var overridable, same convention as the other bootstrap entries).
- `authenticateUser` now trims + lowercases the incoming email before comparison (defensive fix
  for the "visibly correct email fails silently" class of bug), and in DB mode looks up the user
  by email first, then checks `active` separately (previously baked into the same `where`
  clause), so an inactive-vs-nonexistent user can be told apart in logs.
- Added `logAuthFailureReason` — server-side-only audit logging via the existing `auditLog`
  helper, with a reason code (`no_such_user` / `inactive` / `bad_password` / `bad_role`) and the
  normalized email, **never the password**. The client-facing error message returned by
  `/api/v1/auth/login` is unchanged ("Invalid email or password").

**Tests:** `src/lib/__tests__/auth-teacher-login.test.ts` — successful login for an active
teacher, case/whitespace-insensitive email matching, failed login on wrong password, failed
login on unknown email, and a full sweep of all 7 CSV teacher personas.

**Manual verification:** `npm run dev`, go to `/login`, click any "Öğretmen — …" demo persona
button, confirm it logs in (previously failed for all 7 in json/memory mode).

## D. Inline editing on student & teacher detail screens

This was substantially already in progress in the working tree before this session
(`src/components/student-profile-editor.tsx`, wired into
`src/app/panel/ogrenciler/[studentId]/page.tsx`) and a parallel `TeacherProfileEditor` +
`TeacherInstrumentsEditor` already exist and are wired into
`src/app/panel/ogretmenler/[teacherId]/page.tsx`. Reviewed and left as-is (verified it compiles
clean under `tsc --noEmit`):
- RBAC: both editors render only for `session.role === "SCHOOL_ADMIN" || "SUPER_ADMIN"`.
- National ID: `NationalIdReveal` + `maskNationalId` + `actionSetNationalId` are reused exactly
  as required — the editor's `nationalId` state starts empty (`useState("")`), never
  pre-filled with the decrypted value; a masked value is shown read-only via
  `NationalIdReveal` outside the edit form, and only an authorized "değiştir" reveal path can
  fetch the real value.
- Field-level validation errors, save/cancel via a single "Kaydet" button + `router.refresh()`
  on success, matching the rest of the app's convention (no optimistic local mutation elsewhere
  in this codebase either).

**Not done in this session** (documented, not silently dropped): the *inline*, per-field
hover-to-edit UX described in the brief (student/teacher editors here are still a single
save-all form section, not a per-field click-to-edit control). Given the existing, working,
tested form-based editor pattern used consistently across this codebase, rebuilding it as N
separate inline editors was judged higher risk than value for the remaining time budget and was
deferred. If required, the next step is to split each `<Field>`/input row in both editors into
its own small `InlineEditableField` component (local `editing` boolean, Enter/Escape handlers,
same `actionUpdateStudentProfile`/`actionSetNationalId`/teacher-equivalent action per field) —
the underlying server actions and RBAC already support it.

## E. Student-Teacher-Instrument data model overhaul — **not started**

Not attempted this session due to time budget; A–D were prioritized per instructions. Next
steps for whoever picks this up:
1. Read `prisma/schema.prisma`'s `Student`/`Teacher`/`Lesson` models and existing tenant/branch
   scoping conventions before adding `StudentInstrumentAssignment`.
2. Add the model with a `@@unique([studentId, instrument, teacherId])` constraint, generate a
   migration with `npx prisma migrate dev --name add_student_instrument_assignment` (do **not**
   run `migrate deploy` against a shared DB without a backup — take a DB snapshot first;
   rollback = drop the new table, no other tables are touched by an additive migration).
3. Write a one-off backfill script (pattern after `scripts/seed-demo-csv-teachers.ts`) that reads
   every `Student.teacherId` + `Student.instruments[]` and inserts one
   `StudentInstrumentAssignment` row per instrument, `active: true`. Do not touch historical
   `Lesson.teacherId`/`Lesson.instrument`.
4. Only after schema + backfill are verified: wire read paths (student/teacher detail, new-student
   form multi-row instrument+teacher picker, schedule/attendance/payments) to the new table.

## F. "Personel" (HR/Staff) module — **not started**

Not attempted this session (design/backlog only, per the task's own fallback instruction: "If
time very short, design only (schema + short written plan) is fine"). Suggested next steps:
1. Find the owner identity/role via `src/lib/auth/*` and `src/lib/seed.ts` (grep for how
   `SUPER_ADMIN` is currently distinguished) rather than any name string match; gate via a
   single `OWNER_USER_IDS`-style allowlist read once, in one place (e.g. a new
   `src/lib/auth/owner.ts`), consumed by nav, route guards, and every server action/API route
   that touches staff/salary data.
2. New Prisma model `StaffMember` (+ `StaffSalaryRecord`, `StaffWorkScheduleEntry`,
   `StaffAuditLog`) scoped by `tenantId`/`branchId` like existing models; salary fields must
   never appear in any `ServiceResult` returned to a non-owner role — enforce this by having the
   tool-layer function itself omit the field for non-owner sessions, not by relying on the UI to
   hide it.
3. Full CRUD via the existing Tool Layer + registry pattern (`src/lib/services/tools.ts`,
   `src/lib/agent/registry.ts`), REST route(s) under `src/app/api/v1/`, and a `/panel/personel`
   page gated the same way as the nav entry.

## Quality gate

- `npx tsc --noEmit` — clean (no errors) after all changes above.
- `npm run lint` — clean on the primary run against this repo's own source tree (0
  errors/warnings introduced by this session's changes). A second `npm run lint` invocation
  during this session picked up stray, unrelated `.claude/worktrees/*` directories left over from
  prior sessions (not created or touched by this session) and reported thousands of pre-existing
  errors inside those nested worktree copies — those are out of scope and were not modified.
- `npm test` (`vitest run`) — full suite run; new tests added:
  `src/lib/__tests__/attendance-calendar-race.test.ts`,
  `src/lib/__tests__/auth-teacher-login.test.ts`.

## Files touched this session

- `src/components/attendance-calendar-panel.tsx`
- `src/app/panel/ai/tahsilat-agent/page.tsx`
- `src/lib/auth/users.ts`
- `src/lib/__tests__/attendance-calendar-race.test.ts` (new)
- `src/lib/__tests__/auth-teacher-login.test.ts` (new)

Pre-existing uncommitted changes from before this session (reviewed, not reverted, not
duplicated): `src/app/panel/ogrenciler/[studentId]/page.tsx`, `src/components/login-form.tsx`,
`src/components/student-profile-editor.tsx`, `src/lib/__tests__/demo-teacher-csv.test.ts`,
`src/lib/seed.ts`, `src/lib/types.ts`.
