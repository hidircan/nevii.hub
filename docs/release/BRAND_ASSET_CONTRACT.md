# Brand Asset Contract

## Canonical source

`src/app/icon.png` — 1024×1024 PNG, RGB (alfa kanalı yok), beyaz opak zemin üzerinde
koyu gri "NH" monogramı. SHA-256: `b6ad0a534dd4971490d3527066f289cb1ee840fcf077bbf4a60bbc6f17caa6f2`.

Yeni/üretilmiş logo eklenmez; marka değişirse önce bu dosya değişir, aşağıdaki
kopyalar ondan birebir kopyalanır (`cp`).

## Web

| Path | Kullanım | Kural |
|------|----------|-------|
| `src/app/icon.png` | Next.js app icon / favicon (file convention) | Canonical |
| `public/icon.png` | `BRAND.faviconPath`, `BRAND.sidebarLogoPath` | Canonical ile byte-eşit |
| `public/brand/logo.png` | `BRAND.logoPath` / `logoMarkPath` (sidebar, login, landing, platform logo fallback) | Canonical ile byte-eşit |

Neden byte-eşit: sidebar, favicon ve login aynı markayı göstermeli; iki ayrı dosya
`cc13cac`'te ayrıştı ve `public/brand/logo.png` piksellere gömülü damalı (sahte
şeffaflık) bir sürümle değişti. Byte eşitliği bunu CI'da yakalar.

## Mobile (`apps/mobile/app.json`)

- `icon`, `splash.image` → `./assets/icon.png`: iOS App Store ikonu alfa kanalı
  **içeremez**; bu yüzden opak RGB olmalı. Şu an canonical ile byte-eşittir.
  Web logosu ileride şeffaf (RGBA) bir sürüme geçerse mobil ikon ona kopyalanmaz —
  opak sürüm ayrı platform asset'i olarak kalır.
- `android.adaptiveIcon.foregroundImage` → `./assets/adaptive-icon.png`: 1024×1024,
  monogram ~%66 güvenli alan içinde ortalanmış (launcher maskesi kenarları keser);
  `backgroundColor` `#FFFFFF`, zeminle aynı.
- Bundle/package: `com.neviihub.mobile` — değişmez.

## Değiştirirken çalışacak testler

- `src/lib/__tests__/sidebar-branding.test.ts` — `public/brand/logo.png` ≡ `src/app/icon.png`
- `src/lib/__tests__/neviios-round2.test.ts` — BRAND path'leri ve dosya varlığı
- `apps/mobile/src/lib/__tests__/app-assets.test.ts` — mobil ikon ölçü, alfa yok, canonical ile eşitlik, adaptive icon, bundle id
