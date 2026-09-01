# NeviiHub — Resume-From-Here State

Single low-token entry point for a fresh AI session (or human) to pick up
work on this repo without re-reading the whole history. Update the "Current
focus" and "Open work" sections whenever a work session ends; keep it short —
this file is meant to be read whole, cheaply, every session start.

Read order for a new session: this file → `docs/agent-memory/LESSONS_LEARNED.md`
→ whichever doc under `docs/contracts/` or `docs/roadmap/` is named in "Open
work" below.

## Product snapshot

NeviiHub (brand name; repo/internal name `notaplan`) — multi-tenant SaaS for
music schools. Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL
+ JSON/memory store parity. See root `CLAUDE.md` for architecture. Nearing
production launch — demo-only UI content is being removed from customer-facing
screens (login/welcome).

## Owner-approved policy decisions (FINAL, do not re-litigate)

- Telafi: max 2 rights per full education year (not per term). 30-day expiry
  from original missed lesson date.
- Payment windows: card 1–5 inclusive, havale/EFT/nakit 1–15 inclusive.
  Centrally enforced, not user-editable per student/package.
- KDV: all customer-facing prices inclusive, "Tüm eğitim ücretleri KDV
  dahildir.", never "+ KDV".
- Full detail + rationale: `docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`,
  `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`.

## Current focus (last updated: 2026-08-31)

P0 hydration hotfix done: `contract-panel.tsx`'s local `formatDateTr` used
`toLocaleDateString("tr-TR")` with no explicit options — non-deterministic
zero-padding across Node SSR vs. browser, causing a real hydration
mismatch ("02.03.2027" vs "2.03.2027"). Fixed with one canonical
`formatDateTr` in `src/lib/timezone.ts` (explicit `2-digit` Intl options +
explicit `Europe/Istanbul` timeZone — spec-guaranteed deterministic).
Replaced all 12 repo-wide unsafe occurrences. See
`docs/contracts/CONTRACT_CENTER_HYDRATION_DATE_HOTFIX_REPORT.md`. Verified
via live curl against the actual dev server (real route, real data,
correct zero-padded output) and 11 new unit tests — but a literal
browser-console "no hydration warning" check could NOT be performed
(Chrome install needs sudo, unavailable here). Next session with a working
browser should do a 10-second manual check and can then honestly confirm
that last step.

Both deferred feature requests from the same user message are now DONE:

- **Welcome email**: found an already-built, parallel-session email
  infrastructure (`src/lib/email/*`, nodemailer-based, SMTP-or-console
  transport, never fakes delivery) already wired into both new
  student/parent AND new teacher invitation flows
  (`inviteStudentPortalAccessTool`/`inviteTeacherAccountTool` →
  `sendAccountInvitationEmail`). Rewrote that email's HTML/text to a warm,
  branded, "ailemize/ekibimize hoş geldiniz" template with the password-setup
  link (pre-existing, reused), an explicit web portal link, and a
  conditionally-shown mobile app-store links section (`APP_STORE_URL`/
  `PLAY_STORE_URL` env vars — omitted entirely, no broken links, since the
  app isn't published yet). 16 tests pass (11 pre-existing + 5 new).
- **CSV bulk historical-contract import**: built
  `src/lib/import/historical-contracts.ts` + two new tools
  (`previewHistoricalContractImportTool`/`commitHistoricalContractImportTool`)
  + wired into Veri Aktarım Merkezi via the same `CsvImportSection`
  component pattern as every other importer — replacing the earlier
  single-file `DocumentDirectUploadForm` section per the user's explicit
  "not like before" request. Columns mirror the contract-creation screen's
  fields. Each row becomes an archival `DocumentInstance`
  (`status: "uploaded"`) — deliberately bypasses `createContract()`'s live
  financial validation (inappropriate for historical data) and creates NO
  `StudentContract`/`Payment` rows. 14 tests pass, including a real 120-row
  end-to-end import proving the ">=100 rows" requirement.
- KVKK/social-media consent packaging was re-confirmed already correct
  (same Contract Center screen, separate texts per legal source Madde
  19/20 — not literally merged, which would contradict the source).

See `docs/imports/HISTORICAL_CONTRACT_IMPORT_REPORT.md` for the import
feature; the email work has no separate report (small enough to cover
here).

## Earlier pass (2026-08-30, late-night)

Large P0 "contract operability/DOCX/print" package. The DOCX workflow and
A4 print CSS (flagged as "large, not attempted" in the evening pass) are
now IMPLEMENTED — see below. Still open: real Puppeteer-based PDF page
numbers, "Ödeme Şekli" payment-table column fix (needs owner/legal sign-off
on a new draft), full ZIP+CSV bulk historical import, live browser
verification (Chrome install needs sudo, unavailable in this environment).

## Done this pass (2026-08-30 evening)

- Registration form (`src/components/new-student-form.tsx`): duration
  selector now offers full 1–12 (was missing 5/7/8/9/10/11); confirmed it's
  NOT a duplicate of the contract-panel duration field — it drives the
  post-save redirect (trial vs formal contract flow, `src/lib/actions.ts`
  ~line 808), so it was fixed in place, not removed. Öğrenci türü
  (`STUDENT_TYPES`) moved to its own card at the top of the form instead of
  buried under "Akademik bilgiler". Editable "Ödeme günü aralığı" replaced
  with read-only policy text (card 1–5, other 1–15).
- Money inputs: added `.no-spinner` global CSS utility
  (`src/app/globals.css`), applied to the two `type="number"` amount inputs
  in `src/components/student-package-pricing-fields.tsx`.
- Evraklar Merkezi blank-editor bug: root cause was `bodyHtml` being
  stripped when mapping templates for `<DocumentTemplateManager>` in
  `src/app/panel/evraklar/page.tsx`, and the click handler explicitly did
  `setBodyHtml("")`. Fixed to pass `bodyHtml` through and prefill it.
  **Also found and fixed a real bug while there**: `updateDocumentTemplateTool`
  mutates a template row in place (including an active/live template) — this
  violated the draft/activate policy. `document-template-manager.tsx` now
  detects `editingActive` and routes an edit of an active template through
  create-new(active:false)+archive instead of PATCH, with accurate Turkish
  copy explaining this. Added explicit Aktif/Arşiv-Taslak status badges.
- Login/welcome: `src/app/page.tsx` fully rewritten — removed all demo
  pricing/plans/"Demo panelini aç" content, now a clean feature-only welcome
  screen using the new `public/brand/logo.png` monogram. `src/lib/brand.ts`
  `logoPath`/`logoMarkPath` now point to it (was `null`). Login page shows
  the logo too. Demo login credentials in `login-form.tsx` untouched per
  instruction. Sidebar's bottom "Öğretmen portalı"/"Öğrenci portalı" links
  removed (`src/components/sidebar.tsx`).
- Veri Aktarım Merkezi: added a "5. Tarihi Sözleşme Aktarımı" section
  reusing the existing `DocumentDirectUploadForm` (single-file,
  student-linked, `student_enrollment_contract` kind, already has
  tenant/RBAC). This is the scoped version of the request — NOT the full
  ZIP+CSV bulk-matching pipeline from the P0 spec's Phase 8 (still open,
  see below).
- Verified already fixed by an earlier/parallel pass (no work needed):
  "Invalid or expired access token" → `src/lib/api/friendly-error.ts`
  already maps this to safe Turkish messages; form-state preservation on
  validation error → `new-student-form.tsx` already uses `useActionState`
  correctly (see its own top-of-file comment, P0-2 2026-08-29).
- Validation: `tsc --noEmit` clean, targeted eslint clean, `next build`
  clean (full route list generated incl. `/panel/veri-aktar`,
  `/panel/evraklar`), `prisma validate` clean. Full `npm test` run — check
  latest result before assuming pass (was running in background as of this
  write-up).

## Done this pass (2026-08-30 late-night)

- Duration data flow audited end-to-end: `Contract.durationMonths` is
  already the single persisted source of truth (not the registration
  form's `intendedDurationMonths`, which is only a redirect hint/prefill —
  by design, not a bug). Added 6 new e2e tests (5/7/8/9/10/11 months) in
  `contracts.test.ts`, all pass.
  See `docs/contracts/REGISTRATION_DURATION_DATA_FLOW_REPORT.md`.
- **Real bug found+fixed**: contracts shorter than 12 months rendered
  visibly empty installment table rows (blank date + bare " TL"). Fixed via
  `stripUnusedInstallmentRows()` in `src/lib/documents/index.ts`, wired
  through `createDocumentInstance`/`createContract`. Test-proven.
- **Real bug found+fixed**: editing an *active* generic document template
  (same fix area as the evening pass's blank-editor fix, different bug)
  mutated it in place via PATCH — violated draft/activate separation.
  `document-template-manager.tsx` now routes active-template edits through
  create-draft+archive instead. See LESSONS_LEARNED.md 2026-08-30 entry #2.
- DOCX-first template workflow implemented: `mammoth` dependency added;
  `DocumentTemplate` schema extended (additive migration
  `20260830230000_document_template_docx_source`, NOT applied) with
  `sourceFileData`/`sourceFileName`/`sourceMimeType`/`sourceUploadedAt`/
  `sourceUploadedById`; `POST /api/v1/documents/templates/docx-upload`
  (`uploadDocumentTemplateDocxTool`) always creates `active:false` drafts,
  rejects `.doc` with the exact required message, magic-byte validated;
  `GET /api/v1/documents/templates/[templateId]/source-file`
  (`getDocumentTemplateSourceFileTool`) serves the original bytes back
  unmodified. UI wired into `document-template-manager.tsx`. **Not yet
  tried with a real .docx file in a live browser** — only statically
  verified (typecheck/build/lint clean).
- Print CSS overhaul on `/sozlesme-yazdir/[contractId]/page.tsx`: Times New
  Roman, 8pt (print) / 10.5pt (screen), table borders/header shading,
  signature table print-safe. Real "Sayfa X / Y" page numbers are NOT
  achievable via CSS in any mainstream browser's print engine (verified,
  documented) — needs a Puppeteer-based PDF pipeline, flagged as a P1
  infra decision, not silently faked.
- Found (not fixed — legal-text risk): active contract template's payment
  table is missing an "Ödeme Şekli" column that the source .md itself has
  (`2026-2027-ogrenci-kayit-sozlesmesi-v1.md` line 49). Documented in
  `CONTRACT_PRINT_DESIGN_REPORT.md` §5, needs owner/legal sign-off before
  a new draft is created.
- Form-state preservation and student portal contract access both
  re-audited and confirmed still correct (no code changes needed).
- Playwright/Chrome could not be installed in this environment (`sudo`
  required, non-interactive) — visual/live-browser verification for print
  CSS and DOCX upload was NOT possible; disclosed honestly in reports
  instead of skipped silently.

## Open work (large, still not attempted)

- [ ] **Per-lesson period billing + admin attendance-risk report** (owner
      request, 2026-09-02): read-only audit + spec written to
      `docs/implementation-plans/per-lesson-billing-and-attendance-risk-scope.md`
      — no code changed. Key findings: existing uncommitted
      `src/lib/period-lesson-billing.ts` derives per-lesson fee FROM the
      monthly fee (opposite direction from the new requirement, which wants
      per-lesson fee as the primary field) and is wired into only one screen
      (attendance calendar panel), not the 4 required surfaces; "billable
      lesson" has no single definition today (trial/closed-day/makeup-source/
      freeze not excluded); first-payment flow currently REJECTS any manual
      amount that doesn't match the calculated fee (no override+audit path
      yet) but its double-write-prevention (`reuseFirstPaymentId`) is already
      solid and should be reused as-is. Attendance side: `lesson-ops.ts`'s
      "İşlendi"/"Telafi" flags have no reason capture today (makeup's
      `MakeupRequest.reason` is hardcoded, not real user input);
      `notifyAdmins()`/`listAdminUserIdsForTenant()` already give tenant+
      role-scoped admin notification for free but its dedupe is a 24h window,
      not monthly; `LessonOpsBadges`' current colors are inverted vs. the
      requested scheme (İşlendi is reddish today, should be yellow; Telafi is
      yellow today, should be red). Owner decisions needed before
      implementation: same-day-cancellation dependency, new "free lesson"/
      "per-lesson primary fee" concepts need DECISIONS.md entries.
- [ ] Puppeteer-based (or similar) PDF pipeline for real page-number
      footers — infra decision (bundle size, serverless cold start).
- [ ] "Ödeme Şekli" column fix to the active contract template's payment
      table — needs owner/legal approval, then apply via the safe
      new-draft flow (never in-place).
- [ ] Live verification: a real .docx upload/download round-trip in an
      actual browser; visual print-preview check of the new CSS across
      multiple contract durations. Blocked in this environment; do in one
      with a working browser.
- [ ] Full historical contract bulk import: ZIP + CSV manifest, hash dedup,
      student-match review queue, import report. Current state only covers
      the simple single-file-per-student case (see "Done" above) — the CSV
      manifest / matching-queue / audit-report machinery does not exist.
- [ ] Same-day cancellation: schema/types exist (additive, unapplied
      migration `20260829180000_attendance_cancellation_notice`), server
      enforcement logic and 6-option Turkish UI dropdown NOT yet built — see
      lesson #1 in LESSONS_LEARNED.md before touching this.
- [ ] Human-readable template names elsewhere (confirm no `dtpl_...` raw id
      leaks as a *primary* label anywhere outside diagnostics/audit — only
      spot-checked `document-template-manager.tsx` this pass, which already
      showed `t.name` not the id).

## Known safe invariants (verified, don't re-check every session)

- Multi-store parity (json/memory/db) required for any store-layer change.
- `ServiceResult<T>` (`ok`/`fail`) — never throw for expected failures.
- Tool Layer (`src/lib/services/tools.ts`) is the only DB-touching layer.
- Draft templates never auto-activate anywhere in the codebase (verified).
