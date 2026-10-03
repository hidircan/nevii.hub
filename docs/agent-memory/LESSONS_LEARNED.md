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

12. **Every server-emitted `fieldErrors.<key>` needs a render slot in the
    form (`<FieldError>` + `aria-invalid`); post-create PII writes need a
    pre-create pure gate or a checked result.** `actionAddStudent` produced
    `fieldErrors.birthDate` that no JSX ever read (user saw "marked below"
    with nothing marked), and an invalid T.C. checksum fell through the
    unchecked post-create `setNationalIdTool` call (record created, identity
    silently lost). Fix: checksum gate BEFORE create (same
    `ToolValidationFailure` pattern as the other pre-checks in the action)
    + slots in both registration forms. Locks:
    `registration-identity-field-errors.test.ts` (behavior) +
    `registration-field-error-parity.test.ts` (count-based slot tripwire —
    exact-JSX locking avoided per the 2026-09-28 static-test lesson).

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

## `onInput` on a `<form>` silently breaks every controlled `<select>` inside it

Owner report (2026-09-05): on `/panel/ogrenciler/yeni` the Enstrüman, Ders
süresi and Ödeme/iletişim muhatabı dropdowns "do not change in a real
browser" — pick a value, it snaps straight back. Two earlier attempts had
looked at `key`-remounting and controlled/uncontrolled misuse and found
nothing, because the fields' own code was correct.

Root cause, proven with native events captured in a real Chromium
(`input`/`change` listeners in the capture phase on the actual select):

```
instrument:keydown:Piyano   ← user types "K"
instrument:input:Keman      ← browser has applied the new selection
instrument:change:Piyano    ← by change time it is ALREADY back to Piyano
```

`<form onInput={recompute}>` was the culprit. React derives a `<select>`'s
`onChange` from the native **`change`** event (`shouldUseChangeEvent`), but
`onInput` runs on the native **`input`** event, which fires *first*. So:
`input` → the form handler calls `setState` → React flushes synchronously
(discrete event) → it re-renders and writes the *old* state back into every
`<select value={...}>` in the form → the following `change` event now carries
the old value → the select's own `onChange` becomes a no-op. Uncontrolled
selects in the same form were unaffected, which is exactly why the bug looked
field-specific instead of form-wide.

Lesson: **never put `onInput` on a `<form>` (or any ancestor) that contains
controlled `<select>` elements.** A single `onChange` on the form is enough
and correct — React already maps `onChange` to the native `input` event for
text inputs (so live preview keeps working per keystroke) and to `change` for
selects/checkboxes.

Lesson (debugging method): when a native control "doesn't change", attach raw
capture-phase `input`/`change`/`keydown` listeners and print `el.value` in
each. Programmatic `element.value = x` / Playwright's `selectOption` sets the
value and fires both events in one task, so it **passes even when the bug is
real** — it was only real keyboard type-ahead against an uncontrolled control
field in the same form that exposed the difference.

## 2026-09-05 — portal sayfaları /login'e yönlendirerek SONSUZ DÖNGÜ üretiyordu

What was tried / assumed: `/ogrenci`, `/ogretmen` ve `/veli` sayfaları,
oturum GEÇERLİ olduğu hâlde oturuma bağlı kaydı (öğrenci/öğretmen satırı)
bulamadıklarında `redirect("/login")` yapıyordu (15 ayrı çağrı yeri). Varsayım:
"kayıt yoksa kullanıcıyı girişe göndermek güvenli bir düşüş".

Why it was wrong: `/login` geçerli bir oturum görünce kullanıcıyı
`homePathForRole(role)`ye — yani AYNI portala — geri gönderiyor. Sonuç
`/ogrenci → /login → /ogrenci → …` SONSUZ döngüsü. Gerçek tarayıcıda
gözlendi (şifre oluşturma sonrası öğrenci portalına yönlendirmede); tarayıcı
hiçbir hata göstermez, sayfa sonsuza kadar titrer. Bu bir KİMLİK DOĞRULAMA
hatası da değildir — kullanıcı gerçekten giriş yapmıştır, yalnızca hesabına
bağlı kurum kaydı silinmiştir.

Correct approach: döngüyü TEK yerde kır. `src/lib/auth/portal-record-missing.ts`
tek bir hedef sabiti verir (`/login?hesapKaydiYok=1`); `/login` bu işareti
görünce OTOMATİK YÖNLENDİRME YAPMAZ ve durumu açıklayan bir uyarı gösterir.
15 çağrı yerinin hepsi bu sabite çevrildi. `portal-redirect-loop.test.ts`
kaynak taraması yaparak çıplak `redirect("/login")`in geri gelmesini engeller.

Lesson: bir "güvenli düşüş" hedefi, hedefin KENDİSİ de yönlendirme yapıyorsa
güvenli değildir. A→B yönlendirmesi eklerken B'nin aynı koşulda A'ya geri
gönderip göndermediğini HER ZAMAN kontrol edin. Bu sınıftaki hatalar birim
testinde görünmez; yalnız gerçek tarayıcıda navigasyon zincirini izleyerek
(`page.on("framenavigated")`) yakalanır.

Files involved: `src/lib/auth/portal-record-missing.ts`, `src/app/login/page.tsx`,
`src/app/ogrenci/**`, `src/app/ogretmen/**`, `src/app/veli/**`,
`src/lib/__tests__/portal-redirect-loop.test.ts`.

## 2026-09-05 — kurum logosu harici URL'de tutulunca CSP tarafından SESSİZCE engelleniyordu

What was tried / assumed: "logo sözleşmede görünmüyor" raporu, önce bir
HİZALAMA/BOYUT sorunu sanıldı; iki ayrı tur ortalama (`text-align`, sonra
`display:block;margin:0 auto`) ve boyut düzeltmesi yapıldı. Logo yine
görünmedi.

Why it was wrong: gerçek kök neden CSS değil, GÜVENLİK POLİTİKASIYDI.
`next.config.ts` içindeki CSP `img-src 'self' data: blob:` diyor; kurumun
`settings.logoUrl` değeri ise harici bir `https://www.niluferacar.com.tr/...png`
adresiydi. Tarayıcı isteği `csp` gerekçesiyle iptal ediyor, GÖRÜNÜR hiçbir
hata vermiyor — yalnız `naturalWidth === 0` olan boş bir `<img>` kalıyor.
Aynı sebeple hoş geldiniz/şifre e-postalarında da görünmüyordu.

Correct approach: CSP'yi keyfi dış hostlara AÇMA. Logoyu bir kez içeri al:
`importSchoolLogoFromCurrentUrlTool` görseli sunucu tarafında indirir
(yalnız https, yalnız ZATEN KAYITLI adres — istemciden serbest URL kabul
edilmez, MIME/boyut sınırları yükleme akışıyla aynı) ve yükleme akışıyla
AYNI `data:` URI olarak saklar. Kurulum ekranı harici bir logo tespit edince
bunu açıkça anlatan bir uyarı ve tek düğme gösterir.

Lesson: bir görsel/iframe/font "hiç görünmüyor" ama DOM'da duruyorsa, CSS'e
dalmadan ÖNCE ağ katmanına bakın — `page.on("requestfailed")` ile
`errorText === "csp"` bunu saniyeler içinde söyler. `naturalWidth === 0` +
`complete === true` kombinasyonu "yüklenemedi" demektir, "yanlış boyutlandı"
değil.

Files involved: `next.config.ts` (CSP, DEĞİŞTİRİLMEDİ), `src/lib/institution-logo.ts`,
`src/lib/services/tools.ts` (`importSchoolLogoFromCurrentUrlTool`),
`src/components/school-logo-form.tsx`.

## 2026-09-05 — "adres zaten kayıtlıydı" SSRF için YETERLİ bir savunma değildir

What was tried / assumed: `importSchoolLogoFromCurrentUrlTool` yazılırken,
"istemciden serbest URL kabul etmiyoruz, yalnız kurumun ZATEN KAYITLI logo
adresini indiriyoruz" gerekçesiyle düz `fetch(current, { redirect: "follow" })`
yeterli sayıldı.

Why it was wrong: iki ayrı boşluk vardı. (1) `redirect: "follow"` — tamamen
meşru bir dış host, isteği 302 ile `169.254.169.254` (bulut metadata) veya
başka bir iç adrese taşıyabilir; başlangıç adresinin güvenilir olması bunu
ENGELLEMEZ. (2) İndirilen bayt burada SAKLANIP EKRANDA GÖSTERİLİYOR — yani
bu, blind değil OKUNABİLİR bir SSRF: iç ağdan okunan içerik doğrudan sızar.
Ayrıca gövde `arrayBuffer()` ile tamamen belleğe alınıp SONRA boyut kontrolü
yapılıyordu.

Correct approach: tüm dış istekler `src/lib/net/safe-outbound-fetch.ts`ten
geçer — yalnız `https`, DNS'ten dönen TÜM adresler özel/loopback/link-local/
reserved bloklarına karşı doğrulanır, yönlendirmeler `redirect: "manual"` ile
HER HOP yeniden doğrulanarak elle izlenir, hop ve gövde boyutu sınırlıdır
(gövde akış sırasında sayılır, `Content-Length`e güvenilmez). DNS rebinding
bilinçli olarak açık bırakıldı ve kodda `ponytail:` notuyla işaretlendi
(yalnız kimliği doğrulanmış yönetici tetikler).

Lesson: SSRF değerlendirmesinde "URL nereden geliyor" sorusu TEK BAŞINA
yetmez; "istek nereye VARABİLİR" (yönlendirme zinciri, DNS) ve "yanıt
çağırana geri gösteriliyor mu" soruları da sorulmalıdır. Yanıt gösteriliyorsa
tehdit modeli blind SSRF değil, veri sızıntısıdır.

Files involved: `src/lib/net/safe-outbound-fetch.ts`,
`src/lib/services/tools.ts` (`importSchoolLogoFromCurrentUrlTool`),
`src/lib/__tests__/safe-outbound-fetch.test.ts`.

## 2026-09-05 — old-contract frozen external logo URL still silently CSP-blocked; fix scoped to the contract call site, not the shared `institutionLogoHtml`

What was found (release-blocker sprint audit): the CSP-block fix above only covers the *live* institution logo going forward (upload/import always produces a `data:` URI now). Contracts created **before** that fix still carry a frozen `contractDataSnapshot.logoUrl` that may be a plain `https://` URL — `getContractHtmlTool` rendered it straight into `<img src="...">`, which the app's own CSP (`img-src 'self' data: blob:`) silently blocks with no visible error, same failure mode as the original bug.

Why the fix is NOT in `institutionLogoHtml`/`sanitizeLogoUrl` (`src/lib/institution-logo.ts`): that function is shared with the welcome/reset-password emails (`src/lib/auth/invitation.ts`), which are NOT subject to the app's CSP — external image URLs render fine in most mail clients. Six existing tests in `institution-logo.test.ts` also assert a plain `https://` URL renders straight into the `<img src>` — that's correct behavior for the function in isolation. Making the function itself hide all external URLs would have silently broken email logos and been the wrong fix for the wrong layer.

Fix applied: in `getContractHtmlTool` (`src/lib/services/tools.ts`, right before the `prependInstitutionLogo` call), detect `contract.contractDataSnapshot.logoUrl` matching `/^https?:\/\//i` (a frozen external URL) and substitute the institution's **current** logo *only if it's already a safe `data:image/` URI*; otherwise pass `null` through, which `institutionLogoHtml` already renders as a graceful institution-name text fallback. A contract with **no** frozen logo at all (`undefined`) is untouched — the P0-E rule that such contracts must never silently pick up the live logo still holds; this only fires when a frozen logo *exists* but is the blocked kind. The frozen snapshot itself is never mutated, only the rendered display HTML. Tests: `contract-logo-snapshot.test.ts` (2 new cases — fallback-to-current-data-URI, and fallback-to-text-when-current-is-also-external).

Lesson: when a shared display-formatting function is reused across contexts with **different security policies** (an app page under CSP vs. an email opened outside the app entirely), a policy-driven fix belongs at the call site for the affected context, not inside the shared function — otherwise it either doesn't fix the real bug (email untouched, not the issue here) or over-corrects and breaks a context where the original behavior was actually correct (email, in this case).

## 2026-09-05 — `prisma migrate status`/`migrate deploy` hangs indefinitely against a PgBouncer transaction-pooling URL

What was found: `.env.local`'s `DATABASE_URL`/`DIRECT_URL` point to a remote Supabase pooler (`aws-0-*.pooler.supabase.com:6543`, `pgbouncer=true`). Running `npx prisma migrate status` (or `deploy`) with that URL hangs with zero output indefinitely (not a timeout/error — it just never returns) instead of failing fast. This is a known Prisma/PgBouncer transaction-mode incompatibility (`migrate` needs a session-level/direct connection, not a pooled transaction-mode one).

Correct approach: never diagnose migration state through the pooled URL. A real local Postgres 17 instance was already running on this machine (`pg_isready` on 5432, databases `notaplan`/`notaplan_demo`) — that's the actual "local" target for `prisma migrate status`/`deploy` rehearsals, reached via `DATABASE_URL="postgresql://$(whoami)@localhost:5432/notaplan" DIRECT_URL=<same> npx prisma migrate ...`, overriding the env inline rather than editing `.env.local`. For a real staging/production Supabase target, use the un-pooled `DIRECT_URL` (or a direct 5432-port connection string), never the 6543 pgbouncer one, for any `migrate` command.

Lesson: `STORE_MODE=json` for local dev does not mean there's no local Postgres available — check `pg_isready`/`psql -l` before assuming the only `DATABASE_URL` in `.env.local` is "the local database." A pooled connection string in a local env file is very likely meant for the app's own Prisma Client queries (which work fine over PgBouncer in transaction mode), not for schema-migration commands.

## 2026-09-05 — the Supabase *session* pooler (port 5432) is the working `DIRECT_URL`; the previous entry's workaround is now unnecessary

What was found (follow-up to the entry above, now RESOLVED): `.env`/`.env.local`
had `DIRECT_URL` pointing at the **same** host *and* the **same port 6543** as
`DATABASE_URL` — only the `pgbouncer=true` flag differed. So `DIRECT_URL` was
not direct at all, which is exactly why `prisma migrate status` hung.

Correct approach: Supabase exposes a **session-mode** pooler on the same host
at **port 5432** (`aws-0-<region>.pooler.supabase.com:5432`, same credentials,
IPv4-safe). Swapping only the port makes `prisma migrate status`/`deploy` work
immediately — verified against the real Supabase project on 2026-09-05, it
returned a full migration list in seconds instead of hanging. The direct host
`db.<ref>.supabase.co:5432` also works but is IPv6-only for newer projects
unless the IPv4 add-on is enabled, so prefer the session pooler. Documented in
`.env.example`.

Lesson: when a `DIRECT_URL` exists, don't assume it is direct — compare its
host **and port** against `DATABASE_URL` before trusting it. A copy-pasted
"direct" URL that differs only by a query flag is the most common form of this
bug, and its symptom (a silent hang) looks nothing like a configuration error.

## 2026-09-05 — annex sections must fall back to the canonical source, not wait for a template activation

What was tried/assumed: the unified contract output (main → KVKK →
photo/video) read its annex sections from the tenant's **active**
`kvkk` / `parent_social_media_consent` `DocumentTemplate` rows. When a tenant
still had the old one-line stub templates active, the output was produced but
legally thin, and the fix was framed as a human step: "generate a draft from
the canonical source, then activate it in Evraklar → Şablon Yönetimi."

Why it was wrong: that turns a *normal* new-student enrollment into a flow
that silently depends on an unrelated admin action nobody is prompted to
perform. Until someone activates a template, every new contract ships with a
legally weak KVKK/consent section — and nothing in the enrollment flow blocks
or even reliably surfaces it.

Correct approach: `resolveAnnexBody` (`src/lib/contract-annexes.ts`) picks the
tenant's own active template only when its body reaches
`MIN_MEANINGFUL_ANNEX_BODY_LENGTH` (400 chars); otherwise it falls back to
`canonicalTemplateBody(kind)` (`src/lib/documents/index.ts`, the in-code
canonical text of the 2026-2027 source document). No template row is created,
mutated, or activated — only the *output* is fed. The draft/activate
separation for templates is untouched, and the Contract Center notice becomes
informational rather than a blocker.

Lesson: a "the admin just has to activate X first" step in the middle of an
everyday flow is a design bug, not a documentation gap. If the system already
holds the correct content, read it directly at the point of use and keep the
admin action as an optional way to *record* the change — never as the gate.

Files involved: `src/lib/contract-annexes.ts`, `src/lib/documents/index.ts`,
`src/components/contract-annex-template-notice.tsx`,
`src/lib/__tests__/contract-unified-output-canonical.test.ts`.

## 2026-09-05 — "prepare a production release" started from a repo 170 commits ahead of what production actually runs

What was found while running the release gates (all verified in-session, not
from memory):

- `git rev-list --left-right --count origin/main...HEAD` → `0 170`. Local
  `main` is **170 commits ahead** of `origin/main`; nothing has been pushed
  since `4ab2f3d`.
- The live Vercel production deployment (`notaplan.vercel.app`, project
  `prj_hmg2Nu2GtPs0JrfEcllpeUIbWpIG`) is built from exactly that `4ab2f3d`.
  Production is therefore running a build from before ~all of the recent work.
- The GitHub repo (`hidircan/notaplan`) is **public** — pushing is a
  disclosure action, not just a deploy trigger.
- The Supabase project (`uqkafczrplqitzumtrqy`, "Maestron Project" — the only
  one in the account, and the one both `.env` files point at) has **zero
  tables** and **no `_prisma_migrations` table**; `prisma migrate status` via
  the session pooler reports **0 of 65 migrations applied**.
- `vercel env ls production` fails with "The specified token is not valid" —
  the Vercel CLI is not logged in, so production env vars (`STORE_MODE`,
  `DATABASE_URL`, `JWT_SECRET`, SMTP…) could not be read or verified.

Why it matters: with that state, "apply the pending `lessonStartDate`
migration to production" is not a one-column additive change — it is a
first-time provisioning of the entire schema against an empty database, on an
environment whose runtime configuration cannot be inspected. And "deploy" means
publishing 170 commits to a public repo, which auto-deploys.

Correct approach: stop at "commits prepared, gates green" and hand the
deploy/push decision back to the human operator with these facts. Do not push
or migrate to work around an unverifiable environment.

Lesson: before promising a deploy, establish *what production actually is* —
which commit it runs, whether its database is provisioned, whether its env
vars are readable — and do it early. A release plan written against the
assumption that production mirrors the local repo can be wrong by 170 commits.

## 2026-09-06 — production Supabase boş görünüyordu çünkü uygulama hiç veritabanı kullanmıyor (`STORE_MODE=memory`)

Ne bulundu (hepsi oturum içinde doğrulandı, hafızadan değil):

- `GET https://notaplan.vercel.app/api/v1/health` → `{"storeMode":"memory"}`.
  Canlı production **process belleğinde** çalışıyor: her cold start'ta
  `createSeedData()` yeniden seed'liyor, hiçbir veri kalıcı değil.
- `src/lib/config.ts:7` → `(process.env.STORE_MODE ?? "json")`. Değişken set
  edilmezse kod **sessizce** dosya/bellek moduna düşer; hata vermez, uyarmaz.
- `STORE_MODE` `db` olmadığı sürece `src/lib/db.ts` hiç import edilmez, yani
  Prisma Client instantiate bile edilmez ve Supabase'e **tek bir bağlantı**
  açılmaz.
- Supabase Management API (salt-okunur): production ref `uqkafczrplqitzumtrqy`
  → 0 tablo, 0 migration. Test ref `vxzewyiwfshobjizzetw` → 0 tablo.
- `neviihub.com` **DNS'te hiç çözümlenmiyor** (`dig` boş, `curl` "Could not
  resolve host"). Canlı adres yalnız `notaplan.vercel.app`.
- Canlı build'in `<title>`'ı hâlâ "Maestron — Müzik Okulu Yönetimi" ve
  `/api/v1/ready` **404** — yani canlı build repo'nun çok gerisinde (`4ab2f3d`).

Neden önemli: "Supabase boş, migration atalım" teşhisi **yarım** bir teşhisti.
Migration tek başına hiçbir şeyi değiştirmez — `STORE_MODE=db` set edilmedikçe
uygulama Supabase'e bakmayı sürdürmez. İki bağımsız neden var ve ikisi de
düzeltilmeli: (1) şema hiç kurulmadı, (2) runtime zaten DB moduna geçmedi.

Doğru yaklaşım: bir veritabanının "boş" olduğunu görünce önce **uygulamanın o
veritabanına gerçekten bağlanıp bağlanmadığını** kanıtla. Bu repoda bunun
maliyeti sıfır: `/api/v1/health` `storeMode`'u herkese açık döndürüyor, secret
gerektirmiyor. Aynı endpoint deployment sonrası doğrulamanın da en ucuz yolu.

Ders: bir ortamda "veri yok" gözlemi üç ayrı hipotez üretir — veri silindi,
şema kurulmadı, ya da uygulama oraya hiç yazmıyor. Üçüncüsü en sık atlanan ve
bu projede doğru olanıydı. Env varsayılanının sessizce başka bir backend'e
düşmesi (`?? "json"`) bu hatayı görünmez kılıyor; bu yüzden test ortamı env
şablonunda `STORE_MODE=db` açıkça zorunlu tutuldu ve
`assertDbStoreMode()` guard'ı eklendi.

İlgili dosyalar: `docs/PRODUCTION_DATABASE_SOURCE_OF_TRUTH.md`,
`src/lib/env/test-target-guard.ts`, `src/app/api/v1/health/route.ts`,
`src/lib/config.ts`.

## 2026-09-06 — `STORE_MODE=json` yeşil test suite'i, db-modu kırıklarını GÖRMÜYOR

Test Supabase'e yapılan İLK gerçek `STORE_MODE=db` seed denemesi, 2655 testin
tamamı yeşilken üç ayrı üretim hatası ortaya çıkardı. Üçünün de ortak kök
nedeni aynı: **json/memory store şemasız yazar, PostgreSQL yazmaz.**

1. `Unknown argument` — `store-db.addStudent`, aldığı nesneyi
   `prisma.student.create`'e `...student` ile spread ediyor. `Student` kolonu
   olmayan girdi alanları için elle tutulan bir DENYLIST var; `lessonDays` ve
   `firstPaymentAdjustmentReason` listeye yazılmamıştı. `lessonDays`'i gerçek
   kayıt formu gönderiyor, yani db modunda ders günü seçilen HER kayıt
   patlıyordu. Aynı hata daha önce `instrument` ile de yaşanmış (kod içinde
   yorumu duruyor) — yani bu, üçüncü tekrarı.
2. FK ihlali — `switchLessonOpsFlag`, yoklama kaydı yokken
   `MakeupRequest.attendanceId` için `uid("att")` ile var olmayan bir id
   uyduruyordu. json'da referans denetlenmiyor; db'de zorunlu + `@unique` FK.
   "Telafi" işaretleme db modunda tamamen kırıktı.
3. Migration geçmişi replay edilemiyor — 65 migration'ın 32'si PostgreSQL'e
   geçişten önceki MySQL DDL'i (backtick, `VARCHAR(191)`, `utf8mb4`).
   `migrate deploy` ilk MySQL migration'ında `42601` ile durdu. Test DB,
   operatör onayıyla `migrate diff --from-empty --to-schema` baseline'ı +
   65 × `migrate resolve --applied` ile kuruldu; repo geçmişi DEĞİŞTİRİLMEDİ,
   borç açık kaldı.

Ders: json modunda geçen bir test, db modunda geçeceğinin kanıtı DEĞİLDİR.
Şema/FK gerektiren her yol için, db'ye bağlanmadan çalışan bir **parite testi**
yazılabilir ve yazılmalıdır: `student-input-only-fields.test.ts` şema
kolonlarını zod alanlarıyla karşılaştırıyor, `makeup-attendance-fk.test.ts`
üretilen `attendanceId`'nin gerçek bir kayda işaret ettiğini doğruluyor.
Elle tutulan denylist'ler sessizce eskiyor — testi denylist'e değil,
**şemanın kendisine** bağla.

## 2026-09-06 — `sslmode=require` artık libpq anlamına gelmiyor (pg 8.23)

Supabase pooler sertifikasını kendi özel CA'sı ile imzalıyor; bu CA public
trust store'da yok. `pg-connection-string` 2.14 ile `sslmode=require`
libpq'daki "şifrele, doğrulama" anlamını KAYBETTİ — artık tam doğrulama
yapıyor ve `SELF_SIGNED_CERT_IN_CHAIN` veriyor. Daha kötüsü: `sslmode` hiç
verilmezse `pg` TLS'i tamamen kapatıyor, yani bağlantı sessizce ŞİFRESİZ
kuruluyor.

Çözüm `rejectUnauthorized: false` DEĞİL: Supabase'in yayınladığı kök sertifika
(`prod-ca-2021`) `src/lib/db/connection.ts` içinde pinlendi ve doğrulama açık
bırakıldı. Dikkat: `pg`, `new Pool({ connectionString, ssl })` çağrısında
connection string'i parse edip açık `ssl` alanının ÜSTÜNE yazıyor
(`Object.assign({}, config, parse(connectionString))`) — bu yüzden ssl
parametreleri string'den TEMİZLENİYOR, aksi halde pinlenen CA sessizce yok
sayılırdı.

## 2026-09-06 — Seed script'lerinde sabit gün ofsetleri takvime bağlı hata üretir

`isoDaysAgo(20)` gibi sabit ofsetler iki ayrı şekilde kırıldı: (a) kapalı güne
(Pazartesi/dönem/tatil) denk gelince araçlar işlemi reddetti — seed
çalıştırıldığı GÜNE göre bazen geçip bazen kaldı; (b) telafi kotası DÖNEM
başına olduğu için, dönem başında çalıştırılan seed "aktif dönem"
senaryolarını bir önceki döneme yazdı (Öğrenci B "2/2" yerine "0/2" göründü).
Tarihler artık uygulamanın kendi `resolveDayStatus` /
`resolveLessonAcademicPeriod` fonksiyonlarıyla seçiliyor.

Ayrıca idempotency anahtarı **öğretmen adıydı** ve öğretmen İLK adımda
yazılıyordu: yarıda kalan bir seed, scripti kalıcı olarak kilitliyordu
("zaten seed edilmiş" deyip çıkıyor, öğrenci hiç oluşmuyordu). Anahtar,
seed'in SON artefaktı olmalı (burada: vitrin öğrencisi + ≥3 gelecek ders) ve
her blok kendi "zaten var mı" kontrolünü yapmalı. Koşulsuz bırakılan vitrin
bloğu, her tekrar çalıştırmada vitrine 8 ders DAHA ekledi.

Ders: seed idempotency'sini **ilk** yazılan kayda değil **son** yazılan kayda
bağla; aksi halde yarım kalan her çalıştırma ya kilitler ya da çoğaltır.

## 2026-09-06 — Turbopack çıplak `require()` ile ulaşılan modülü SESSİZCE bundle'a koymaz

`src/lib/store.ts` backend seçimini `require("./store-db")` /
`require("./store-memory")` ile yapıyordu. Next 16 Turbopack production
server build'inde bu çağrı için modül referansı emit ediliyor ama **modülün
kendisi hiç emit edilmiyor** ve build hiçbir uyarı vermiyor
(`.next/server/chunks` içinde `store-db` yalnızca `.map` dosyalarında geçiyordu).
Sonuç: `STORE_MODE=db` deploy'unda `store` nesnesi boş kalıyor ve /panel'in ilk
store çağrısı `TypeError: ae.listTenants is not a function` ile 500 dönüyordu.
`store-memory` tesadüfen çalışıyordu — `payments/collect.ts` içindeki
`await import("../store-memory")` onu bundle'a sokuyordu.

İkinci kat: `require(...) as StoreApi` cast'i, tip kontrolünü de susturuyordu —
backend'lerin sözleşmeye uyup uymadığı hiçbir zaman derlenmiyordu.

Çözüm: üç backend de statik `import * as` ile alınır, seçim
`satisfies Record<typeof STORE_MODE, StoreApi>` ile derleme zamanında bağlanır.
"json deploy'da Prisma yüklenmesin" gerekçesi zaten geçersizdi: `services/tools.ts`
her deploy'da `./db`'yi statik import ediyor ve oradaki istemci tembel bir Proxy
(import bağlantı açmaz).

Ders: bir modüle YALNIZCA `require()`/koşullu çağrı üzerinden ulaşılıyorsa,
bundler onu düşürebilir ve bunu build hatası olarak GÖRMEZSİN — hata ancak o
mod canlıda çalıştığında ortaya çıkar. Statik import + `satisfies` ile bağla.
Koruma: `src/lib/__tests__/store-mode-parity.test.ts`.

## 2026-09-07 — "Yavaş" şikâyetinin kök nedeni sorgu planı değil, GİDİŞ-DÖNÜŞ SAYISIydı

Owner UAT'sinde "Yoklama Takvimi ve Ders Programı yavaş" bildirildi. İlk
refleks (index eksik mi, N+1 sorgu var mı) YANLIŞ olurdu — ölçüm başka bir
şey gösterdi:

- `/api/v1/attendance-calendar/month` tek çağrıda **1.03 sn** sürüyordu ve
  istemci bir dönem için bunu **ay ay, `for`+`await` ile SIRAYLA 10 kez**
  yapıyordu: ölçülen **10.1 sn**. Sorgu planı kusursuzdu; sorun aynı büyük
  sorgunun 10 kez çalıştırılmasıydı.
- Her ay çağrısı `readData()` ile tenant'ın **TÜM** `AppData`'sını okuyordu
  (School + 12 ilişki). Tek öğrencinin tek ayı için tüm okulun verisi.
- Ders taşıma `updateLessonScheduleTool`'da **5 kez** tam-tenant okuması
  yapıyordu; üstüne istemci `router.refresh()` çağırarak server action'ın
  `revalidatePath` ile ZATEN yaptığı RSC render'ını İKİNCİ kez tetikliyordu.

Ders: "yavaş" raporunda önce **kaç kere ağa çıkıldığını** say, sonra her
çıkışın maliyetine bak. Index/cache/region değişikliğine gitmeden önce
gidiş-dönüş sayısını ölç — bu turda hiçbir index gerekmedi.

İkinci ders — **ölçüm aracına da güvenme, önce doğrula**: ilk tarayıcı
ölçümüm öğrenci değişimini "128 ms" olarak raporladı. Gerçekte navigasyon
hiç tamamlanmamıştı; ekranda ÖNCEKİ öğrencinin takvimi durduğu için "veri
görünür" kontrolü anında geçiyordu. Yani ölçüm aracı, ölçmeye çalıştığı
hatanın (bayat veri) kurbanı oldu. Doğru ölçüt "başlık YENİ öğrenciye döndü
VE takvim hücreleri doldu" olmalıydı; öyle ölçünce **1 565 ms** çıktı.

Detay/tablo: `docs/performance/ADMIN_WEB_P0_BASELINE.md`.

## 2026-09-07 — "Minified React error #441" bir hata DEĞİL, hatayı gizleyen sarmalayıcıdır

"Demo verisini sıfırla" test ortamında `Minified React error #441` veriyordu.
Bu kodun metni: *"An error occurred in the Server Components render. The
specific message is omitted in production builds…"* — yani **gerçek istisnayı
saklayan genel bir kapak**. Kodu aramak ("React 441 nedir") teşhis vermez.

Gerçek istisna, YEREL ve tek kullanımlık bir PostgreSQL veritabanında yeniden
üretilerek bulundu (test/production DB'ye DOKUNULMADAN — şema
`prisma migrate diff --from-empty --to-schema | psql` ile kuruldu, `db push`
DEĞİL; `db push` artık AI ajanları için açık onay istiyor):

```
Invalid `prisma.attendance.deleteMany()` invocation in store-db.ts:588
Foreign key constraint violated on: `MakeupRequest_attendanceId_fkey`
```

`seedDatabase`'in `prisma.$transaction([...])` listesi **verilen sırayla**
çalışır ve `Attendance`, ona zorunlu FK ile bağlı `MakeupRequest`'ten ÖNCE
siliniyordu. Boş bir tenant'ta fark edilmiyordu — telafi verisi olan her
tenant'ta patlıyordu. İkinci kat: `resetDemoTool` düzgün bir `fail(...)`
dönüyor ama `actionResetDemo` bunu `assertOk` ile **throw**'a çeviriyor;
server action'da yakalanmayan throw istemciye yalnız digest hatası olarak
ulaşır.

Dersler:
1. Minified React hata kodlarının çoğu **sınıf** bildirir, neden değil.
   Gerçek nedeni sunucu logundan veya yerel bir tekrar üretimden al.
2. `$transaction([...])` **sıralıdır**; silme sırası FK grafiğini izlemek
   zorundadır. Koruma elle tutulan bir listeye değil ŞEMAYA bağlanmalı:
   `src/lib/__tests__/seed-database-delete-order.test.ts` Prisma şemasındaki
   cascade ETMEYEN her FK için sırayı doğrular, DB bağlantısı gerektirmez.
3. Bir `ServiceResult` hatasını `assertOk` ile throw'a çevirmek, kullanıcıya
   anlamsız bir "Runtime Error" göstermenin en kısa yoludur (aynı desen
   2026-08-29'da `actionAddStudent`'ta da yaşanmıştı — bkz. actions.ts yorumu).

## 2026-09-07 — Paralelleştirme, kilitsiz oku-değiştir-yaz store'da veri kaybettirir

Ders taşımadaki üç bildirimi (`notifyLessonRescheduled`) `Promise.allSettled`
ile paralelleştirmek server action'ı **5 100 → 4 474 ms**'ye indirdi. Ama
`notification-center-v2.test.ts` kırıldı: `json`/`memory` modunda
`createNotification` kilitsiz bir oku-değiştir-yaz'dır
(`loadAll()` → `saveAll([...all, record])`, `src/lib/notifications/index.ts:104`).
Eşzamanlı iki yazımdan biri SESSİZCE kayboluyor.

Değişiklik **geri alındı** ve nedeni koda yazıldı. Not: bu, bugün de var olan
gizli bir hatadır — json modunda aynı anda iki istek bildirim yazarsa biri
kaybolur; yalnızca bu turda görünür hale geldi.

Ders: bir işi paralelleştirmeden önce, yazdığı deponun eşzamanlılık
sözleşmesine bak. Prisma'nın güvenli olması, aynı fonksiyonun json/memory
kolunun da güvenli olduğu anlamına GELMEZ (mode parity yalnız veri şeklinde
değil, eşzamanlılık davranışında da geçerli).

## 2026-09-07 — Mutasyon yolunda tam `AppData` okumak: ölçün, tahmin etmeyin

**Ne yanlıştı.** `updateLessonScheduleTool` ve `setLessonOpsFlagTool` bir
mutasyonda tenant'ın TÜM `AppData`'sını **üçer kez** okuyordu. Sebep kötü kod
değil, **store sözleşmesiydi**: `StoreApi.updateLessonSchedule` `AppData`
DÖNDÜRMEK zorundaydı, bu yüzden yazmadan sonra her şeyi yeniden okuyordu.
Ölçüm: taşıma 64 DB gidiş-dönüşü (42'si bu okumalar), statü 46 (42'si).

**Doğrusu.** Saf iş kurallarını yeniden yazmak yerine onlara **AYNI `AppData`
sözleşmesini, yalnız ilgili satırlarla doldurulmuş** olarak verin. Dilim TEK
yerde tanımlanır (`src/lib/lesson-scope.ts`); db onu filtrelenmiş Prisma
`include`'larıyla üretir ve mevcut mapper'ı (`mapSchoolToAppData`) aynen
kullanır — mapper varlık-başına çalıştığı için bu bedavaya gelir.
**json/memory de aynı dilimi uygulamalı** (sonra bütüne birleştirerek);
yoksa dar dilimin yetersizliği yalnız production'da (db modunda) ortaya çıkar,
testler json modunda koştuğu için hiçbir şey yakalamaz.

**Ölçüm dersi.** Yerel DB'de RTT ~0.1 ms olduğu için "kaç sorgu" ile "ne kadar
sürer" arasındaki bağ görünmez. Harness'a **yapay RTT** (`BENCH_RTT_MS`)
eklemek, gerçek dağıtımın davranışını modelledi ve 163 ms'de önceki turun
GERÇEK tarayıcı ölçümlerini (5.1 sn taşıma, 2.4 sn statü, 528 ms `readData`)
±%10 içinde yeniden üretti. Yani ölçüm ortamı yoksa **sorgu SAYISINI** ölçün
ve gecikmeyi simüle edin; "yerelde hızlı" hiçbir şey kanıtlamaz.

**Bulunan ikinci hata (gerçek veri kaybı).** `src/lib/notifications/index.ts`
json/memory yolunda `loadAll()` → `saveAll([...all, rec])` yapıyordu, KİLİTSİZ.
12 eşzamanlı yazımdan **11'i kayboluyordu** (test kilit kaldırılarak
kanıtlandı). Önceki tur bunu fark etmiş ama kök nedeni düzeltmek yerine
paralelleştirmeyi geri almıştı. **JSON dosyasına yazan HER modül
`withFileLock` + `writeJsonFileAtomic` kullanmalıdır** — `store-json.ts`'teki
desen zorunlu, opsiyonel değil.

**Üçüncü ders: kuralı doğru katmana koyun.** Kapalı gün kontrolü tool'un
içinde, kendi `readData()`'sıyla duruyordu. Saf fonksiyona
(`applyLessonScheduleUpdate`) taşınınca hem o okuma tamamen kalktı hem de
kural store'a giren HER yolda uygulanır oldu. Bir kuralın tek çağıranda
durması performans borcu OLDUĞU KADAR güvenlik borcudur.

## 2026-09-07 — Paralelleştirmeden önce idempotans; ölçmeden "optimize" etme

**Ölü tekilleştirme.** `notifyUserIfEnabled` tekilleştirmeyi
`n.body.includes(dedupeKey)` ile yapıyordu, ama ders bildirimlerinin gövdesi
`dedupeKey`'i (`lessonId:startAt`) HİÇ içermiyordu — kural hiçbir zaman
eşleşmedi. Yıllardır "tekilleştirme var" sanılan yerde aslında yoktu; aynı
taşımanın her tekrarı yeni bildirim yazıyordu (ölçüldü: aynı senaryoda 105
yinelenen satır). **Ders: bir tekilleştirme/idempotans kuralı gördüğünüzde
anahtarın gerçekten karşılaştırılan alanda BULUNDUĞUNU doğrulayın** — testler
"bildirim yazıldı" diye geçiyordu, "ikinci kez yazılmadı" diye değil.

**Idempotans için şema değişikliği şart değil.** Yeni bir unique index /
migration yerine, satırın BİRİNCİL ANAHTARINI iş anahtarından türetmek
(`sha256(tenant⊕hedef⊕tür⊕anahtar⊕gün)`) yeterliydi: db'de PostgreSQL'in
kendi kısıtı, json/memory'de kilit altında id araması. Üç modda AYNI
sözleşme, sıfır migration.

**Paralelleştirmenin ön koşulu vardır ve sırayla yapılır:** (1) yazma kilidi
(veri kaybı), (2) idempotans (yinelenme), ancak sonra (3) paralelleştirme.
Bu sıra atlanırsa paralelleştirme sessizce veri bozar — bu depoda bir kez
denenip geri alınmıştı.

**`createMany(skipDuplicates)` tek gidiş-dönüş DEĞİLDİR.** Prisma onu
`BEGIN/INSERT/COMMIT` olarak gönderir; tek satır yazmak için kullanıldığında
gidiş-dönüşü 1'den 3'e çıkarır (bu yolda +10 sorgu). Ölçümle yakalandı ve
`create` + `P2002` yakalamaya dönüldü. **Ders: "toplu" API'nin daha ucuz
olduğunu varsaymayın; sorgu sayısını sayın.**

**Sorgu sayısı ile süre aynı şey değildir.** Bu turda sorgu sayısı ~%6 ARTTI
ama p95 ~%53 DÜŞTÜ — çünkü kazanç ardışık DALGA sayısındaydı. Performans
raporlarken ikisini ayrı ayrı verin; yalnız birine bakmak yanlış sonuca
götürür.

## 2026-09-07 — Vercel API'sinin `state` alanı BAYAT olabilir; log'a değil damgaya bakın

`list_deployments`/`get_deployment` bir deployment için ~50 dakika boyunca
`state: "BUILDING"` döndürdü ve build log'ları da kısmi geliyordu. Buna
bakılarak "build asıldı, sebebi son commit'teki statik `prisma` import'u"
sonucuna VARILDI ve kod geri alındı. Oysa aynı deployment'ın `ready`
damgası, build'in **120 saniyede** bittiğini gösteriyordu — asılma hiç
yaşanmamıştı.

**Doğrusu:** bir deployment'ın gerçekten bitip bitmediğine `state` alanına
değil, `ready`/`buildingAt` ZAMAN DAMGALARINA ve build log'unun son
satırlarına ("Deployment completed") bakarak karar verin. `state` bayat
olabilir. Bir kod değişikliğini "dağıtımı bozdu" diye geri almadan önce en az
iki bağımsız kanıt arayın (damga + log kuyruğu + alias durumu).

**İkinci ders:** yerelde `next build` geçiyorsa ve dağıtımda "asılıyor"
görünüyorsa, önce ARACIN raporlamasından şüphelenin. Bu turda yerel
`tsc --noEmit` 3.7 sn, `next build` temizdi — bu, "kod suçlu değil" yönünde
zaten güçlü bir sinyaldi ve daha erken ciddiye alınmalıydı.

## 2026-09-08 — "Boş PDF" bir render hatası değil, TEMA sızıntısı olabilir

Kullanıcı "indirilen PDF tamamen boş beyaz" dedi; ilk refleks export/selector/
async render aramaktı. Gerçek neden: **koyu tema profilinde** baskı yüzeyinin
zemini koyu, metni açık çözülüyordu. Tarayıcılar yazdırırken arka planı
VARSAYILAN OLARAK basmaz → beyaz kağıt + beyaz metin.

**Ders:** yazdırma/PDF hatalarında önce `emulateMedia({media:'print'})` altında
**hesaplanmış renkleri** ölçün, sonra "kağıda düşen mürekkep oranını"
(beyaz olmayan piksel yüzdesi). "Boş sayfa" tam olarak bu metriğin ~0 olmasıdır
ve ekran görüntüsüyle karıştırılmamalıdır — ekran görüntüsü arka planı BOYAR,
yazıcı boyamaz. Hata simülasyonunu da buna göre kurun (zemini beyaz bırakıp
yalnız metin rengini bozun), yoksa yanlış sonuç alırsınız (ilk denemede %63,9
mürekkep ölçtüm — çünkü koyu zemini de ekran görüntüsüne dahil etmiştim).

**İkinci ders:** yazdırılan yüzeyler TEMADAN BAĞIMSIZ olmalıdır. Tek tek
elementleri düzeltmek yerine kapsayıcıda `--color-*` değişkenlerini açık
palete sabitleyin — gömülü/şablon HTML'indeki bugünkü ve gelecekteki tüm
kullanımlar otomatik doğru çözülür.

## 2026-09-08 — İlk açılış yavaşlığında önce FONT yükünü ölçün

"Her ekran ilk açılışta yavaş" şikâyetinde sunucu/DB aranıyordu. Ölçüm: her
route **7 font / 4.747 KB** indiriyordu; bunun 4.311 KB'ı `next/font/local`
ile servis edilen HAM TTF variable font'tu. Aynı sayfada JS 179 KB, CSS 21 KB.
`next/font/google`'a taşımak (AYNI build-time self-host, ek olarak latin
subset + woff2) yükü **339 KB**'a indirdi.

**Ders:** `next/font/local` subset ve woff2 dönüşümü YAPMAZ; Google Fonts'ta
zaten var olan bir aileyi `local` ile yüklemek sessizce megabaytlar ekler.
Boş cache ile ölçüp `performance.getEntriesByType('resource')` çıktısını
TÜRE GÖRE ayırın — "tüm route'larda aynı olan" maliyet neredeyse her zaman
paylaşılan varlıklardadır, sayfa verisinde değil.

## 2026-09-08 — URL'e bağlı arama input'u = tuş başına sunucu turu

Öğrenci aramasında terim yalnız `searchParams`'ta tutuluyor ve input ona
bağlıydı. Her tuş `router.replace` → `force-dynamic` sayfa → RSC turu →
tam-tenant okuması; üstelik karakter navigasyon bitene kadar EKRANDA
GÖRÜNMÜYORDU. 6 harf = 6 gerçek RSC turu.

**Ders:** filtreleme zaten istemcideyse arama kutusunu YEREL state ile sürün,
URL'i yalnızca paylaşılabilirlik için GECİKMELİ senkronlayın. Ayrıca "URL
değişince state'i güncelle" işini effect ile YAPMAYIN — eslint
(`setState in effect`) haklı olarak uyarır; React'in "render sırasında state
ayarla" desenini kullanın.

## 2026-09-08 — Mevcut testler bir davranışı KİLİTLİYORSA, önce niyeti okuyun

Ders kartı renk hatasını düzeltmek için `resolveLessonFinalStatus`'ün
"gelecekteki ders her zaman planned" kuralını kaldırdım; 4 test düştü. O
testler **Yoklama Takvimi**'nin bilinçli davranışını kilitliyordu; owner'ın
talebi ise **Ders Programı kartı** hakkındaydı.

**Ders:** düşen testi "eskimiş" sayıp güncellemeden önce ne kilitlediğini
okuyun. Doğru çözüm paylaşılan semantiği değiştirmek değil, talebin geçerli
olduğu yüzeye özel bir fonksiyon eklemekti (`resolveLessonMarkedStatus`).
İki yüzey arasındaki kalan tutarsızlık rapora **owner kararı** olarak yazıldı.

## 2026-09-08 — `:focus-within` fare tıklamasını da kapsar

Hover tooltip'i "ekranda takılı kalıyordu": görünürlük CSS ile sürülüyordu ve
kurallar arasında `group-focus-within:opacity-100` vardı. `:focus-within`
KLAVYE odağına özel DEĞİLDİR; kullanıcı karta tıkladığında buton odakta kalır
ve tooltip fare ayrıldıktan sonra da görünür kalır.

**Ders:** hover ipuçlarında klavye erişilebilirliği için `:focus-visible`
kullanın, `:focus-within` değil.

## 2026-09-08 — "İyimser bileşen" ≠ iyimser EKRAN

`LessonOpsActions` kendi içinde iyimserdi (`setLocal` anında), ama Ders
Programı kartının rengi bambaşka bir yerden — sunucu prop'undan — çiziliyordu.
Bileşen "optimistic" diye ekranın da öyle olduğunu VARSAYMAYIN.

**Ders:** iyimser durumun, o durumu GÖSTEREN her yüzeye ulaştığını doğrulayın.
Ölçüm hilesi: sunucu yanıtını yapay olarak geciktirin
(`page.route(...)` + `setTimeout`) ve rengin yanıt gelmeden değişip
değişmediğine bakın. Yerelde sunucu ~50 ms'de cevap verdiği için "iyimser mi,
yoksa sadece hızlı mı" AYIRT EDİLEMEZ — gecikme enjekte etmeden ölçüm
yanıltıcıdır (bu turda ilk ölçüm 89 ms/1 yanıt ile belirsiz kaldı,
gecikmeyle 84 ms/**0 yanıt** olarak kesinleşti).

## 2026-09-08 — Eksik özelliği aramadan önce backend'i audit edin

"Şifremi unuttum akışı yok" bulgusunda ilk refleks akışı sıfırdan kurmaktı.
Audit gösterdi ki: token deposu (hash'li, tek kullanımlık, TTL'li), iki API
ucu, sıfırlama sayfası, e-posta gönderimi ve testleri ZATEN VARDI. Eksik olan
tek şey `/api/v1/auth/forgot-password` ucunu çağıran bir ARAYÜZ adımıydı —
uç UI'dan hiç çağrılmıyordu.

**Ders:** "özellik yok" raporu genelde "özellik ERİŞİLEBİLİR değil" demektir.
Yeni altyapı kurmadan önce `grep` ile ucu/servisi ve onun ÇAĞIRANLARINI
arayın; çağıran yoksa eksik olan parça arayüzdür.

## 2026-09-08 — Playwright'ta ölçüm engelleri: viewport ve rate limit

Ders kartının detay modalı headless'ta açılmıyordu; sebep kod değil
**viewport'tu** — 1280px'de AI asistanı popup'ı ızgarayı örtüyordu.
1920×1200'e çıkınca akış çalıştı. Ayrıca giriş ucu IP+e-posta başına
5/15dk limitli olduğu için tekrarlı denemeler 429 ile sessizce başarısız
oluyordu; limitleyici süreç-içi bellekte olduğundan **sunucuyu yeniden
başlatmak** sayacı sıfırlar.

**Ders:** UI otomasyonu "çalışmıyor" göründüğünde önce viewport/örtüşme ve
rate limit'i eleyin; koda dokunmadan önce bunlar test edilmeli.

## 2026-09-09 — Yuvarlanmış bir ARA DEĞERİ saklayıp geri çarpmayın

"5.950 TL sözleşmede aylık taksit 5.952 görünüyor" hatasının kök nedeni tek
bir yuvarlama DEĞİL, **çift yuvarlamaydı**: `derivePerLessonAmount` aylık
ücreti referans ders adedine bölüp TAM SAYIYA yuvarlıyor, dönem tutarı sonra
bu yuvarlanmış değeri ders sayısıyla YENİDEN çarpıyordu. Yuvarlama artığı
(≤0,5 TL) ders sayısı kadar büyüyordu: 5.950/8 = 743,75 → 744 → 8×744 = 5.952.

Teşhisi kesinleştiren gözlem: sapma haftalık 1/2/3/4 dersin **hepsinde tam
+2 TL**. Sabit bir sapma "bölme sonucu yuvarlandı ve geri çarpıldı" imzasıdır;
gerçek bir oranlama hatası olsaydı sıklığa göre DEĞİŞİRDİ.

**Ders:** türetilmiş bir birim fiyat (ders başı, saat başı, adet başı) yalnız
GÖSTERİM değeridir. Toplamı her zaman ONAYLANAN ana tutardan, TEK yuvarlamayla
oranlayın: `round(anaTutar × adet / referansAdet)`. Bu, "tam dönem = tam ücret"
değişmezini ek bir düzeltme adımı olmadan aritmetiğin kendisinden alır.
Motorun girdisini de birim fiyat DEĞİL ana tutar yapın — böylece çağıranın
yuvarlanmış bir snapshot geçirmesi tip düzeyinde imkânsız olur.

## 2026-09-09 — "Kaydedilmiyor" şikâyeti genelde "okunurken gizleniyor" demektir

"Yoklama statüsü kaydedilmiyor, yenileyince kayboluyor" bulgusunda ilk şüpheli
yazma yolu ve iyimser UI'dı. Gerçek: statü kalıcı olarak YAZILIYORDU; okuma
tarafındaki `resolveLessonFinalStatus`, hiçbir bayrağa bakmadan ÖNCE
"ders gelecekteyse koşulsuz planned" diyordu. İyimser UI rengi değiştiriyor,
ilk sunucu yanıtı onu geri alıyordu — bu, kullanıcıya "kaydedilmedi" gibi
görünür.

**Ders:** kalıcılık şikâyetlerinde önce **store'a bak** (veri gerçekten yazılmış
mı?), sonra okuma/çözümleme katmanına. Yazma doğruysa hata GÖRÜNTÜLEME
kuralındadır.

## 2026-09-09 — Aynı davranışın iki fonksiyonu, iki ekranda iki farklı renk demektir

2026-09-07'de Ders Programı kartı için `resolveLessonMarkedStatus` eklenmiş,
Yoklama Takvimi eski `resolveLessonFinalStatus`te bırakılmıştı. Kalan
tutarsızlık rapora "owner kararı" olarak yazılmıştı — ama kod tarafında bu,
AYNI dersin iki ekranda FARKLI renkte görünmesi anlamına geliyordu ve bir
sonraki P0 bulgusu tam olarak buydu.

**Ders:** bir davranış farkını "owner kararına" bırakırken, o farkın
kullanıcıya nasıl görüneceğini yazın. Aynı veriyi gösteren iki yüzey için iki
çözümleyici bırakmak, kararı ertelemek değil YENİ BİR HATA üretmektir. Tek
fonksiyon + yüzeye özel parametre, iki fonksiyondan her zaman daha güvenlidir.

## 2026-09-09 — Testte hafta gününü, KULLANDIĞINIZ tarih dizesinden okuyun

`attendance-calendar-multi-lesson.test.ts` ana branch'te kırıktı ama yalnız
gecenin belli saatlerinde: yardımcı fonksiyon hafta gününü YEREL saatle
(`d.getDay()`) eliyor, kullanacağı `dateKey`'i UTC ile
(`toISOString().slice(0,10)`) üretiyordu. Europe/Istanbul UTC+3 olduğundan
00:00–03:00 arasında yerel Salı = UTC Pazartesi; test Pazartesi (kurum kapalı)
seçip ürünün DOĞRU reddini hata sanıyordu.

**Ders:** bir tarihi hem filtrelemek hem kullanmak için üretiyorsanız, ikisini
AYNI zaman diliminden okuyun. `getDay()` + `toISOString()` karışımı, günün
saatine bağlı "bazen kırmızı" testlerin klasik kaynağıdır.

## 2026-09-12 — Toplu kopyada dışlama listesi eksik kaldı (NeviiOS birleşimi)

- **Hata:** Kaynak worktree'nin untracked dosyaları hedefe kopyalanırken dışlama filtresi yalnız
  marka dosyalarını ve `sifre-sifirla` sayfasını kapsıyordu; kaynağın 5 migration klasörü
  (`20260826*`, `20260911120000_neviios_*`, `20260912120000_*`, `20260913120000_*`) de kopyalandı.
  Rapor ise bunları "alınmadı" diyordu. İçerikleri yeni tek migration'la (`20260913140000_neviios_control_center`)
  çakışıyor ve sıralama zincirini bozuyordu.
- **Düzeltme:** Başlangıç untracked listesiyle karşılaştırılıp (kullanıcı dosyası değil) ve kaynakla bayt
  bayt aynı olduğu doğrulanıp yalnız bu 5 klasör silindi; kaynakta duruyorlar.
- **Ders:** Toplu kopyadan önce kopya listesini dizin bazında (`src/` dışı: `prisma/`, `scripts/`, `docs/`)
  gözden geçir; "taşınmadı" iddiasını kopya listesiyle doğrula, hafızaya güvenme.

## 2026-09-14 — Persona'yı, o persona'nın hiç taşımadığı alandan çözmek

- **Hata:** `GET /api/v1/mobile/session`, STUDENT persona'sını yalnız JWT `studentId` doluysa
  `getActiveAccessType` ile çözüyordu. GUARDIAN davetinde `User.studentId` BİLİNÇLİ OLARAK boş
  bırakılıyor → her veli mobilde "aktif öğrenci erişimi yok" ekranına düşüyordu; test tenant'ında
  hiç aktif erişim kaydı olmadığı için UAT'ta da görünmüyordu. Aynı "JWT studentId eşleşmesi = yetki"
  varsayımı materyal dosyası ve öğretmen değerlendirmesi tool'larında da vardı (aktif erişim kontrolü yok).
- **Düzeltme:** tek çözücü `resolveActivePortalAccess` (yalnız `active`); tool'lar `canAccessStudent`.
- **Ders:** bir alanın "deprecated / bilinçli boş" olduğu yazıyorsa, o alanı okuyan HER yeri ara
  (`grep ctx.studentId`). Persona testini yalnız o alanı dolu olan demo kullanıcıyla yazmak hatayı gizler.

## 2026-09-16 — Ekranın canonical verisini URL parametresine bağlamak (iptal sonrası boş önizleme)

- **Hata:** `sozlesmeler/page.tsx` sözleşme formunun ön doldurmasını (`prefill`) YALNIZCA
  `?yeniKayit=1` ile gelindiğinde üretiyordu. Kullanıcı hatalı sözleşmeyi iptal edip öğrenci
  detayından Sözleşme Merkezi'ne girdiğinde adreste o parametre yok: form bomboş açılıyor,
  "Ödeme Planını Önizle" eksik-alan guard'ına takılıp **sessizce** geri dönüyordu. Kullanıcı
  bunu "önizleme bölümü tamamen boş geliyor" diye bildirdi. İkinci ve daha tehlikeli sonuç:
  `usePerLessonBilling` de aynı `prefill`'den geldiği için `false` kalıyor, alanlar elle
  doldurulsa bile plan ders-başı motoru yerine SABİT taksit motoruyla hesaplanıyordu.
- **Düzeltme:** Ön doldurma saf bir modüle alındı (`src/lib/contract-prefill.ts`) ve sayfa onu
  HER koşulda öğrencinin kayıt verisinden üretiyor; iptal edilmiş sözleşme yalnız "süre ipucu".
  Önizleme guard'ı alan-bazlı Türkçe hataya çevrildi (boş ekran yok). Geçmiş sözleşme satırına
  "Bunu temel alarak yeniden oluştur" eklendi.
- **Ders:** Bir ekranın canonical girdisi URL parametresine bağlanmamalı; parametre yalnız
  "kısayol/ipucu" olabilir. Ayrıca bir MOTOR SEÇİMİ (ör. `usePerLessonBilling`) opsiyonel bir
  prefill'den geliyorsa, prefill yokluğunda sistem sessizce YANLIŞ motora düşer — böyle
  bayrakları her zaman kaydın kendisinden (öğrencinin `derivedPerLessonAmount`'ı) türet.

## 2026-09-17 — db-mode store eşlemesi alan atlayınca tool "başarılı" döner ama veri değişmez

`archiveStudentTool` → `updateStudentProfile({active, archivedAt})`. JSON/memory store patch'i
spread ettiği için testler yeşildi; `store-db.updateStudentProfile` ise alanları tek tek
eşliyor ve `active`/`archivedAt` listede yoktu → test sisteminde (db modu) "Pasife Al" hiçbir şey
yapmıyordu. Ders: bir `*Patch` tipine alan eklendiğinde db store'daki elle eşleme listesine de
eklenmeli; yeni bir db yazma yolu için `vi.mock("../db")` ile payload testi yazın
(bkz. `admin-archive-teacher-profile-db.test.ts`) — json-mode testleri bunu YAKALAMAZ.

## 2026-09-19 — kullanıcı seçimi yalnız URL'de taşınırsa ilk "fallback" onu sessizce ezer

Kayıt süresi (10 ay) Student'a yazılmıyor, yalnız `?sure=` ile taşınıyordu. Sözleşme Merkezi'ne
parametresiz girişte 3'e düşüyor, "Öğrenci Kaydını Düzenle" linki bu 3'ü `sozlesmeSure=3` olarak
geri taşıyıp kullanıcının değerini kalıcı olarak eziyordu. Ders: kullanıcının verdiği kritik bir
karar (süre, tarih, tutar) DB'de saklanmalı; URL yalnız kolaylık/yedek olabilir. Varsayılana
düşen her `?? 3` gibi satır "bu değer nereden geliyor, kaybolabilir mi?" sorusuyla okunmalı.

## 2026-09-19 — `useEffect` ile "statü yay" + key'siz yeniden kullanılan panel = seçim statüyü boyar

`LessonOpsActions` statüsünü mount'ta ve `lessonId` değişince `useEffect` ile üst bileşene
yayıyordu; Ders Programı detay paneli key'siz olduğundan önceki dersin yerel statüsü yeni seçilen
dersin kartına iyimser override olarak yazıldı (geçmiş derse tıklayınca yeşil). Ders: iyimser
katmana yalnız KULLANICI AKSİYONU yazmalı; ders başına state tutan bileşenleri ders id'siyle key'leyin.

## 2026-09-19 — elle tutulan tatil tablosu resmî kaynakla doğrulanmadan güvenilmez

`turkish-holidays.ts`'de 2027 ve 2028 Ramazan Bayramı birer gün geç girilmişti. Kaynak:
vakithesaplama.diyanet.gov.tr/dinigunler.php?yil=YYYY. Yeni yıl eklerken tabloyu oradan alın ve
`official-holidays-single-source.test.ts`'e tarihleri ekleyin. Tatil, planlamada "çakışma" değil
atlanan gündür — seri oluşturmayı bloklarsa (13 haftalık seed bunu yakaladı) kullanıcı kilitlenir.

## 2026-09-20 — "bu gün açık mı?" sorusunun BEŞ ayrı cevabı vardı

Kapalı/açık gün kuralı beş yerde ayrı ayrı yazılmıştı ve **hiçbiri aynı
bilgiyi görmüyordu**:

| Yer | Gördüğü |
|---|---|
| `isDateClosed` (closed-days.ts) | yalnız Pazartesi + tarih listesi — `ClosedDay.isOpen` bayrağını HİÇ okumuyordu |
| `assertSchedulableDate` | yukarıdakini **`closedDays: []`** ile çağırıyordu (istisnalar hiç ulaşmıyordu) |
| `validateLessonSlot` | yalnız resmî tatil |
| `program-studio.tsx` | yalnız resmî tatil + **hard-coded** hafta günü (`[1]` / `[0,6]`) |
| `resolveDayStatus` | TAM kural — ama yalnız Yoklama Takvimi kullanıyordu |

Sonuç: yöneticinin koyduğu "zorla açık" istisnası hiçbir planlama ekranını
etkilemiyordu; aynı gün Ders Programı'nda planlanabilir, Yoklama Takvimi'nde
kapalı görünebiliyordu.

**Ders:** bir kural için ikinci bir uygulama yazıldığı anda, birincisi
"legacy" değil **rakip** olur. Kural tek bir adı olan modülde toplanmalı
(`src/lib/work-days.ts`) ve diğerleri oradan re-export etmeli. Ayrıca bir
guard'a sabit boş liste (`[]`) geçen çağrı, guard'ı sessizce devre dışı
bırakır — `grep` ile böyle çağrıları arayın.

**İkinci ders:** `AppData`'ya `closedDayOverrides` eklemek, "elinde yalnız
`data` olan" TÜM çağıranların istisnaları görmesini sağladı. Bir kuralın
girdisi, o kuralı uygulayan fonksiyonun zaten aldığı veri yapısında
olmalıdır; ayrı bir çağrı gerektiriyorsa er ya da geç unutulur.

## 2026-09-20 — Kayıtta sorulan bilgi hiçbir yere yazılmıyordu

`createStudentTool` ders günlerini (`lessonDays`) ilk tahsilat tutarını
hesaplamak için kullanıp **bilinçli olarak süzüyordu**
(`lessonDays: _ignoredLessonDays`). Kullanıcı aynı bilgiyi kayıt →
sözleşme → Ders Programı akışında ÜÇ kez giriyordu ve üçü birbirini
doğrulamıyordu. Üstelik sözleşme ön-doldurması gerçek derslerden
türetilirken `getUTCDay()` + `toISOString()` kullanıyordu: İstanbul'da
15:00 olan ders sözleşmede **12:00** yazıyordu.

**Ders:** bir formda sorulan her alanın ya kalıcı bir karşılığı olmalı ya da
hiç sorulmamalı. "Yalnız hesaplama için alıyorum" demek, kullanıcıya aynı
soruyu ikinci kez sormanın gerekçesi değildir. Kalıcı hale getirmek (tek bir
nullable kolon) her zaman daha ucuzdur.

## 2026-09-20 — Paylaşılan `/tmp` store'u: paralel test koşuları birbirini siler

Bir regresyonu araştırırken tek tek `npx vitest run <file>` çalıştırırken
arka planda `npm test` de koşuyordu. İkisi de `/tmp/notaplan-data/store.json`
kullanıyor ve her test dosyasının `beforeEach`'i bu dosyayı SİLİYOR. Sonuç:
"az önce oluşturduğum ders kayboldu" (`ensureDataFile` dosyayı yok bulup
yeniden tohumluyor) gibi, kodla hiç ilgisi olmayan sahte regresyonlar.
Yaklaşık yarım saat bunun peşinde koşuldu.

Daha kötüsü: sahte hata seti HER KOŞUDA DEĞİŞİYORDU (36 → 23 → 38, farklı
dosyalar). "Her koşuda farklı test kırılıyor" bir kod regresyonunun değil,
**paylaşılan duruma dışarıdan müdahale**nin imzasıdır — gerçek bir
regresyon deterministiktir.

**Düzeltme (kalıcı):** `resolveDataDir` artık `NOTAPLAN_DATA_DIR`
değişkenini önceliklendiriyor ve `vitest.config.mts` her worktree'ye
repo kökünden türetilmiş KENDİ geçici dizinini veriyor. Böylece iki
worktree'de aynı anda `npm test` çalıştırmak artık güvenli.

**Ders:** `fileParallelism: false` yalnız TEK process içindeki dosyaları
serileştirir, processler arasını DEĞİL. Paylaşılan bir dosya deposuna
dayanan test paketinde izolasyonu **koşu başına dizin** ile çözün; "aynı
anda başka test çalıştırmayın" disiplini er ya da geç bozulur. Bir bulguyu
regresyon ilan etmeden önce (a) tek başına tekrarlanabilir mi, (b) hata
seti koşular arasında sabit mi — ikisini de kontrol edin.

## 2026-09-22 — Debounced URL search + blind URL→input sync deletes characters

Students table kept search in local state (good) but still did
`setSearchInput(urlSearch)` whenever URL `q` changed. Own debounced
`router.replace` echo arriving while the user typed ahead wiped newer
characters — worse with filters because each `q` write is another soft nav
on a parameterized `force-dynamic` route.

**Ders:** local+URL debounce is fine only if URL→input adopt is gated:
apply only when `searchInput === previousUrlSearch` (external change). Never
blindly mirror your own echo.

## 2026-09-22 — collectPayment updated paidAmount but not amount

Contract/registration UI reads `Payment.amount`. `updatePaymentTool` →
`collectPayment` only wrote `paidAmount`. Editing first collection 1→7000
"succeeded" while the card still showed 1 TL.

**Ders:** when a tool claims to edit "amount" of a collected payment,
define whether that means billed amount, paid amount, or both. For
`registration_first_payment` / fully-paid corrections, revise both.

## 2026-09-22 — "Boş şablona sıfırla" was production-visible wipe

Unlike demo reset (`isLocalDevTooling`), clean-template reset was always
rendered on Kurulum and had no server env gate — tenant-scoped full wipe
including side stores; db mode can delete users.

**Ders:** every destructive setup action needs the same dual gate as demo
reset (UI + server). Confirmation modal alone is not enough on shared
test/prod tenants.

## 2026-09-22 — Hakediş dönemi kimliği: DB ISO datetime ≠ form yyyy-MM-dd

`store-db` hakedişi `periodStart.toISOString()` ("2026-09-01T00:00:00.000Z")
olarak okuyordu; form ve hesap "2026-09-01" gönderiyordu. `===` karşılaştırması
mevcut kaydı hiç bulmadı → ekran "Hakediş oluştur"u açık bıraktı → ikinci
create `@@unique([teacherId, periodStart, periodEnd])`'e çarptı → ham Prisma
hatası kullanıcıya gitti. json modda görünmez (string aynen saklanır).

**Ders:** tarih-anahtarlı kimlik (dönem, gün) her zaman gün anahtarına
indirgenmiş karşılaştırılır (`payoutPeriodDayKey`) ve db mapping'i aynı
biçimi döndürür. Unique ihlali `P2002` her zaman Türkçe `CONFLICT`'e çevrilir.

## 2026-09-22 — Baskı künyesinde ham kullanıcı kimliği

Hakediş/performans/ödeme dökümleri "Raporu alan" alanına `session.userId`
basıyordu (`user_sac2rgox9x54`). Ad çözümü tek yerde: `resolveActorLabels`
(personel adı → `User.displayName` → öğretmen adı → e-posta tahmini).
Yeni bir yüzey kişi gösterecekse ham id değil bu fonksiyon kullanılır.

## 2026-09-22 — Hesapta kullanılmayan alanı "kapı" olarak okumak: CSV öğrencisi ayrı motora düştü

Sözleşme planı ders-başı motoru `student.derivedPerLessonAmount != null` ile
açılıyordu; motor bu alanı hesapta HİÇ kullanmıyor (taban aylık ücret). CSV
importu alanı yazmadığı için CSV öğrencileri sessizce eski sabit-taksit
motoruna düştü: önizlemede tür/dönem boş, sözleşmede "EĞİTİM", girilen ilk
tahsilat 1. taksite eşit olmak zorunda. Ayrıca formda girilen ilk tahsilat
önizleme isteğine hiç gönderilmiyordu ve sözleşmeyle `source: "contract"`
olarak yazıldığı için "ilk tahsilatı düzelt" akışı onu görmüyordu.

**Ders:** (1) bir akışı açan koşul, akışın gerçekten ihtiyaç duyduğu veriye
bakmalı (`weeklyLessonCount > 0 && monthlyFee > 0`), yan üründe bir alana değil.
(2) Aynı varlığı üreten her giriş yolu (form, CSV, API) tek "hazırlık" kuralından
geçmeli (`student-contract-readiness.ts`). (3) Bir kavramın (ilk tahsilat) tek
kanonik satırı olmalı; ikinci bir kaynakla yazılırsa ona bakan her ekran kör kalır.

## 2026-09-23 — Aynı alanı iki ekran yazıyordu: ödeme profili ders süresini sessizce 30'a çekiyordu

Ders süresi genel bilgilerde salt-okunur gösteriliyor, yalnız ödeme profili editöründe düzenlenebiliyordu;
editör `initialDurationMinutes ?? 30` ile açıldığı için süresi hiç girilmemiş öğrencide ödeme profilini kaydetmek
süreyi kimse seçmeden 30 dk yapıyordu. **Ders:** bir alanın tek yazma yeri olmalı; başka ekranda gösterilen kopyası
salt-okunur olur ve "varsayılan" asla sessizce kalıcı veri olarak yazılmaz.

## 2026-09-23 — Denetim Kaydı her istekte yazılan telemetriyle doluyordu

`auth.success` her kimlik doğrulamalı istekte AuditLog'a yazılıyor; ekran bunları filtrelemediği için iş kayıtları
kayboluyordu. **Ders:** telemetri ile iş denetimi aynı tabloda tutuluyorsa okuma yüzeyi telemetriyi varsayılan dışlar
(`excludeActions`), saklama politikası ayrı sınıflandırır.

## 2026-09-24 — İptal/yenilenmiş sözleşmenin taksitleri özet toplamına girmeye devam ediyordu

Sözleşme iptali/yenilemesi eski taksit `Payment` satırlarını (doğru olarak) silmiyor; ama `computeStudentPaymentSummary`
sözleşmeye bakmadan hepsini topluyordu → "Toplam tahakkuk" eski + yeni sözleşme. **Ders:** tarihsel satırı koruyan her
yapıda, okuyan toplam da sözleşme durumunu bilmeli: terminal sözleşmeden yalnız gerçekleşen tahsilat sayılır.

## 2026-09-24 — Taksit ayını vade tarihinden türetmek: birleşik ilk tahsilat ikinci ayda "plan yok"

"Eylül + Ekim" birleşik ilk tahsilat tek satır, vadesi kayıt günü; takvim satırı vade ayına eşlediği için Ekim boş
görünüyordu. **Ders:** vade (ne zaman ödenir) ≠ dönem (neyin karşılığı). Ay eşlemesi dönem etiketi/kırılımından yapılır.

## 2026-09-24 — Sticky panel içindeki modal takvimin arkasında kaldı, tıklama alttaki hücreye gitti

`position: sticky` stacking context açar; içindeki `fixed z-50` diyalog kardeş katmanların altında boyandı ve "Vazgeç"
tıklaması görünmeyen takvim hücresine düşüp planlayıcıyı açtı. **Ders:** ortak modal kabuğu her zaman `document.body`'ye
portallanır ve kök katmanda olay yayılımını durdurur (portal olayları React ağacında ebeveynlere kabarcıklanır).

## 2026-09-24 — `.gitignore` tüm `.claude/`'u dışlıyordu: proje skill'leri worktree'lerde görünmüyordu

Skill'ler yalnız ana checkout'ta vardı; ayrı worktree/başka makine/web oturumu hiçbirini görmüyordu. **Ders:**
`.claude/skills/` izlenir (`.claude/*` + `!.claude/skills/`), yerel ayar/worktree dizinleri hariç kalır.

## 2026-09-25 — db modu `readData()` ödeme eşlemesi `contractId`/`installmentSequence` taşımıyordu

Sözleşme taksitleri 2026-09-03'te eklendi ama `store-db.ts` eşlemesine bu iki alan hiç yazılmadı. JSON testleri
geçti; test/production (db) ortamında yoklama takvimi her ay "aktif ödeme planı yok" dedi, takvim tahsilatı
taksit yerine ayrı `monthly_plan` satırı açtı, sözleşme-farkında özetler sessizce etkisiz kaldı. Sözleşme
Merkezi Prisma'dan doğrudan okuduğu için orada plan görünüyordu → iki ekran birbirini tutmuyordu.
**Ders:** yeni kolon ekleyen iş db eşlemesini de yazmalı; `payment-db-mapping.test.ts` gibi Prisma kolon listesine
karşı parity testi, JSON'da geçen testin db'de yanlış olmasını yakalar. Ekranlar arası tutarsızlıkta önce "iki ekran
aynı veriyi aynı yoldan mı okuyor?" diye bak.

### 2026-09-27 (8. tur) — kural değişince tüm okuyucuları tara
- Sözleşme kayıtta opsiyonel yapıldı (09-22) ama yoklama takvimi planı YALNIZ sözleşmeden okumaya devam etti → 13 aktif
  sözleşmesiz öğrenci "plan yok" gördü. Bir kavram opsiyonel olunca, onu zorunlu varsayan ortak çözümleyiciyi (burada
  `resolveContractPlanForMonth`) aynı turda güncelle; tutar yine yalnız gerçek satırlardan.
- Ek şube (`branchIds`) eklendikten sonra oda seçimi/öneri motoru hâlâ `teacher.branchId === room.branchId` kullanıyordu.
  Şube uygunluğu için `grep "branchId ==="` yap; tek kural `teacherServesBranch`.
- Öneri döngülerinde O(aday × ders) tarama + her çağrıda `new Intl.DateTimeFormat` → 41 sn. Döngüde çağrılan doğrulayıcıyı
  profil et; indeks/formatter önbelleği yeterli oldu.

### 2026-09-27 (8. tur P0) — şema kodunu migration'dan önce yayına alma
- `0934e2e` `Room.deletedAt` okuyan Prisma client'ı test'e gönderdi; `20260927090000_room_soft_delete` uygulanmamıştı →
  her panel isteğinde `prisma.school.findFirst()` P2022 ColumnNotFound, tarayıcıda React #441 / "Panel hatası".
  UAT belgesine "uygulanmalı" yazmak yetmedi. **Kural:** migration'lı değişiklikte sıra = onay → test DB'ye uygula → push.
  Koruma: `test` build'inde `scripts/check-pending-migrations.ts` (salt okunur) bekleyen migration varsa build'i durdurur.

### 2026-09-28 (9. tur) — yamaya `undefined` anahtar koymak json store'da alanı siler
- Oda düzenlemede `name: rawPatch.name?.trim()` her istekte yamaya girdi; yalnız pasife alma isteği json/memory
  store'daki `{...oda, ...yama}` ile odanın ADINI sildi (db'de Prisma `undefined`'ı yok saydığı için görünmezdi).
  Kural: yamaya yalnız gönderilen alanı koy (`...(x !== undefined ? { x } : {})`); regresyonu mevcut 8. tur testi yakaladı.

### 2026-09-28 (9. tur) — tema paletini yeniden eşlemek yazdırma yüzeyine sızar
- Obsidyende Tailwind palet değişkenleri yeniden eşlenince, `printSurfaceCss` yalnız tema TOKEN'larını sabitlediği için
  baskı sayfalarındaki `text-slate-*`/rozet/`print:bg-white` açık tona dönerdi (boş PDF sınıfı). Global renk değişikliğinde
  yazdırma rotalarını ayrıca sabitle (`.print-light-palette`) ve önce/sonra axe ölçümüyle doğrula.

### 2026-09-28 (9. tur) — tema geçişinde çekilen ekran görüntüsü yanlış alarm verir
- `button`/`[role=button]`'da 180 ms `background-color` geçişi var; temayı sayfa içinde değiştirip hemen çekilen görüntü
  kartları/düğmeleri açık gri gösterdi. Karar vermeden önce hesaplanmış stili ölç veya geçiş bitince çek.


### 2026-09-28 (10. tur iş #1) — portal bağlamını statik JWT alanından çözme
- Aynı veli e-postası birden fazla öğrenciye (aktif+pasif) bağlanınca JWT `studentId` bayat pasif kayda kilitlendi →
  veli aktif öğrencisine davet edilip giriş yapsa bile "Hesabınız pasif durumda" gördü. Kural: portal bağlamı her
  istekte aktif erişim + aktif öğrenci çözümleyiciden (`portal-context.ts`) gelir; tercih (cookie/JWT) yalnızca
  aktif erişim + aktif öğrenciyse geçerlidir, pasif tercih sessizce yok sayılır.
- Mevcut kullanılabilir hesaba tekrar davet, şifre sıfırlamayı ZORUNLU tutuyordu (accept-invitation her zaman şifre
  yazıyordu). Kural: yerleşik hesap (aktif erişimli) varsa erişim doğrudan bağlanır (`linkedExistingAccount`),
  şifre değişmez; hiç aktive edilmemiş hesaba normal davet akışı çalışır.
- `inviteStudentPortalAccess` revoked satırı aynen döndürüp e-posta gönderiyordu; kabul yalnızca `invited` satırları
  aktive ettiği için "daveti yeniden gönder" boşa düşüyordu. Yeniden davet revoked'u tekrar `invited` yapar.
- Test yardımcısındaki sabit e-posta etiketi ("Kodunuz:") şablon i18n'e taşınınca 3 admin-şifre-sıfırlama testi
  tabanda kırmızı kaldı (işlevsellik sağlamdı). E-posta gövdesinden kod çıkaran testler etiketi ürünün gerçek i18n
  metninden almalı (`passwordResetMail(...).codeLabel`).

### 2026-09-28 (10. tur iş #2) — e-postaya data-URI logo gömme
- Kurum logosu uygulamada `data:` URI saklanıyor ve davet/sıfırlama e-postalarına AYNEN gömülüyordu; Gmail/Outlook
  `data:` URI görselleri engeller → alıcı "yalnız ad veya bozuk görsel" görüyordu. Kural: e-postada logo MIME
  satır-içi eki (CID) olarak taşınır (`institutionLogoEmailBlock` + `EmailSendInput.attachments`); göreli/geçersiz
  veri durumunda kırık görsel yerine temiz kurum-adı metni gösterilir. Bu davranışı kilitleyen regresyon testi
  `account-invitation.test.ts` içindedir (eski "HTML data-URI içerir" beklentisi bilinçli güncellendi).
- Kurum e-posta şablonları (`EmailTemplate`, additive tablo): içerik alanları düzenlenebilir, logo bloğu + zorunlu
  sistem alanları (düğme/kod/bağlantı) sabit kabuk + yayımlama doğrulamasıyla korunur. Şablon render edilemezse
  varsayılana düşülür (e-posta asla yanıtsız kalmaz).

### 2026-09-28 (10. tur iş #5) — modal odak efektine kararsız bağımlılık koyma
- `ModalShell` odak efekti `[open, busy, onClose]` bağımlıydı; tüm kullanıcılar satır-içi `onClose` verdiği için
  metin alanına yazılan HER karakterde efekt yeniden koşup odağı çalıyordu (temizlikteki `trigger?.focus?.()` ile
  tetikleyiciye sıçrama dahil). Kural: modal odak efekti YALNIZCA `[open]` geçişine bağlı olur; `busy`/`onClose`
  güncelliği ref aynasıyla korunur. El-yapımı diyaloglar (öğrenci tekli/kritik) aynı deseni kullanır.
- Gerekçe `onChange` içindeki `.slice(0,500)` IME birleşimini bozma riski taşıyordu; sınır `maxLength` özniteliğine
  taşındı (sunucu `z.string().max(500)` değişmedi — gerçek koruma sunucuda).

### 2026-09-28 (10. tur kalite kapısı) — erişim çözümleyiciyi yenilerken bootstrap yedeğini düşürme
- `portal-context.ts` (`resolvePortalStudent`) erişim satırı bulamayınca doğrudan `no-access` dönüyordu; oysa
  `getActiveAccessType`/`hasActiveStudentAccess` DB-dışı modlarda kaydı olmayan demo (HASHED) kullanıcı için
  `User.studentId` eşleşmesine dayanan bir bootstrap yedeği içerir. Sonuç: demo öğrenci girişi mobil
  `/api/v1/mobile/session`'da `portalAccessType: null` + `studentId` yok döndü (web portal da aynı yoldan
  etkilenirdi). Kural: erişim çözümleyen HER yeni yol, yedeği de uygulamalıdır — burada `getActiveAccessType`
  ile doğrulanıp sentetik SELF satırı normal akışa sokulur (aktiflik/silinmişlik kuralları demo kullanıcıya da
  uygulanır). Regresyon kilidi: `mobile-session-route.test.ts` STUDENT senaryosu.
- Statik kaynak-kilitli testler (`toMatch(/const .../)`) davranışı değil METNİ kilitler: revizyon kipi
  `needsFirstPaymentEntryBase` satırını genişletince `contract-duration-first-contract-due-date` testi kırıldı
  (davranış initial/renewal için aynıydı). Kural: kilitli satıra dokunma, istisnayı TÜRETİLMİŞ satıra
  (`needsFirstPaymentEntry`) taşı.
- Neviios kurum-dili i18n'i giriş formundaki "Şifremi unuttum" sabit metnini `copy.forgot` anahtarına taşıyınca
  `password-reset-ui` testi tabanda kırmızı kaldı (bağlantı çalışıyordu). Kural: etiketi sözlükten okuyan
  bileşenlerde test de sözlüğü doğrular (`authCopy("tr").forgot`), bileşen kaynağında sabit metin aranmaz.

### 2026-09-28 (11. tur iş #1) — kısıt kuralı tarihsel satırların düzenlemesini kilitlemesin
- Deneme revizyonu "kaybolmadı", `9070140` (oluşturmayı 10/15/20 ile sınırladı) + `6e27662` (form her
  kayıtta mevcut süreyi aynen geri gönderir) bileşimiyle 30/45/60 dk'lık TÜM eski denemeler için fiilen
  ÖLDÜ: güncelleme şeması mevcut değeri bilmeden reddediyordu. Kural: değişmezlik (immutability) kuralı
  şemaya değil, mevcut kaydı gören ARAÇ katmanına yazılır — aynen-koruma serbest, gerçek değişiklik
  kurallı (dede kuralı). UI'da mevcut değer "(mevcut kayıt)" seçeneğiyle korunur.
- Regresyon kilidi: `trial-lesson-legacy-duration.test.ts`.

---

## 2026-09-28 (11. tur iş #11) — sunucu alan-hatası anahtarı formsuz, T.C. kapısı kayıttan sonra
- `actionAddStudent` geçersiz doğum tarihinde `fieldErrors.birthDate` üretiyordu ama `new-student-form.tsx`
  bu anahtarı HİÇ okumuyordu (`<FieldError>` + `aria-invalid` yoktu) — kullanıcı "aşağıda işaretlendi" görüyor,
  işaretli alan bulamıyordu. Kural: sunucunun üretebildiği HER `fieldErrors.<anahtar>` için formda render slotu
  ZORUNLU (kardeş alanlarla aynı desen); kilit `registration-field-error-parity.test.ts` (sayım tabanlı —
  birebir JSX kilidi 10. tur dersiyle yasak).
- Geçersiz T.C. (checksum tutmayan) post-create `await setNationalIdTool(...)` sonucuna bakılmadan düşüyordu:
  öğrenci oluşmuş, kimlik kaybolmuş, kullanıcı kaydedildi sanıyordu. Kural: PII yan-etkisi ya kayıt ÖNCESİ saf
  kapıdan geçer (`isValidTurkishNationalId` + mevcut `ToolValidationFailure` deseni — öğrenci/öğretmen
  action'larının ikisinde de) ya da sonucu kontrol edilir. Kilit: `registration-identity-field-errors.test.ts`
  (kayıt oluşmaz + alan hatası + geçerli T.C.'de şifreli saklama, düz metin yok).
- Güvenlik taraması notu (security-rbac-review): reveal/search/set T.C. yolları örnek durumda (pii:full +
  audit, yanıtta/auditte/logda düz metin YOK); kiracı yalnız session'dan; bu turda rol genişletme yapılmadı.

## 2026-09-28 (MEB Paneli) — strip `undefined` bırakma, anahtarı SİL
- `updateStudentProfileTool`'da "sonuç MEB-değilse MEB değerlerini yazma" kuralı önce `{...patch, mebX: undefined}`
  spread'iyle yapıldı: Prisma `undefined`'ı atlar ama json/memory spread'i anahtarı `undefined` değerle saklı verinin
  ÜSTÜNE yazar → `JSON.stringify` anahtarı düşürür → tür kaldırınca kayıtlı MEB verisi sessizce SİLİNİYORDU
  (test yakaladı). Kural: çok-modlu store'da "yazma" yasağı `undefined` atayarak değil `delete patch.anahtar` ile
  uygulanır (yazılmayan anahtar hiçbir moda değmez). Kilit: `meb-student-tools.test.ts` (kalıcılık + korunum).
- Sözleşme değişimi notu: "MEB ise zorunlu" kapısı `student-types.test.ts`'teki 3 eski testi kırdı (MEB kaydı
  seviye/dönemsiz açılıyordu). Kullanıcı-onaylı sözleşme değişimidir: testler MEB alanlarıyla güncellendi,
  pinledikleri davranış (senkron/türetme/korunum) korundu. Kural: kapı değişiminde testin AMACINI koruyarak
  uyarla, davranışı değil.

## 2026-09-28 (triyaj) — attendance-calendar-tools sıra-bağımlı flake
- `collectAttendanceCalendarPaymentTool` idempotency/paid-amount testleri (6) yalnız tam-süitte kırılıyor; izolede
  35/35 + 4 alt-kümede yeşil; erken sırada (2-3.) geçen dosya geç sırada (~35.) kırılıyor. Denenen ikili/blok
  tekrarları kirleteni bulamadı. MEB diff'i dışlandı (MEB dosyaları sonra koşar, kapı yalnız yeni MEB anahtarlarına
  bakar, eski testlerden hiçbiri kapıya takılmaz). Kural: tam-süit kırmızısında önce SIRA konumu + izole/alt-küme +
  baz karşılaştırması yapılır; ilgisiz flake'e sezgisel "düzeltme" YOK (kök neden bulunmadan ellemek yasak).

## 2026-09-28 (egress/guardrails) — uygulama dışı içerik repo'ya girdi, Supabase kotası aşıldı
- Muse'un ürettiği `reklam-paketi/` (9.3 MB: 2× .mp4 + PNG/SVG/HTML) ve `pazarlama/` (yalnız md) repo kökünde
  duruyordu — Neyse ki İZLENMİYORDU (`git status` `??`, `git log --all -- reklam-paketi/` boş): `~/Desktop/
  nevii-reklam-paketi/` altına birebir kopyalanıp (`diff -r` doğrulandı) repo'dan silindi, `.gitignore`'a eklendi.
  Geçmiş temizliği GEREKMEDİ (BFG/filter-repo yok, force-push yok). Aynı dönemde Supabase Free 5 GB egress
  5.48 GB'a taştı (26 Eyl ~1.3 GB/gün). Kod taraması: Auth/Realtime/Edge/PostgREST kullanımı YOK (egress ancak
  Database-pooler veya Storage olabilir); Storage'a giden TEK yol `announcement-attachments` (private, 2 MB
  kapak, video allowlist DIŞI — .mp4 oraya kodla YÜKLENEMEZ); tüm dosya rotaları DB'den base64 okur + `no-store`;
  test Supabase erişimi bu makinede YOK (yerel env production'ı gösterir, service-role anahtarı yok) — bucket
  listesi ve per-servis kırılım owner'a kaldı. Kurallar:
  - "Uygulama kodu dışı içerik (görseller, videolar, pazarlama materyalleri, storyboard'lar, ekran görüntüleri) repo'ya eklenmez. Muse bu tür dosyalar üretirse repo kökünde değil `~/Desktop/` veya kullanıcının göstereceği repo-dışı dizine yazar."
  - "Supabase Storage'a dosya yüklemeden önce bucket tipi (public/private), dosya boyutu ve egress etkisi değerlendirilir. Büyük medya yüklemeleri kullanıcı onayı olmadan yapılmaz."
  - "Her turda `reklam-paketi/`, `pazarlama/`, `marketing/`, `ads/`, `assets-temp/` gibi uygulama dışı dizinlerin repo'da izlenip izlenmediği kontrol edilir."
- Kilit: `scripts/check-repo-hygiene.sh` (yasak dizin + 1 MB üstü = HATA, medya = UYARI; `--staged` pre-commit,
  `--tree` CI) + `scripts/git-hooks/pre-commit` (`npm run hooks:install`) + CI adımı; `scripts/
  check-cache-headers.mjs` dosya sunan GET rotalarında açık `Cache-Control` ZORUNLU kılar (3 gedik kapatıldı:
  `export`, `contracts/[id]/html`, `payments/[id]/receipt` — hepsi `private, max-age=0, no-store`, davranış aynı).

## 2026-09-28 (paket-kampanya) — %100 indirimde "ders başı" sıfırlanmıyordu
- Belirti: nihai aylık ücret 0'a düşerken "ders başı hesap karşılığı" eski (sıfır-dışı) değeri
  göstermeye devam ediyordu. Sunucu DOĞRUYDU (`createStudentTool` NET ücretten türetir, 0 yazar) —
  hata YALNIZ istemci önizlemesindeydi, iki katmanlı: (1) form-seviyesi `onChange` → `recomputePreview`
  `monthlyFee`'yi FormData'daki GİZLİ input'tan okuyordu; o input'un değeri alt bileşenin React
  state'inden gelir ve olay anında henüz ESKİ değeri taşır (bir render geriden); (2) `monthlyFee <= 0`
  önizlemeyi `null` yapıp kartı gizliyordu — 0 hiç gösterilmiyordu.
- Düzeltme: fiyat bileşeni nihai ücreti `onPricingChange` ile üst forma bildirir; önizleme bildirimi
  okur + bildirim değişiminde yeniden hesaplar; 0 geçerli önizlemedir (kart sıfırları gösterir).
  Kural: "gizli input + FormData okuma" ile React state'ini köprülemek yasaktır — durum üste taşınır
  (lift state up), FormData yalnız submit anında okunur.

## 2026-09-29 (tarih girişi) — yıl yazılırken panel çöküyordu; kullanıcı ekranı yanlış tahmin edildi
- Belirti "tarih yazarken 'Bu sayfa yüklenirken bir sorun oluştu'". İlk varsayım (kampanya formu) 27 ekranda
  yeniden ÜRETİLEMEDİ; owner'a sorulunca gerçek ekran Ders Programı planlayıcısı çıktı. Ders: yeniden
  üretemiyorsan tahminle düzeltme — ekranı sor, sonra stack trace al (prod build + `pageerror`).
- Kök neden: `<input type=date>` yıl yazılırken `0002-10-15` üretir; `toYmd` (closed-days.ts) `getFullYear()`'ı
  4 haneye doldurmadığı için `"2-10-17"` döndü → render'da `format(parseISO(...))` RangeError.
- Kural: form durumundaki tarih yalnız `isCompleteDateOnlyInput` (date-input.ts) `true` iken hesaplanır/
  formatlanır/sunucuya gider; ara değer normal düzenleme durumudur, alan altında Türkçe uyarı gösterilir.

## 2026-09-30 — Tek statüye geçiş hakediş kaynağını sessizce kesti (Tuçe Avşar Eylül)

Geldi/İşlendi bağımsız bayraklarken yoklama "Geldi + İşlendi" olabiliyordu; `c21e72b` bunları birbirini
dışlayan tek statü yaptı ama hakediş yalnız İşlendi'yi saymaya devam etti → "Geldi" seçilen ders (testte
Eylül'de 8 öğretmen, 61 ders) hakedişe hiç girmedi, ekran "Ders yok / 0 TL". Ek olarak DB'de
`lessonProcessed @default(false)` olduğundan "legacy completed" dalı db modda ölüydü (json'da çalışıyordu).
**Ders:** bir statü modelini değiştirirken o statüyü okuyan finans kuralını (`isLessonProcessedForPayout`)
aynı değişiklikte güncelle; json'daki `undefined` ile DB'deki `false` varsayılanını aynı saymayan kural parity kırar.

## 2026-09-30 — "Tek kaynak" kural, store içi doğrulamaya ulaşmıyordu (zorla açık gün)

`resolveWorkDay` tek kaynaktı ve tool katmanı `readData()` ile istisnaları görüyordu; ama `addLesson`/taşıma/
seri/telafi onayı store'un KENDİ `readData`'sıyla doğruluyordu ve istisnalar yalnız `store.ts` sarmalayıcısında
ekleniyordu → zorla açık Pazartesi tool'u geçip store'da "günü Zorla açık işaretleyin" hatasıyla düşüyordu.
**Ders:** doğrulamanın okuduğu veriyi, doğrulamanın ÇALIŞTIĞI katmanda üret (her store modunun readData'sı +
dar dilim `narrowLessonScope`/`readLessonScope`); tool'dan store'a kadar giden bir entegrasyon testi yaz.
Aynı turda: `validateLessonSlot` oda `active`'ini hiç okumuyordu → telafi pasif odaya yazılıyordu.

## 2026-09-30 — %100 burslu kayıt: 0 TL "pozitif olmalı" şemasında sessizce takıldı
- Belirti: %100 kampanyalı yeni kayıt genel "Formda düzeltilmesi gereken alanlar var" ile kalıyordu, hiçbir alan açıklaması yok.
  Kök neden zod `amount.positive()`; hata iç içe nesnenin üst anahtarına (`firstPaymentCollected`) düşüyor ve formda o anahtar
  için `FieldError` yok. Mevcut test bile "sembolik 1 TL + gerekçe" ile hatayı geçiştirmişti — iş kuralı testte yamalanmıştı.
- Ayrıca iki indirim sözlüğü ("percent"/"amount" ↔ "percentage"/"fixed") aynı kolonda; biri diğerini TL saydı.
- Kural: boş ile 0 ayrı ayrıştırılır; iç içe şema hatası formda gösterilen alan adına eşlenmeli. Aynı kolona iki sözlük
  yazılıyorsa okuyan her yer ortak bir yardımcıdan (`isPercentDiscount`) geçer.

## 2026-09-30 — Egress'in kaynağı "büyük sorgu" değil, her yere yayılmış TAM hidrasyon + tek bir 79 KB sütun
- Supabase egress kotası aşıldı; `pg_stat_statements` (salt okunur) gösterdi: baytların çoğu `readData()`'nın
  `School` + tüm ilişkiler okuması (istek başına ~1.8 MB) ve `School.logoUrl` data-URI'si. Logo, yalnız ad gereken
  `include: { schools: true }` (kurum seçici, `getPlatformTenant` → her panel isteğinde birkaç kez) üzerinden sayfa
  başına ~5 kez taşınıyordu. `select`siz `findFirst`/`include: true` satırın HER sütununu getirir.
- Kural: sayfa/tool ihtiyacı kadar oku — `src/lib/reference-data.ts` dilimleri; dilim tipi ağır koleksiyonu içermez ki
  yanlış kullanım DERLENMESİN. Satır süzen dilimde (öğrenci/pencere) tip koruyamaz: her erişimi satır satır denetle.
  Öğretmenler kartı "tüm zamanların ders sayısı"nı gösteriyordu — pencereye çevirmek sayıyı sessizce değiştirirdi.
- Ölçüm: gerçek sayfaları yerel `next start` + pg soket bayt sayacıyla ölç, görünen metni önce/sonra karşılaştır
  (`scripts/bench/`); Suspense akışlı sayfada metin sırası değişebilir → sıradan bağımsız özet kullan.

## 2026-09-30 — Ölçer `npx` sürecini ölçtü (0 sorgu); pencere dilimi kimlikle aranan satırı kaçırır
- `NODE_OPTIONS=--import pg-meter.mjs npx tsx …`: seçenek `npx`'in kendi node sürecine de geçer, ölçer portunu o
  kapar → mutasyon ölçümü "0 sorgu / 0 KB" döndü. Tek süreç: `node --import pg-meter.mjs --import tsx script.ts`
  (sonuçta `pid === process.pid` kontrolü). Sıfır ölçüm = önce ölçerin doğru süreçte olduğunu kanıtla.
- Dönem penceresi yalnız TARİHE göre süzen hesaba yeter; kayıttaki satırı KİMLİKLE arayan kod (`describeLineSources`:
  sonradan taşınmış ders, seri demo etiketi) pencereyle sessizce "eksik" der → böyle yollar dilime çevrilmez.

## 2026-10-01 — Vercel "Active CPU %75": Link önyüklemesi ve yoklamalar her sayfayı 10 kat çoğaltıyordu
- Kök layout çerez okuduğu için tüm rotalar dinamik; `/panel`, `/ogretmen`, `/ogrenci` altında `loading.tsx` var.
  Next.js bu durumda görünen HER `<Link>` için sunucuda layout render'ı yapan önyükleme isteği atar. Gerçek tarayıcı
  ölçümü: tek `/panel/ogrenciler` açılışı 55 istek (49 önyükleme). Ayrıca oturum yoklaması 30 sn, canlı program
  yenilemesi production'da 45 sn (her biri tam sayfa render'ı). Asistan da her menü geçişinde `/auth/me` ve her açılışta
  `/chat` çağırıyordu. Sonuç: aynı sayfa 5 istek; CPU yerelde %26–63 düştü.
- Kural: `next/link` yerine `@/components/link` (önyükleme kapalı, ESLint zorunlu kılar). Yoklama ≥5 dk, sekmeye
  dönüşte ≥60 sn aralık. Yeni bir periyodik/yükleme anı isteği eklemeden önce çağrı sayısını tarayıcıyla say.
- Ölçüm: yerel `next start` + yerel DB + Playwright; sunucu süreç ağacının `ps` CPU süresi; eski/yeni build aynı
  düzenekle, 1 ısınma + 5 tur medyanı. Vercel Hobby'de rota bazında Active CPU API'den alınamıyor; çağrı sayısı
  `get_runtime_logs` gruplamasıyla görülebiliyor. Ölçümden önce portun boş olduğunu kanıtla: eski bir `next-server`
  açık kalmıştı ve ilk ölçüm ona gitti.

## 2026-10-01 — Yazma dondurma: `ALTER DATABASE ... read_only` tek başına açık oturumları ve havuzu durdurmaz
- Canlı geçiş provasında `default_transaction_read_only=on` sonrası açık oturumlar ve Supavisor havuzları (5432 ve
  6543) yazmaya devam etti. Bir havuzdan bağlantı kapatmak o havuzun kendi bağlantısını sağ bırakıyor ve yeniden
  kullanılıyordu. Çözüm: iki havuzdan çapraz kapatma + 12 yeni oturumda `pg_settings.source = database` kanıtı; son
  yedekte tüm tablolara EXCLUSIVE kilit (zorlanan `BEGIN READ WRITE` bile duruyor).
- Kural: "dondurdum" demeden önce yeni oturumlarda yazmanın reddedildiğini ve yazma sayaçlarının sabit kaldığını göster.

## 2026-10-01 — Ortam kimlikleri değişti, korumalar eski kaldı
- Geçişten sonra `test-target-guard.ts` canlıyı tanımıyordu ("unknown"); gerçek veriyi taşıyan eski test DB'sini ise
  hâlâ "test" sayıp test betiklerine açıyordu. `seed-multi-tenant.ts` yalnız `NODE_ENV` kontrol ediyordu. Varsayılan
  tenant canlıdaki gerçek kurum olduğu için `.env`'deki bir production URL'iyle o kurumun verisini silip demo veri
  yazabilirdi. README boş DB için `prisma migrate deploy` diyordu; bu, MySQL sözdizimli 12 migration yüzünden çalışmaz.
- Kural: proje/DB kimliği değişince `grep -rn "<eski-ref>"` ile src, scripts ve docs taranır; korumalar, seed
  betikleri (`assertSeedTarget`) ve migration kapısı aynı commit'te güncellenir. Model:
  `docs/operations/LOCAL_FIRST_DEPLOYMENT.md`.

## 2026-10-02 — DB hatasında kaynak koddaki demo şifrelere geri düşülüyordu; demo hesaplar dış e-posta alanlarında
- `authenticateUser`/`findUserByEmail` db modunda sorgu hata verince bootstrap listesine düşüyordu. Test kanıtladı:
  geçici DB hatasında AI_AGENT ve kurum sahibi koddaki demo şifreyle girebiliyordu (DB'deki şifre değişmiş olsa bile).
  Düzeltme: db modunda fail-closed. Ayrıca "şifremi unuttum" AI_AGENT'a sıfırlama başlatıyordu; hesabın alanı
  (`notaplan.app`) DNS'te kayıtsız → alan adını alan şifre belirleyebilirdi. Production'da 9 demo öğrenci hesabı
  herkese açık `email.com` adresleriyle ve varsayılan şifreyle aktif (demo kayıtlara bağlı).
- Kural: kilitlenen/servis hesabını tüm yollarla doğrula (giriş, mevcut/yenileme token'ı, sıfırlama, davet, mobil,
  DB hatası geri düşüşü). Demo/servis hesaplarının e-posta alanı kontrol edilen bir alan olmalı ya da hesap pasif olmalı.

## 2026-10-02 — Yerel Postgres saat dilimi ≠ canlı: ham SQL `now()` yerelde 3 saat ileri tarih yazdı
- `timestamp without time zone` sütunlara (Prisma DateTime) ham SQL `now()` yerel sunucu saatini (İstanbul) yazar;
  Prisma bunu UTC okur → yerelde `sessionsRevokedAt` 3 saat ileride göründü, provada yeni oturumlar da "iptal" sayıldı.
  Canlı (Supabase) UTC olduğu için canlıdaki değer doğruydu (`gecmiste_mi=t` ile kanıtlandı).
- Kural: ham SQL ile zaman yazarken `now() at time zone 'UTC'`; prova adımı başarısızsa önce ortam farkını ele.

## 2026-10-03 — Eşzamanlı ders yazımı çift rezervasyon yapıyordu (anlık görüntü doğrulaması yetmez)
- DB modunda `addLesson`/seri/telafi onayı `readData()` görüntüsünde `validateLessonSlot` çalıştırıp sonra yazıyordu;
  aynı saate aynı anda iki istek ikisi de "boş" gördü (yerel provada 3/3 çift kayıt). Düzeltme: kurum içi advisory kilit
  altında DB'den güncel çakışan dersleri okuyup merkezi kuralla (`findSlotConflict`) yeniden kontrol.
- Ders: kapasite/çakışma gibi "tek olmalı" kuralları yazım anında kilit/kısıt altında yeniden doğrula.

## 2026-10-03 — Prova düzeneği "sahte geçti" üretti (tek oturum kuralı)
- Token iptal provasında ikinci giriş birinci oturumu kapattığı için sonraki "401 beklenir" adımları boş/yanlış token
  ile kendiliğinden geçti. Düzeltme: her adım gerçek HTTP kodlarını yazar; senaryolar oturum kurallarına göre sıralanır.
- Ders: negatif (reddedilmeli) adımlardan önce aynı kimlikle pozitif adımın gerçekten 200 verdiğini doğrula.

## 2026-10-03 — Araç çıktısına körü körüne güvenme: regex ve komut zinciri
- Varsayılan şifre envanterinde `process\.env\.[A-Z_]+` rakamlı değişken adlarını kaçırdı → hesaplar yanlış eşleşti;
  bilinen sayılarla (19 hesap) karşılaştırınca yakalandı.
- `tsc | head && git add && git commit` zinciri tsc hatasını yuttu (boru çıkış kodu `head`'in) → bozuk commit; ayrı
  adımda `echo exit=$?`/`pipestatus` ile kontrol et. Eski (biçimlenmemiş) dosyaya prettier çalıştırma: 2 400 satır fark.
