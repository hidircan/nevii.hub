# FRONTEND GUIDELINES — Nevii Hub

Canonical frontend engineering handbook for the Nevii Hub SaaS platform.
Applies to every engineer and every AI coding assistant working on this codebase.

- Stack: Next.js 16 (App Router) · React 19 · TypeScript 5 (strict) · Tailwind CSS 4
- Path alias: `@/*` → `./src/*` (see `tsconfig.json`)
- Tests: Vitest (`npm test`). Verify before merge: `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`.
- UI copy is Turkish (tr-TR). Code, types, and identifiers are English.

---

## 1. UI Philosophy

1. **Clarity over decoration.** A screen is a decision surface. Every element must answer: what is this, what can I do here, and what happens next. If an element does not help a user act or understand, remove it.
2. **Calm, professional interface.** Slate neutrals for structure, one violet accent for the primary action. Color carries meaning (emerald = success/paid, rose = danger/overdue, amber = attention/partial, sky = info) — never decoration.
3. **The admin panel is a work tool.** Density is acceptable where operators act repeatedly (tables, queues). Readability wins where they decide (dashboards, approvals).
4. **Server-first.** Pages are Server Components that read data and render; interactive islands are small Client Components that mutate. If a page can render without JavaScript interactivity, it must.
5. **Progressive, not perfect.** Ship a working, accessible, responsive screen; iterate on polish. Never ship placeholder UI or "coming soon" states in production paths.

## 2. Design System

The design system lives in `src/components/ui.tsx`. **Extend it; do not fork it.**

### Primitives (do not hand-roll equivalents)

| Component | Purpose |
|-----------|---------|
| `Badge` | Status pill; renders `statusLabel`/`statusColor` from `src/lib/utils.ts` when `status` is given. |
| `Card` | White rounded surface with border + soft shadow. Add `overflow-hidden p-0` for full-bleed tables. |
| `StatCard` | KPI tile with accent gradient + icon. Accents: `violet | sky | amber | emerald | rose`. |
| `PageHeader` | Page title + description + optional actions. Every page opens with one. |
| `Button` | `primary | secondary | ghost | danger | success`. Always use for actions. |
| `EmptyState` | Centered dashed empty/placeholder state with title + description. |
| `Input` / `Select` / `Label` | Form controls. Consistent focus ring (`ring-violet-500/30 focus:ring-2`). |

### Rules

- New shared UI → add to `ui.tsx`. A pattern used in 3+ pages is shared by definition.
- Button styling must come from `Button`. If you need a link styled as a button, add an `asChild`/`href` variant to `Button` — do not re-declare button classes on `<Link>` or `<a>`.
- Icons: `lucide-react`, imported per component (tree-shakeable). Sizes: `h-4 w-4` in buttons/rows, `h-5 w-5` in `StatCard`, `h-3 w-3`/`h-3.5` for inline micro-copy.
- Status maps (`statusLabel`, `statusColor`) are single-sourced in `src/lib/utils.ts`. Add statuses there, never ad-hoc color literals.
- Formatting: `formatMoney`, `formatDate`, `formatDateTime`, `formatTime` from `src/lib/utils.ts` (tr-TR locale). Never inline `Intl`/`toLocaleString` variants — use the shared helpers.

## 3. Accessibility

Non-negotiable baseline (WCAG 2.1 AA):

1. **Semantics first.** Use real `<button>`, `<a>`, `<form>`, `<label>`, `<table>` elements. Do not fake interactivity with `<div onClick>`.
2. **Label association.** Every `Input`/`Select` must have a visible `<label>` associated via `htmlFor`+`id`, or `aria-label`/`aria-labelledby` when the label is not visible. The shared `Label` component must receive an `htmlFor`; never rely on implicit wrapping alone.
3. **Focus is visible.** Default focus rings must not be removed. Keep the shared `focus:ring-2` contract on all interactive elements.
4. **Disabled state.** A control that cannot act yet must be a real disabled control (`disabled`), not an anchor with `aria-disabled` + `preventDefault`. This includes approval-gated links (e.g., WhatsApp send): render a disabled `<button>` when locked, the actionable `<a>` only when unlocked.
5. **State toggles.** Toggles/expanders (e.g., edit mode, disclosure) expose state with `aria-expanded`/`aria-pressed` and reflect it visually.
6. **Error feedback.** Every mutation surfaces failures inline: a visible error message near the control/panel (`text-rose-*`), with the server reason when available. Silent `res.ok` failure is a bug.
7. **Text alternatives.** Icons must be paired with visible text or have `aria-hidden` + adjacent text. Decorative icons in buttons are `aria-hidden`; never announce "icon".
8. **Reduced motion.** Honor `prefers-reduced-motion`; animation (spinners, streaming) must not be the only status signal — pair with text.
9. **Touch targets.** Interactive elements ≥ 32px hit area on mobile; keep the shared `px-3 py-2`-style minimums.
10. **Live regions.** Streaming/async status changes that announce themselves use `aria-live="polite"` sparingly; do not announce every token.

## 4. Component Structure

### File layout

- `src/components/ui.tsx` — design-system primitives (server-safe, no hooks).
- `src/components/<name>.tsx` — feature components. One component per file.
- Client components opt in with `"use client"` at the top — only when hooks/events are needed.
- Server components stay plain; importing client components from server components is the normal composition.

### Composition rules

1. **Page = composition.** A page reads data (service/store) then composes `PageHeader` → stat grid → `Card` lists/tables. Keep pages declarative; move logic to `src/lib/`.
2. **Client components are thin and presentational.** They receive props, render, and call `fetch`/server actions. Business rules live in `src/lib/`, not in the component.
3. **One responsibility per component.** `TahsilatMessageApproval` owns the approve→send→paid lifecycle for one payment; it does not also render the queue.
4. **No duplication.** If two screens render the same element, extract it. Reuse `ui.tsx` primitives and existing feature components before writing new markup.
5. **Props are explicit and typed.** No implicit `any`; document ambiguous props with concise type aliases.
6. **Server mutation.** Use Server Actions (`src/lib/actions.ts`) for form submissions from Server Components; `fetch("/api/v1/...")` from Client Components. Always pass `credentials: "include"`.

## 5. Tailwind Standards

Tailwind CSS 4 (`@import "tailwindcss"` in `src/app/globals.css`, theme via `@theme inline`).

1. **Use design tokens from `@theme`** for fonts and base colors; add tokens there, not one-off arbitrary values.
2. **Utility-only, single file of truth.** No `@apply` component classes in CSS. Component styles live in `src/components/ui.tsx`.
3. **Merge with `cn()`.** Compose conditional classes with `cn(...)` (`clsx` + `tailwind-merge`) — always the last word wins. Never template-concatenate class strings.
4. **Color vocabulary.** Neutrals: `slate-*`. Primary: `violet-600`/`violet-700`. Success `emerald-*`, danger `rose-*`, warning `amber-*`, info `sky-*`. Status tints: `bg-{color}-50` surface + `text-{color}-800`/`900` + `border-{color}-100/200`.
5. **Arbitrary values are the exception.** Prefer tokens (`w-64`, `max-w-7xl`, `rounded-xl`, `shadow-sm`). Use arbitrary values only when no token exists (e.g., sidebar `bg-[#0f0b1a]`).
6. **Consistent spacing scale.** Sections: `mb-8` header → `mb-6`/`mt-6` between blocks → `gap-4` grids → `p-4`/`p-5` cards. Follow the existing rhythm; do not invent new spacing values per screen.
7. **Responsive prefixes only where needed.** `sm:`/`md:`/`lg:`/`xl:` in ascending order. Do not duplicate a layout across breakpoints unnecessarily.

## 6. Responsive Rules

1. **Mobile-first classes.** Base styles are mobile; add `sm:`/`lg:`/`xl:` upward.
2. **Stat grids.** `grid gap-4 sm:grid-cols-2 xl:grid-cols-4` for KPI rows (1 → 2 → 4 columns). `sm:grid-cols-3` for smaller stat rows.
3. **Layout columns.** Two-column panels: `grid gap-6 xl:grid-cols-3` with `xl:col-span-2` primary. `lg:grid-cols-2` for dashboard cards. `lg:grid-cols-[240px_1fr]` for list/detail split (chat).
4. **Cards flex.** Card rows: `flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between` — stack on mobile, row on ≥sm.
5. **Tables.** Every table is wrapped in `<div className="overflow-x-auto">` inside a `Card` with `overflow-hidden p-0`. No exception — a table must never clip or break the viewport on mobile.
6. **Page header.** `PageHeader` stacks (`flex-col`) on mobile, `sm:flex-row sm:items-end sm:justify-between` above. Use it as-is.
7. **Navigation.** The panel sidebar is desktop (`w-64` fixed). The nav must remain usable on mobile; a responsive pattern (collapsible drawer) is the standard for new navigation work. Test the primary flows at 375px, 768px, 1440px.
8. **Text.** Use `text-sm`/`text-xs`/`text-[11px]` hierarchy as established; allow `truncate`/`line-clamp` for constrained rows. Never overflow a container with long unbroken strings.

## 7. Folder Organization

```
src/
  app/                 # App Router — routes, layouts, page.tsx (Server Components)
    panel/             #   admin portal (sidebar layout)
      <feature>/page.tsx
    veli/              #   parent portal
    ogretmen/          #   teacher portal
    api/v1/<resource>/route.ts   # API routes (withApiHandler + ctx)
  components/          # shared components (feature + ui.tsx primitives)
  lib/
    actions.ts         # Server Actions (mutations)
    services/          # tool/services layer (RBAC + ctx.tenantId)
    auth/              # session, JWT, RBAC types
    tahsilat/ workflows/ ai/ whatsapp/ ...  # domain logic
    utils.ts           # cn, formatters, status maps
  app/globals.css      # Tailwind v4 entry + theme tokens
```

1. **Route = URL = folder.** A page's folder path is its URL path under `/panel`. No nested layouts where the route tree does not warrant them.
2. **`app/` is routing, `components/` is sharing, `lib/` is logic.** Client components never import from `lib/` modules that touch the database or secrets; they call API routes or Server Actions.
3. **Domain modules** (`tahsilat`, `workflows`, `ai`, `whatsapp`) each own their store access, types, and services. Cross-domain data goes through the service layer, not direct imports.
4. **Keep `app/*/page.tsx` thin.** A page over ~250 lines is a signal to extract a component or move derivation into `lib/`.
5. **Tests** live next to the domain they test under `src/lib/__tests__/` (e.g., `tahsilat-intake.test.ts`), run in file mode against temp data. No test writes to the repo `data/` directory.

## 8. Naming Conventions

1. **Files:** `kebab-case.tsx` for components/pages (`tahsilat-message-approval.tsx`). Domain libs `kebab-case.ts` (`store-json.ts`, `whatsapp-templates.ts`).
2. **Components:** `PascalCase` export, file name matches export (`export function TahsilatMessageApproval`). Shared primitives: `Badge`, `Card`, `StatCard`, `PageHeader`, `Button`.
3. **Functions/state:** `camelCase`. Server Actions prefixed `action*` (`actionMarkPaymentPaid`). API handlers: `GET`/`POST` exports.
4. **Types:** `PascalCase` (`FollowUpStatus`, `FollowUpCase`, `AppData`, `ServiceContext`). Discriminated unions for event/state machines (`StreamEvent`, follow-up lifecycle `draft → approved → sent → replied → paid | lost`).
5. **Constants:** `UPPER_SNAKE` for module-level constants (`WORKFLOW_REGISTRY`, `FOLLOW_UP_CASES_FILE`).
6. **Props:** explicit, destructured, typed inline or via `type XProps`. Boolean props `is*`/`has*` only when clarity requires.
7. **CSS classes** are utility tokens (Tailwind); custom semantics live in `@theme` tokens, named after their role not their value (`--font-sans`, `--color-background`).
8. **Status enums:** lowercase_snake values, single source of truth in one type + one label/color map (`statusLabel`, `statusColor` in `utils.ts`).

## 9. Performance Best Practices

1. **Server Components by default.** Data fetching and derivation happen in `page.tsx` (Server Component) with `export const dynamic = "force-dynamic"` for live data. Move data fetching into a client component only when unavoidable.
2. **Keep the client bundle small.** Client components are islands. Watch the `lucide-react` per-component imports (tree-shaken), and never import `lib/` server modules into `"use client"` files.
3. **Parallelize data.** Resolve independent reads with `Promise.all` in pages (`workflows/page.tsx`). Sequential `await`s on independent data are a defect.
4. **Derive in one pass.** Prefer `Map`/index lookups over nested `.find` in render loops (`O(n·m)` → `O(n)`). Cache derived collections before `.map`.
5. **Idempotent keys.** Stable, unique `key` props from entity ids. Synthetic indices (`idx`) only for static lists; never for reorderable/live rows.
6. **Streaming UI.** Long AI/tool operations stream via SSE; render incrementally, show a non-animation status, and avoid re-fetching the whole resource on every event.
7. **No unused code.** No dead branches after `redirect()`, no unused imports/exports (CI `typecheck` + `lint` enforce this). Keep bundle-size regressions out of review.
8. **Avoid client-side lists.** When a list can be rendered server-side, render it server-side. Pagination/limits are applied in the service layer (`listFollowUpCases`, `listWorkflowRuns(tenantId, limit)`).
9. **Prefer `next/link` for navigation**; prefetch is handled by the router. Do not hand-roll navigation with `<a href>` inside the app.
10. **Audit with tools.** Before merge: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Any change to `ui.tsx`, `globals.css`, or a shared component is reviewed for system-wide impact.

---

*This document is part of the Nevii Hub Engineering Handbook. When the design system, Tailwind tokens, or component structure evolve, update this file in the same change — it is the contract every page is built against.*
