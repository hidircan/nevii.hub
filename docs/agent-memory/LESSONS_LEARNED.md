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
