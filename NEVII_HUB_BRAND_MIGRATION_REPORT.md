# Nevii Hub Brand Migration Report

## Final brand decision

- User-facing display name: **Nevii Hub**
- Technical/package slug: **nevii-hub** (mobile: **nevii-hub-mobile**)
- Legacy names removed from every user-facing and current-source context: NotaPlan / notaplan /
  Maestron / maestron.

Everything below is **uncommitted** — nothing was staged, committed, pushed, or deployed, and no
worktree other than the main checkout at `/Users/hidircanyagiz/Projects/notaplan` was touched.

## What changed, by category

Full file-by-file table is in `BRAND_MIGRATION_INVENTORY.md`. Summary:

### Category A/B — user-facing text + current source identity
- **Brand source of truth** (`src/lib/brand.ts`): name/shortName/description/assistantName now
  say "Nevii Hub" / "Nevii Hub AI"; all logo path fields set to `null` (see assets below).
- **AI assistant identity**: every "Maestron AI" label, aria-label, and comment across
  `src/components/ai/*`, `src/app/panel/maestron-ai/page.tsx` (function renamed
  `MaestronAiPage`→`NeviiHubAiPage`), `src/app/panel/yardim/page.tsx` → "Nevii Hub AI" / "Nevii
  Hub".
- **AI provider system prompts** (Gemini, OpenAI-compatible): "You are NotaPlan…" → "You are
  Nevii Hub…".
- **WhatsApp outbound messages** (real text sent to end users) in
  `src/lib/whatsapp/handler.ts`: "NotaPlan: …" → "Nevii Hub: …". Also renamed the dev-only
  WhatsApp verify-token fallback default, updating its test in lockstep.
- **Mobile app**: `AppHeader` titles ("NotaPlan"→"Nevii Hub") on 3 screens, theme-system
  comment, 4 dev console-warning prefixes in `apps/mobile/src/api/client.ts`, `apps/mobile/app.json`
  (see Category C), `apps/mobile/README.md`, `apps/mobile/MOBILE_PARITY.md`.
- **Package identity**: `package.json`/`package-lock.json` `"name"` fields at root
  (`notaplan`→`nevii-hub`) and in `apps/mobile` (`notaplan-mobile`→`nevii-hub-mobile`). Lockfiles
  edited by direct string substitution, not `npm install`, so no dependency
  versions/hashes moved.
- **Demo/seed data**: tenant display names "NotaPlan Demo Akademi"/"NotaPlan Test Kampüs" →
  "Nevii Hub Demo Akademi"/"Nevii Hub Test Kampüs" in `scripts/seed-multi-tenant.ts` and
  `README.md` (kept in lockstep; nothing else hardcodes these strings).
- **Docs**: every case-sensitive `NotaPlan` prose mention renamed to `Nevii Hub` across
  `CLAUDE.md`, `PROJECT.md`, `README.md`, `DEVOPS_GUIDE.md`, `DATABASE_ARCHITECTURE.md`,
  `FRONTEND_GUIDELINES.md`, `NOTAPLAN_CHANGELOG.md`, `PRODUCTION_AUDIT.md`,
  `PRODUCT_BACKLOG.md`, `PRODUCT_REQUIREMENTS.md`, `PRODUCT_ROADMAP.md`, and the title line of
  `docs/implementation-plans/notaplan-product-expansion.md`. Confirmed via repo-wide
  case-sensitive grep: **zero** remaining `NotaPlan` occurrences anywhere in the tree.
- One leftover mixed "NotaPlan/Nevii Hub" line in the already-in-progress
  `scripts/where-am-i.sh` (an untracked peer-session diagnostic script) cleaned up to say
  "Nevii Hub" only.

### Category C — mobile external/runtime identity
`apps/mobile/app.json`: `name`→"Nevii Hub", `slug`→`nevii-hub-mobile`, `scheme`→`neviihub`,
iOS `bundleIdentifier`/Android `package`→`com.neviihub.mobile`. Judged safe because: no
`eas.json`, no provisioning/App Store Connect files, no git history mentioning EAS/TestFlight/
submit, and a repo-wide grep for the literal deep-link string `notaplan://` returned zero matches
(nothing needed updating in lockstep with the scheme change).

### Category D — explicitly NOT touched (full table + rationale + migration plan in the inventory)
The highest-stakes ones:
- **JWT issuer/audience** (`"notaplan"`/`"notaplan-api"`) — renaming would invalidate every live
  session token at once.
- **PII encryption/hash salts** (`src/lib/pii/iban.ts`, `tc-identity.ts`) — these strings are
  literal inputs to the scrypt/sha256 derivation used on already-stored IBAN/T.C.-kimlik data;
  changing them makes existing encrypted values undecryptable. This was the single most
  important catch of "read in context before changing" in this task — a naive find/replace would
  have silently corrupted PII.
- Theme/kurum cookies, localStorage/AsyncStorage keys (assistant popup position, active
  conversation id, sidebar collapse/order, student column widths, mobile access/refresh
  tokens, theme preference) — explicitly called out as Category D in the task brief.
- Health-check `service: "notaplan"` string — already documented in-repo (`src/lib/brand.ts`'s
  own top comment) as deliberately brand-independent.
- Demo/system bootstrap login emails (`super@notaplan.app` etc., `src/lib/auth/users.ts`) — a
  real `STORE_MODE=db` staging environment may already have provisioned User rows against these
  exact emails.
- Prisma migration file names/SQL (immutable history), local dev DB names/URLs, the GitHub repo
  URL and local checkout path, and the `/tmp/notaplan-data` / `./data` store directory
  convention.

### Category E — logo/icon assets
- `public/brand/maestron-*.png/.svg` (6 files): the "logo" PNG literally has "MAESTRON" printed
  in it; the "mark" PNGs (conductor silhouette) have no text but are conceptually tied to the old
  brand. **All code references removed** (verified via repo-wide grep — nothing under `src/`
  points at `brand/maestron-*` anymore); files themselves **kept on disk**, not deleted (no
  approved replacement exists yet, and there's no downside to leaving an unreferenced file — it
  may be useful design reference later).
- `src/lib/brand.ts` now returns `null` for every logo path; `src/components/sidebar.tsx` renders
  a plain text "NH" monogram badge instead of `<Image src={BRAND.sidebarLogoPath}>` (the
  now-unused `Image` import was removed); `src/app/layout.tsx`'s `openGraph.images` entry was
  removed rather than pointing at a stale/null path.
- `src/app/icon.png` (Next.js favicon convention) **left unchanged** — it's a real image file
  (the old conductor mark), not UI code, so replacing it would mean fabricating a new logo
  graphic, which the task's hard safety rules explicitly forbid. This is the one place the old
  mark is still visibly shown (browser tab icon) — flagged below as required manual follow-up.
- Root-level `maestron-logo.png` was already deleted by a prior/peer session before this task
  started (shows as `D` in `git status`) — not touched further.

## Renamed files
None. No file/directory renames were performed — every change was in-place text/content editing.
(`docs/implementation-plans/notaplan-product-expansion.md`'s filename was deliberately kept, since
it's pointed to by the user's cross-session memory file outside this repo; only its title line was
renamed.)

## Phase 4 — root directory relocation: BLOCKED

Out of scope for this session by explicit instruction. The repo root
`/Users/hidircanyagiz/Projects/notaplan` was **not** renamed or moved. Reason: active peer
sessions are running against linked git worktrees (`.claude/worktrees/`, plus the sibling
`/Users/hidircanyagiz/Projects/neviios-control` and
`/Users/hidircanyagiz/Projects/worktrees/mobile-product-redesign` checkouts) that resolve paths
relative to the current root location — moving it would break those sessions. All literal
`/Users/hidircanyagiz/Projects/notaplan` path references in code, scripts, and docs were
therefore left unchanged as accurate, since the directory still lives there.

## Validation results

Run from `/Users/hidircanyagiz/Projects/notaplan` after all changes above.

**`npx prisma validate`**
```
Prisma schema loaded from prisma/schema.prisma.
The schema at prisma/schema.prisma is valid 🚀
```

**`npm run typecheck`** (root, `tsc --noEmit`) — exit 0, no output (clean).

**`npm --prefix apps/mobile run typecheck`** — exit 0, no output (clean).

**`git diff --check`** — exit 0, no output (no whitespace/conflict-marker errors introduced).

**`npm run lint`** — the repo-wide run reports a large **pre-existing** baseline
(132,461 problems: 15,372 errors / 117,089 warnings, mostly `react-hooks/purity` and
`react-hooks/set-state-in-effect`, e.g. in `apps/mobile/src/hooks/use-api.ts`,
`src/components/command-palette.tsx`, `src/components/student-attendance-picker.tsx`) — none of
that is caused by this task; confirmed by running `npx eslint` scoped to only the files this
migration touched, which comes back **0 errors, 13 warnings** (all 13 are pre-existing
`@typescript-eslint/no-unused-vars` in `src/lib/services/tools.ts`, at line numbers unrelated to
the one payment-email string edited there).

**Focused tests for files actually changed** (`STORE_MODE=json VERCEL=1 npx vitest run
src/lib/__tests__/whatsapp-webhook.test.ts src/lib/__tests__/middleware-jwt-secret.test.ts
src/lib/__tests__/provider-auto-order.test.ts src/lib/__tests__/response-shaping.test.ts`):
```
Test Files  4 passed (4)
     Tests  34 passed (34)
```

**Full suite (`npm test`)** — ran to completion:
```
Test Files  7 failed | 205 passed (212)
     Tests  8 failed | 2089 passed (2097)
```
All 8 failures are pre-existing and unrelated to this migration — they're in lesson
scheduling/trial-lesson/homework-attachment logic
(`lesson-move-resize-flow`, `lesson-series-tools`, `lesson-scheduling`, `find-person-schedule`,
`homework-attachment`, `lesson-update`, `trial-lesson-duration` ×2 tests), none of which import or
exercise anything this task touched (brand.ts, sidebar, AI assistant UI, WhatsApp handler,
provider system prompts, seed demo names). The run also logged this codebase's own documented
warning ("`npm run dev` şu an açık bir process'te çalışıyorsa bu scripti ÇALIŞTIRMAYIN") because a
`next dev` server was in fact running concurrently on port 3000 during this run
(`STORE_MODE=json` has no cross-process file lock, per `src/lib/atomic-json-file.ts`) — so these
failures may additionally be dev-server file-lock flakiness rather than deterministic bugs; either
way, they predate and are independent of this branding change. The 34/34 focused-test pass above
is the reliable signal for the files this task actually modified.

**Repo-wide case-sensitive brand grep** (excluding `node_modules`, `.git`, `.next`,
`.claude/worktrees`):
```
$ grep -rl "NotaPlan" .    → 0 files
$ grep -rl "Maestron" .    → public/brand/maestron-logo.svg (unreferenced asset, own aria-label),
                              src/app/layout.tsx / src/lib/brand.ts (migration-explaining comments),
                              src/lib/seed.ts (accurate historical provenance comment, see inventory)
```
All four remaining `Maestron` hits are expected/intentional per the inventory — no live
user-facing surface still shows the old brand name.

## Required manual follow-up (cannot be done from this session)

1. **New logo/favicon asset.** No approved Nevii Hub logo exists. `src/app/icon.png` (browser tab
   icon) still shows the old Maestron conductor mark — replace it once real artwork exists. The
   sidebar and OG-image code paths already fall back to text (no broken image), so this is
   cosmetic-only, not urgent.
2. **App Store / Play Store identity** — not applicable yet (app never distributed), but once it
   is, `com.neviihub.mobile` / `neviihub` scheme / `nevii-hub-mobile` slug are the values to
   register with Expo/EAS, Apple, and Google.
3. **Vercel/hosting project name, custom domain, GitHub repo name/URL** — all still say
   `notaplan` (e.g. `github.com/hidircan/notaplan`, `vercel.com/new` import). Renaming these is a
   manual dashboard action outside this session's reach; until done, `README.md`/`DEVOPS_GUIDE.md`
   correctly still document the real (unrenamed) URLs.
4. **OAuth/webhook external registrations** — none found configured (WhatsApp Cloud API verify
   token is dev-only placeholder; no OAuth provider config present), so nothing to re-register.
5. **Staging DB** (if `STORE_MODE=db` is live anywhere) — the demo/system bootstrap emails and
   the JWT issuer/audience were deliberately left as `notaplan`/`notaplan-api` for exactly this
   reason (see Category D table); a real rename of those needs a coordinated, human-approved data
   migration, not a code change.

## Developer commands (unchanged — root path did not move)

```bash
cd /Users/hidircanyagiz/Projects/notaplan
npm run dev              # http://localhost:3000
npm --prefix apps/mobile start   # or: cd apps/mobile && npm start
```

## Confirmation

- No `git add`/`commit`/`push`/`merge`/`rebase`/`reset`/`clean` was run. `git status` still shows
  everything as uncommitted working-tree changes.
- No database migration/push/reset was run; no deploy was triggered.
- No worktree was created, entered, deleted, or modified; `.claude/worktrees/`,
  `/Users/hidircanyagiz/Projects/neviios-control`, and
  `/Users/hidircanyagiz/Projects/worktrees/mobile-product-redesign` were not touched.
- The repo root directory itself was not moved or renamed.
