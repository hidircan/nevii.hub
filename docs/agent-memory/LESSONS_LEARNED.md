# NeviiHub — Agent Lessons Learned

Durable record of mistakes made (and corrected) by AI sessions on this repo, so
future sessions don't repeat them. Append new entries at the bottom with a
date. Keep each entry short: what was tried, why it was wrong, what to do
instead. This file is read at the start of new work, not after — check it
before designing a fix in an area listed below.

## Rules distilled from past incidents

1. **Never infer same-day cancellation (or any "was this really telafi-eligible")
   from `markedAt` / attendance-creation timestamp / any heuristic.** Normal
   attendance marking happens same-day as the lesson, so a `markedAt`-based
   same-day check fires on ordinary attendance and breaks makeup-quota
   concurrency tests. This was tried and reverted once already. The correct
   fix is an explicit, separately-recorded cancellation-notice event (actor,
   source, timestamp, reason) — never a derived/implicit signal.

2. **Telafi (makeup) quota is scoped to the full education year
   (`academicYearStart`), never split by Güz/Yaz term.** Don't key quota
   lookups off `resolveLessonAcademicPeriod`'s term value directly — extract
   only the year component. A student gets 2 total rights per 2026-2027 year,
   not 2 per term.

3. **Telafi expiry is 30 calendar days from the ORIGINAL missed lesson date**
   (institution timezone), not from approval/request/contract/payment date.
   The source contract text ("iptalin gerçekleştiği ay içinde") conflicts with
   this and was deliberately left unedited — see
   `docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`. Do not
   "reconcile" by silently rewriting the legal source; that requires explicit
   owner/legal sign-off.

4. **Payment windows are institutional policy, not a per-student/package
   field.** Card: 1–5 inclusive. Havale/EFT/nakit: 1–15 inclusive (not 6–15,
   not "en geç 15'ine kadar" — the wording must show the full window). These
   are centrally applied in `src/lib/contracts.ts`
   (`resolveContractPaymentDueRule`) and duplicated in
   `src/lib/payment-due-rule-client.ts` (client-safe copy — keep both in sync
   on any wording change). Never expose a user-editable payment-day-range
   field in registration/package UI.

5. **KDV/VAT: all customer-facing education prices are inclusive by
   default.** Never show "+ KDV" anywhere in customer-facing UI, never invent
   a VAT percentage/breakdown. Required disclosure string:
   "Tüm eğitim ücretleri KDV dahildir."

6. **Template lifecycle is strictly draft → activate, never in-place edit of
   an active/historical template.** "Yeni Taslak Sürüm Oluştur" creates a new
   draft (`active:false`); activation is a separate authorized, audited
   action ("Şablonu Aktifleştir") with old-vs-new comparison. Never
   auto-activate. Never mutate historical contract/payment/document snapshots
   — new wording only affects future contracts.

7. **`ContractStatus.active` and a structured/looped placeholder template
   engine were both explicitly deferred** pending analysis of
   `2026-2027-ogrenci-kayit-sozlesmesi-v1.md` — don't add either without
   re-reading that source and the discrepancy report first.

8. **Multi-store parity is mandatory.** Any store-touching logic change
   (quota, cancellation, payments) must be mirrored across `store-json.ts`,
   `store-memory.ts`, and `store-db.ts` — a fix applied to only one store
   silently breaks the other two modes. `store-db.ts` uses
   `pg_advisory_xact_lock` for quota-check concurrency safety; JSON/memory
   paths are naturally single-threaded per test run
   (`fileParallelism: false`).

9. **A TS `??`/`===` precedence bug**: `a === b ?? c` does NOT mean
   `a === (b ?? c)` — `===` binds tighter, so the `?? c` fallback becomes
   dead code. Always parenthesize explicitly when mixing `??` with
   comparison operators.

10. **Do not work on Admin Mobile (`apps/mobile/`)** unless explicitly
    scoped into a task — it has been under parallel-session development;
    treat any changes there as someone else's in-flight work.

11. **When a `<system-reminder>` says a file "changed on disk since you last
    read it," re-read and treat that version as current baseline** — don't
    revert a parallel session's work; apply your own changes additively on
    top of it.

## How to add an entry

```
## YYYY-MM-DD — short title
What was tried / assumed:
Why it was wrong:
Correct approach:
Files involved:
```

---

## 2026-08-30 — generic document template PATCH mutated active templates in place

What was found: `updateDocumentTemplateTool` (`src/lib/services/tools.ts`)
and its `PATCH /api/v1/documents/templates/:id` route unconditionally
mutate the same template row (same id) and bump `version` — including when
that row is the currently `active: true` template used for live document
generation. This is a DIFFERENT, older/simpler system than the canonical
contract-template draft/activate flow (`createContractTemplateDraftFromCanonicalSource`
/ `activateTemplateExclusive` in `src/lib/documents/index.ts`), which does
correctly separate draft creation from activation. The generic Evraklar
"Şablon Yönetimi" UI (`document-template-manager.tsx`) had no such
protection — editing an active KVKK/consent/teacher-contract template would
silently rewrite it in place.

Why it matters: violates the same "never mutate an active/historical
template in place" rule as the contract-template system — just in a
different code path that's easy to miss because it doesn't share code with
`selectActiveContractTemplate`/`activateTemplateExclusive`.

Fix applied: `document-template-manager.tsx` now tracks whether the
template being edited is `active`; if so, submit is routed through
POST-create(as new template, active:true by default)+POST-archive(active:false)
instead of PATCH, so the result is a new draft, not a live rewrite. The UI
explains this. The underlying `updateDocumentTemplateTool` itself was left
alone (still fine for editing an already-inactive/draft/archived row) —
only the client-side routing changed.

Lesson: when auditing "does X system respect draft/activate separation,"
check every template CRUD surface independently — don't assume one
well-designed system (contract templates) means a sibling system (generic
document templates, same underlying `DocumentTemplate` model) got the same
protection. They can diverge.

## 2026-08-30 — fixed-count placeholder loops leave visible empty rows for shorter contracts

What was found: the contract template's installment table is a template
with 12 hardcoded `{{taksitN...}}` rows (documented, deliberate — `renderTemplate`
has no `{{#each}}`/loop support, see `contract-template-schema.ts`). For a
contract shorter than 12 months (e.g. 5 months), rows for unused installments
still rendered — empty date cell + bare " TL" amount — a visible defect in
the printed legal document.

Why it matters: any template with a "fixed N rows, some may be unused"
pattern (installments here, but the same shape could recur for other
checkbox-row or repeated-field sections) will have this defect unless
explicitly guarded. It's easy to miss because it only shows up for
non-max-length data (a 12-month contract looks fine; 5/7/8/9/10/11-month
contracts don't).

Fix applied: `stripUnusedInstallmentRows()` (`src/lib/documents/index.ts`)
removes `<tr>` blocks for unused `taksitN` placeholders from the raw
template text *before* substitution, keyed off the placeholder token (not
fixed table structure) so it survives future column changes. Wired through
`createDocumentInstance`'s `installmentCount` param, called from
`createContract` in `contracts.ts`. Only affects newly-created documents —
matches the immutable-historical-snapshot rule.

Lesson: when a template has a "fixed max N, actual count may be less"
repeated-row pattern, always check what happens at the low end (count=1)
and non-max end (count=5 of 12), not just the high end (count=12) — the
high end is the one that "looks complete" during casual review.

## 2026-08-31 — never call `toLocaleDateString(locale)` without explicit options in SSR components

What happened: `contract-panel.tsx` had a local `formatDateTr(iso)` using
`new Date(iso).toLocaleDateString("tr-TR")` with no `options` object. This
caused a real production hydration mismatch ("02.03.2027" server vs.
"2.03.2027" client) because zero-padding of day/month is NOT guaranteed by
ECMA-402 when no explicit `day`/`month` format options are given — it's
locale-default, implementation-defined behavior that can differ between
Node's SSR process and the browser's runtime.

Fix: added one canonical `formatDateTr` to `src/lib/timezone.ts`, built on
the existing `toZonedYmd` (which already used explicit `Intl.DateTimeFormat`
options + explicit `timeZone`). `"2-digit"` format options ARE spec-guaranteed
deterministic across engines — that's the actual fix, not just "add
padStart". Replaced all 12 repo-wide occurrences of the unsafe pattern
(3 in "use client" SSR components — real hydration risk; 6 in backend
contract-text generators `contracts.ts`/`documents/index.ts`/`tools.ts` —
no hydration risk since computed once and stored, but same bug class, fixed
for consistency).

## 2026-08-31 — check for parallel-session infrastructure before building your own

When asked for a "warm welcome email with a password-setup link," the
instinct was to build new email-sending infrastructure. A quick grep
(`grep -rln "nodemailer\|sendEmail" src/lib`) found a parallel session had
already built `src/lib/email/*` (SMTP/console transport, never fakes
delivery) AND already wired it into both new-student and new-teacher
invitation flows with a working password-setup link. The actual work
needed was much smaller: improve that existing email's template content,
not build a parallel system.

Lesson: before implementing anything that sounds like "add X capability,"
grep for the obvious keywords (the feature name, common library names for
it) across `src/lib` first. This repo has multiple sessions working
concurrently — assume relevant infrastructure may already exist, especially
for common needs (email, storage, CSV import, auth tokens). Building a
second parallel system is wasted work and a future maintenance split.

Lesson: **any `toLocaleDateString`/`toLocaleTimeString`/`Intl.NumberFormat`
call without an explicit `options` object, used inside a component that
renders during SSR (including any "use client" component — Next.js App
Router still SSRs those for the initial HTML), is a latent hydration-mismatch
bug** — not just a formatting nitpick. Always pass explicit format options
(`day: "2-digit"`, etc.) and an explicit `timeZone` when the value crosses
the server/client boundary. Grep for the unqualified pattern
(`toLocaleDateString("tr-TR")` with no second arg) before assuming a single
reported instance is the only one — this class of bug tends to be copy-pasted.
