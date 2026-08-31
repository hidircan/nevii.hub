# Brand Migration Inventory — NotaPlan/Maestron → Nevii Hub

Status: **DONE** (Phases 0–3, 5–7 complete; Phase 4 blocked/out of scope; Phase 6 = code
references removed, asset files kept on disk unreferenced). See
`NEVII_HUB_BRAND_MIGRATION_REPORT.md` for the full narrative report.

Legend: **A** user-facing text · **B** current source identity · **C** external/runtime
identity · **D** historical/compatibility data (NOT TOUCHED) · **E** logo/icon assets.

## Category A/B — changed (grouped by area)

| Area | Files | What changed |
|---|---|---|
| Brand source of truth | `src/lib/brand.ts` | `name`/`shortName`/`description`/`assistantName` → "Nevii Hub" / "Nevii Hub AI"; all `logoPath`/`logoSvgPath`/`logoMarkPath`/`logoMarkTransparentPath`/`sidebarLogoPath`/`ogImagePath` set to `null` (no approved asset — see Category E) |
| Web logo consumers | `src/components/sidebar.tsx`, `src/app/layout.tsx` | Sidebar `<Image>` replaced with a text/monogram "NH" badge (`Image` import removed, now unused); root layout's `openGraph.images` entry removed instead of pointing at a null/stale path |
| AI assistant identity | `src/components/ai/global-assistant.tsx`, `src/components/ai/assistant-chat-body.tsx`, `src/app/panel/maestron-ai/page.tsx`, `src/app/panel/yardim/page.tsx` | All "Maestron AI" display text/aria-labels/comments → "Nevii Hub AI"; page component renamed `MaestronAiPage`→`NeviiHubAiPage`; yardim (help) page description text |
| AI provider system prompts | `src/lib/ai/providers/gemini.ts`, `src/lib/ai/providers/openai-compatible.ts` | "You are NotaPlan…" → "You are Nevii Hub…" |
| WhatsApp outbound messages | `src/lib/whatsapp/handler.ts` | Two literal messages sent to end users ("NotaPlan: Bu numara…", "NotaPlan: Mesajınız…") → "Nevii Hub: …" |
| WhatsApp dev verify-token default | `src/lib/whatsapp/config.ts`, `src/lib/__tests__/whatsapp-webhook.test.ts` | Non-production fallback `"notaplan-wa-verify"` → `"nevii-hub-wa-verify"` (prod always requires the real `WHATSAPP_VERIFY_TOKEN` env var — empty string in prod — so this only affects local/dev; test updated to match) |
| Misc comments | `src/lib/payment-provider/providers/iyzico.ts`, `src/app/globals.css`, `verify-assistant.mjs` | Comment/selector text only, no behavior change |
| Payment placeholder email | `src/lib/services/tools.ts` | `odeme@notaplan.app` fallback buyer email → `odeme@neviihub.app` (synthetic placeholder, not a real persisted contract) |
| Demo tenant names | `scripts/seed-multi-tenant.ts`, `README.md` | "NotaPlan Demo Akademi"/"NotaPlan Test Kampüs" → "Nevii Hub Demo Akademi"/"Nevii Hub Test Kampüs" (demo/seed display data, re-seedable, no test hardcodes it) |
| Console log prefix | `src/lib/logger.ts`, `DEVOPS_GUIDE.md` (doc line describing it) | `[notaplan]` → `[nevii-hub]` (server console only, no test asserts on it) |
| Mobile app identity | `apps/mobile/app.json` | `name`→"Nevii Hub", `slug`→"nevii-hub-mobile", `scheme`→"neviihub", iOS `bundleIdentifier`/Android `package`→`com.neviihub.mobile` (see Category C below for why this was judged safe) |
| Mobile headers | `apps/mobile/app/(admin)/ozet.tsx`, `apps/mobile/app/(teacher)/bugun/index.tsx`, `apps/mobile/src/features/student-scope/home-screen.tsx` | `<AppHeader title="NotaPlan">` → `title="Nevii Hub"` |
| Mobile misc | `apps/mobile/src/theme/tokens.ts` (comment), `apps/mobile/src/api/client.ts` (4 dev console-warning prefixes `[NotaPlan]`/`[NotaPlan API]` → `[Nevii Hub]`/`[Nevii Hub API]`) | |
| Mobile docs | `apps/mobile/README.md`, `apps/mobile/MOBILE_PARITY.md` | Title/prose brand mentions |
| Root package identity | `package.json`, `package-lock.json`, `apps/mobile/package.json`, `apps/mobile/package-lock.json` | `"name"` field(s): `notaplan`→`nevii-hub`, `notaplan-mobile`→`nevii-hub-mobile` (lockfiles edited by direct string replace, not `npm install`, to avoid touching dependency resolution/hashes) |
| Root docs (title/prose only — technical strings inside them left alone, see Category D) | `CLAUDE.md`, `DATABASE_ARCHITECTURE.md`, `FRONTEND_GUIDELINES.md`, `NOTAPLAN_CHANGELOG.md`, `PRODUCTION_AUDIT.md`, `PRODUCT_BACKLOG.md`, `DEVOPS_GUIDE.md`, `PRODUCT_REQUIREMENTS.md`, `PRODUCT_ROADMAP.md`, `PROJECT.md`, `README.md`, `docs/implementation-plans/notaplan-product-expansion.md` (title only, filename kept — see note) | Every `NotaPlan` (exact case) brand-name prose mention → `Nevii Hub`. Verified via case-sensitive grep: 0 remaining `NotaPlan` hits anywhere in the repo. |
| Peer dev-tooling scripts (pre-existing, untracked, partially already rebranded by another session) | `scripts/where-am-i.sh` | Fixed one leftover mixed "kanonik NotaPlan/Nevii Hub deposu" line to read "Nevii Hub" only. `scripts/dev-web.sh`/`scripts/dev-mobile.sh`/`DEVELOPMENT_WORKFLOW.md` were already Nevii-Hub-branded by a prior/peer session — left as found. |

**Note on `docs/implementation-plans/notaplan-product-expansion.md`:** filename kept unchanged
(referenced by the user's persistent memory pointer file outside this repo); only the in-document
`# NotaPlan Ürün Genişletme…` title was renamed.

**Note on `/panel/maestron-ai` route slug:** deliberately **not renamed**. All *displayed* text now
says "Nevii Hub AI"; only the URL path segment and the internal `nav/panel-nav.ts` href / redirect
in `src/app/panel/chat/page.tsx` still say `maestron-ai`. Renaming a Next.js route folder is
explicitly lower-priority/higher-risk per the task's Phase 3 guidance ("do not rename files/dirs
unless very clearly scoped"), and nothing outside this repo currently depends on that URL (app
unreleased). Flagged as an optional low-priority follow-up in the report.

## Category C — mobile external/runtime identity (changed)

| Item | Old | New | Why judged safe |
|---|---|---|---|
| Expo `name` | NotaPlan | Nevii Hub | Never distributed |
| Expo `slug` | notaplan-mobile | nevii-hub-mobile | Never distributed |
| Expo `scheme` | notaplan | neviihub | Grepped repo-wide for literal `notaplan://` deep links — **zero** matches, so nothing to update in lockstep |
| iOS `bundleIdentifier` | com.notaplan.mobile | com.neviihub.mobile | No `eas.json`, no `.mobileprovision`/`.p8`, no App Store Connect config, no git history mentioning EAS/TestFlight/submit — confirmed no real distribution evidence |
| Android `package` | com.notaplan.mobile | com.neviihub.mobile | Same as above |

## Category D — historical/compatibility data (NOT TOUCHED)

| Item | Where | Why it must not change | Future controlled-migration plan |
|---|---|---|---|
| JWT issuer/audience `"notaplan"` / `"notaplan-api"` | `src/lib/auth/jwt.ts`, `src/middleware.ts`, tested in `src/lib/__tests__/middleware-jwt-secret.test.ts` | Any already-issued refresh/access token (real or staging) carries these claims; changing them invalidates every existing session at once | Add a second accepted issuer/audience value alongside the old one, verify against either, flip the *issued* value only after a full deploy where all live tokens have rotated past their TTL, then drop the old value |
| Theme/kurum/portal cookies `notaplan_theme_profile`, `notaplan_font`, `notaplan_density`, `notaplan_portal_presentation`, `notaplan_kurum` | `src/lib/theme.ts`, `src/lib/institution/scope.ts` | Already documented in-repo (`src/lib/theme.ts` top comment) as deliberately brand-independent; renaming resets every visitor's stored preference/kurum-selection cookie on next deploy | Same alongside-then-retire pattern: read both old+new cookie name for one release, write only the new one, drop the old read after a grace period |
| localStorage/AsyncStorage keys: `notaplan.assistant.popupPosition`, `maestron.ai.activeConversationId`, `notaplan_sidebar_collapsed`, `notaplan_sidebar_order_<section>`, `notaplan_student_columns_<tenantId>_<userId>`, mobile `notaplan_access_token`/`notaplan_refresh_token` (SecureStore), `notaplan_theme_preference` | `src/components/ai/global-assistant.tsx`, `assistant-context.tsx`, `src/components/sidebar.tsx`, `src/components/student-column-view-manager.tsx`, `apps/mobile/src/auth/token-storage.ts`, `apps/mobile/src/theme/theme-context.tsx` | Explicitly listed as Category D in the task brief; renaming silently drops every existing browser's/device's stored value (logged-out sessions on mobile, reset UI prefs on web) | Read-old-key-as-fallback-then-write-new-key on next access, retire the old read after a release or two |
| PII crypto salts/version strings `"notaplan-pii-iban-v1"`, `"notaplan-pii-v1"`, the `"\|notaplan"` suffix in the TC-kimlik hash, and the dev-only key-derivation passphrase `"notaplan-dev-only-pii-key-change-me"` | `src/lib/pii/iban.ts`, `src/lib/pii/tc-identity.ts` | **Highest-risk item in this migration.** These strings are inputs to `scryptSync`/`sha256` used to derive the actual encryption key and lookup hash for already-stored IBANs and T.C. kimlik numbers. Changing any of them makes every already-encrypted IBAN undecryptable and breaks every existing national-ID uniqueness/lookup hash | Never renamed in place. If ever changed, requires a real data-migration: decrypt every existing value with the old salt, re-encrypt/re-hash with the new one, in one atomic migration script — not a text find/replace |
| Health-check `service: "notaplan"` | `src/app/api/v1/health/route.ts`, `src/app/api/v1/ready/route.ts` | `src/lib/brand.ts`'s own top-of-file comment already documents this as one of the identifiers deliberately pinned to `"notaplan"` regardless of branding (external uptime monitors may match on it) | Add a second field (`serviceDisplayName: "nevii-hub"`) alongside the existing `service` field rather than changing the monitored value |
| `STORE_MODE=json` data directory naming: `/tmp/notaplan-data` (serverless), local `./data` | `src/lib/config.ts`, `vitest.config.mts`, `CLAUDE.md`, `PROJECT.md` | Local dev/test convenience path — not "persisted store keys" in the strict sense (no schema/contract), but renaming would silently orphan any already-populated local `./data` checkout on a developer machine | Low priority; safe to rename in a follow-up PR with a one-line CLAUDE.md note telling developers to `rm -rf data` once |
| Demo/system login emails `super@notaplan.app`, `agent@notaplan.app`, `admin@testkampus.notaplan.app` | `src/lib/auth/users.ts` (`BOOTSTRAP` array), documented in `README.md` | Under `STORE_MODE=db`, these may already exist as real `User` rows in a shared staging Postgres seeded from this exact file; renaming the source constant does not rename an already-provisioned DB row, silently orphaning that admin account | Add new email(s) as additional bootstrap users, migrate/rename the DB row for any live staging environment in a coordinated, human-approved step, then retire the old row |
| Local dev DB names/URLs (`notaplan`, `notaplan_demo`, MariaDB/MySQL example config) | `.env.example`, `DEVOPS_GUIDE.md`, `README.md`, `scripts/seed-hybrid-portal-demo.ts` (comment) | Real local databases developers already created on their machines are named this; renaming the docs without renaming the DB breaks copy-pasted setup commands | Cosmetic-only, no urgency; rename together with an actual local DB rename instruction if ever done |
| GitHub repo URL / local checkout path (`github.com/hidircan/notaplan`, `~/Projects/notaplan`) | `README.md`, `DEVOPS_GUIDE.md`, `DEVELOPMENT_WORKFLOW.md`, `scripts/*.sh` | Real external repo/filesystem identity — root relocation is explicitly out of scope for this task (Phase 4, blocked — see report) | Manual follow-up: rename the GitHub repo (or add it as a second remote name) once the peer sessions using the current path are done |
| Prisma migration file names & SQL content under `prisma/migrations/**` | 12 files, e.g. `20260825230000_kvkk_consent/migration.sql` | Migration file names/content are immutable history once applied to any real database; the only `notaplan` occurrences found are SQL *comments* referencing the (also-unrenamed) implementation-plan doc path, not table/column identifiers | None needed — no actual schema identifier is brand-named |
| `.env.example` `DATABASE_URL="mysql://user:password@localhost:3306/notaplan"` | `.env.example` | Same DB-naming-convention reasoning as above | Cosmetic-only follow-up |
| `demo.notaplan.local` synthetic guardian emails | `scripts/seed-hybrid-portal-demo.ts` | Local-only (`.local` non-resolving domain), explicit "YALNIZCA yerel geliştirme" script; deferred as zero brand-visibility, non-zero (if small) risk of orphaning already-seeded local rows | Low priority; safe to rename whenever convenient |
| Internal `globalThis` cache property names `__notaplanChats`, `__notaplanMemory`, `__notaplanVectors`, `__notaplanByTenant`, `__notaplanWorkflows`, `__notaplanAiMetrics` | `src/lib/ai/conversations.ts`, `src/lib/ai/memory/store.ts`, `src/lib/ai/memory/vector/file-vector-store.ts`, `src/lib/store-memory.ts`, `src/lib/workflows/state.ts`, `src/lib/ai/metrics.ts` | Not persisted (in-process only, reset every cold start) and not user-facing — zero brand-migration value, deliberately **deferred** rather than "not touched for risk reasons" | Pure cosmetic rename, safe whenever, no urgency |
| `QDRANT_COLLECTION` default `"notaplan_memory"` | `src/lib/ai/memory/vector/qdrant-store.ts` | If a real Qdrant instance already has a collection with this name, renaming the default orphans any already-indexed vectors | Requires a real Qdrant collection migration/reindex, not a text change |

## Category E — logo/icon assets

| File | Contents | Action |
|---|---|---|
| `public/brand/maestron-logo.png` (+`.svg`), `maestron-icon-32.png`, `maestron-icon-64.png`, `maestron-mark.png`, `maestron-mark-transparent.png`, `maestron-svg-logo.png` | Wordmark PNG literally reads "MAESTRON"; the mark PNGs (conductor silhouette in an atom-orbit motif) have no text but are conceptually tied to the old brand pun ("Maestro") | **Kept on disk, all code references removed** (`src/lib/brand.ts` now returns `null` for every logo path; `src/components/sidebar.tsx` renders a text "NH" badge instead of `<Image>`; `src/app/layout.tsx` omits `openGraph.images` instead of pointing at a stale path). Verified via repo-wide grep: nothing references `brand/maestron-*` anymore. Not deleted — no upside to deleting an otherwise-harmless unreferenced file, and it may be useful as design reference for a real Nevii Hub mark later. |
| `src/app/icon.png` (Next.js favicon file convention) | Same conductor mark, no text | **Left unchanged.** This is a real image file, not UI code — replacing it with anything would mean fabricating a new logo graphic, which the task's hard safety rules explicitly forbid. Flagged as a **required manual follow-up**: browser tab icon still shows the old Maestron mark until a real Nevii Hub favicon is designed and dropped in. |
| Root `maestron-logo.png` | — | Already deleted by a prior/peer session (shows as `D` in git status before this session started) — not touched further. |
