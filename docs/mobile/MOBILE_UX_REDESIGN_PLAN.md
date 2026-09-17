# Mobil UI/UX Yeniden Tasarım Planı — P0 (release/mobile-review @ 30b0fb9)

Tarih: 2026-09-17 · Uygulama: `apps/mobile` (Expo SDK 57 / Expo Router) · iOS öncelikli.

## 1. Envanter (mevcut durum)

- Route'lar: `(teacher)` 8 sekme-üstü grup (bugün, öğrencilerim, ödevler, iş-takip, hesabım + gizli telafi/bildirimler),
  `(student)` 5 sekme, `(parent)` 5 sekme + gizli ödemeler/telafiler, `(admin)` 5 sekme (özet, program, kişiler, işlemler, hesabım).
- Design system çekirdeği VAR: `src/theme/tokens.ts` (açık/koyu palet, spacing, radius, tipografi, gölge),
  `src/components/ui/*` (Button, Card, AppHeader, Screen, TextField, Badge/Chip, Empty/Error/Loading, BottomSheet,
  Avatar, LessonCard/HomeworkCard/StatCard/ActionCard…). Sorun: font sistemi yok (Gloock yok, gövde varsayılan),
  başlıklar her yerde aynı sans; karşılama ekranı yok (`index` → doğrudan `/login`); login "boş ekran + form".
- Splash: `app.json` beyaz zemin + `icon.png`; `index.tsx` loading ekranındaki "Nevii Hub" metni tema rengine bağlı
  (beyaz zeminde değil ama native splash'te marka yazısı yok).
- P0 bulguları:
  1. Öğretmen ders detayı (`(teacher)/bugun/[lessonId].tsx:149-154,232-247`) yoklama UI + `POST /api/v1/lessons/:id/ops`
     mutasyonu içeriyor; `bugun/index.tsx:128` "Yoklama bekleyen dersler" bölümü var. Admin yoklama
     (`(admin)/islemler/yoklama.tsx:45-47`) aynı endpoint'i kullanıyor — korunacak.
  2. Backend RBAC (`src/lib/auth/rbac.ts:172-201`): TEACHER rolünde `attendance:write` VAR. Mobil gizleme tek başına
     yetkiyi kaldırmaz — raporda işaretlenecek, **onaysız backend değişikliği yapılmayacak**.
  3. Profil kimliği: `/api/v1/mobile/session` ve `/api/v1/auth/me` isim döndürmüyor; `account-screen.tsx:92`
     `displayName = user?.email || roleLabel` — session restore `loadSession("")` ile boş e-posta bıraktığı için ad
     "Öğretmen"e düşüyor. `Kurum: {tenantId}` ham slug gösteriyor (satır 195).

## 2. Tasarım ilkeleri

1. Kurumsal sakinlik: tek vurgu rengi (mevcut amber/kahve primary korunur), nötr yüzeyler, düşük gürültü.
2. Hiyerarşi kartla değil tipografi + boşluk + bölme ile kurulur; bilgi yoğun ekranlarda liste/bölüm düzeni.
3. Gloock yalnız marka ve anlamlı ekran başlıklarında; gövde her zaman okunaklı sans.
4. Her tekrar eden desen ortak sistemden beslenir; ekrana özel tek seferlik stil yazılmaz.
5. iOS önce: min 44pt dokunma, safe area, Dynamic Type taşmasız (numberOfLines + esnek satır), klavye kaçınma.
6. Yapay görünüm yasakları: gradient/cam efekti yok, emoji-UI yok, anlamsız ikon yok, her ekranda aynı kart yığını yok.

## 3. Renk / font / tipografi / spacing

- Renk: mevcut `tokens.ts` paleti korunur (kontrastı test edilmiş açık/koyu set). Değişiklik: `primarySoft` yüzeyler
  sadeleştirilir, bilgi kartlarındaki renkli kenarlıklar azaltılır.
- Font: Gloock (display, 400) + gövde için sistem sans (`System`, iOS'ta San Francisco). Yükleme: `expo-font`
  `useFonts` + `expo-splash-screen` `preventAutoHideAsync` (açılışta bloklama yok, fallback zinciri:
  Gloock → Georgia/serif → sistem). Dynamic Type: `allowFontScaling` açık bırakılır, başlıklarda `numberOfLines`.
- Tipografi eklentisi: `display` (Gloock 30/36, marka + karşılama + login başlığı), `screenTitle` Gloock 22/28 olur;
  gövde/card/caption aynen sistem sans. `fontFamily` token'ları `fonts = { display, sans }` olarak eklenir.
- Spacing/radius aynen korunur; kart radius 12–16 bandına çekilir (asırı yuvarlak yok).

## 4. Component envanteri (ortak sistem)

Mevcut: Button (primary/secondary/ghost/danger, md/sm, loading/disabled/pressed), Card, SectionHeader, AppHeader,
TextField, FilterChip, StatusBadge, EmptyState, ErrorState, LoadingSkeleton, BottomSheet, ConfirmDialog, Avatar,
Screen (safe area + scroll + refresh + FAB), LessonCard/HomeworkCard/StatCard/ActionCard/StudentCard.
Eklenecek/düzeltilecek: `tertiary` + `icon-only` Button varyantı, uzun etiket davranışı (küçülme yok, iki satır),
`ListRow` (hiyerarşik liste satırı — kart kalabalığına alternatif), `BrandMark` (gerçek logo asset + Gloock kelime),
form hata alanı standardı, ` pengukuran` yok — mevcut set yeterli.

## 5. Navigation değişiklikleri

- Kök Stack'e `welcome` eklenir. `index`: loading → error → `signedOut` ise `/welcome` → session restore → persona evi.
- `welcome`: birincil CTA "Giriş yap" → `/login`; geri dönebilirlik: login'de "Geri" (`router.back()` → welcome).
- `login` success → `/` (index persona'ya yönlendirir); `signedIn` ise login/welcome gösterilmez (döngü yok).
- Diğer navigation aynen korunur (Tabs + PersonaGuard değişmez).

## 6. Ekran öncelikleri ve riskler

P0 sırası: (1) theme/font sistemi → (2) welcome/login/splash → (3) öğretmen yoklama kaldırma + profil düzeltme →
(4) rol ekranları görsel dönüşüm (önce öğretmen/öğrenci/veli ana akışlar, sonra admin) → (5) kalite/test.
Riskler: Gloock lisans/ağ — font paketi indirilemezse serif fallback ile devam, bloklanma yok. Backend
`attendance:write` öğretmen izni duruyor (rapor + onay akışı). Gerçek cihaz testi kullanıcı tarafında (UAT listesi).

## 7. Test kapıları

`npm run typecheck`, `npm run test`, `npm run verify:mobile-bundle` (apps/mobile), `npx expo-doctor`,
rol smoke (self/guardian/teacher/admin), öğretmen mutasyonsuzluk + admin yoklama, Ebru Şirince ad kontrolü,
welcome→login→back + session restore, küçük iPhone taşma kontrolü.
