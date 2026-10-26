# NeviiHub — Güncel snapshot (resume-from-here)

Kısa tutulur (~50 satır): oturum sonunda yalnız "Güncel snapshot" bölümünün ÜZERİNE yazılır; eski snapshot
`archive/`'e taşınır. Ayrıntı → ilgili `docs/testing/UAT_*.md`, `docs/operations/*`. Yönlendirici: `nevii-hub` skill.
Tam tarihçe (2026-08-30 → 09-24): `archive/PROJECT_STATE_LOG_2026-08-30_to_2026-09-24.md`.

## Ürün / kalıcı kararlar (yeniden tartışma)
- Çok kiracılı müzik okulu SaaS; Next.js 16 + Prisma/PostgreSQL; json/memory/db store parity (bkz. CLAUDE.md).
- Telafi: eğitim yılı başına 2 hak, kaçan dersten itibaren 30 gün. Ödeme penceresi: kart 1–5, havale/nakit 1–15, merkezi.
- KDV: fiyatlar KDV dahil ("Tüm eğitim ücretleri KDV dahildir."). Gerekçe: `docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`.
- Kritik işlem kapısı TEK: `checkCriticalPassword` + `canRunCriticalActions` (tools.ts).
- Rol modeli: tek HYPER_ADMIN platform sahibi; kurum sahibi SUPER_ADMIN.

## Güncel snapshot — 2026-10-26 (SaaS abonelik V1)

- **Dal:** `feat/saas-billing-v1` (HEAD `fbe6f63`, local commit bekliyor). **Migration (additive, UYGULANMADI):**
  `20261026090000_saas_billing_v1` — 6 yeni tablo; Payment/Contract/Payout'a dokunulmaz.
- Kapsam: katalog genişletme + iyzico Abonelik sandbox istemcisi (mock etiketli) + durum
  makinesi + webhook inbox/mutabakat + enforcement (varsayılan KAPALI) + trial + pilot
  kampanya + NeviiAds köprüsü (varsayılan KAPALI) + `/abonelik`, `/deneme`, `/platform/fatura`.
- Doğrulama: 51 yeni test geçti; typecheck/prisma validate/build geçti; kapsam lint temiz.
  Gerçek iyzico sandbox E2E YAPILMADI (merchant anahtarları owner'da). Detay:
  `docs/billing/SAAS_BILLING_V1.md` (UAT 15 adım + go-live listesi).
- KRİTİK: `test.neviihub.com` prod'a 307 redirect (2026-10-25 ölçüm) — test hedefi
  olarak KULLANILMAZ. Deploy yok; izole Preview/test-DB owner onayıyla doğrulanacak.
- NeviiAds'e dokunulmadı (local); yeni cron/polling/senkron yok.

## Güncel snapshot — 2026-09-28 (NeviiOS Control Center)
- **Dal:** `feat/neviios-control-recovery` → `test` (`e73aee9`). **Migration yok.**
  6 commit: mobil kontrol matrisi + marka doğrulama; Expo policy kapısı;
  kurum karşılama/logo-sanitize/önizleme; Homebrew Hacker + Gloock + control room;
  ayrı `/platform/giris` kapısı; kapı döngü düzeltmesi.
- Test deployment: Vercel Preview Ready, `test.neviihub.com` `e73aee9` sunuyor
  (`/platform/giris` 200 + kapı görünümü, `/platform` → kapıya, `/login` 200 aynen).
- Web: typecheck/lint temiz, hedefli 267 test + mobil 215 test geçti; tam suitte
  7 test 4 dosyada başarısız — temiz HEAD'de de kırık (önceden var): password-reset-ui,
  staff-onboarding, portal-access-management (6-8), seed-demo-schedule.
- Mobil: `apps/mobile` typecheck temiz (dep'ler kuruldu), cihaz/mağaza/EAS/push YOK.
- UAT: `docs/testing/UAT_2026_09_28_NEVIIOS_CONTROL_CENTER.md` (12 adım).
- Bulgu: route group üst layout'u devre dışı bırakmaz — kapı döngüsü yol başlığı
  (`x-neviios-path`) + kabuk muafiyetiyle çözüldü; Preview'da canlı doğrulandı.

## Güncel snapshot — 2026-09-28 (9. tur)
- **Dal:** `feat/uat-round-9` → `test` (NeviiOS `05c172d` üstüne rebase). **Migration (additive):**
  `20260928090000_lesson_disruption_task_soft_delete` — **test DB'ye uygulandı 2026-09-28** (owner onayı; kayıt sayıları ve
  Lesson/Task parmak izleri önce/sonra aynı). UAT: `docs/testing/UAT_2026_09_28_ROUND_9.md`.
- Owner 2026-09-28: "Diğer" kaynaklı telafi öğrenci kotasından düşer; kaynak düzeltilince kota canlı yeniden hesaplanır
  (sayaç yok); "Diğer" öğretmen devamsızlığı yazmaz.
- Owner kararları (2026-09-27): paket/iş silme = mevcut kritik işlem şifresi, SUPER_ADMIN+SCHOOL_ADMIN; öğretmen/kurum
  kaynaklı telafi öğrencinin kişisel hakkından düşmez; öğretmen devamsızlığında otomatik hakediş kesintisi yok;
  **tahsil edilen = `collectedAmountOf` (kısmi dahil)** — tüm finans ekranları bu tek fonksiyon.
- Koyu tema token düzeyinde: obsidyende Tailwind palet değişkenleri yeniden eşlenir (globals.css); yazdırma sayfaları
  `.print-light-palette` ile açık palete sabit. axe (11 sayfa): koyu 35→0, açık 12→10 (kalan 10 eski).
- Kapsamlar: `payment-scope.ts` (Ödemeler aktif/pasif/tüm), `payout-overview.ts` (Hakediş). Geri dönüş: `withReturnTo`/`returnToLabel`.
- İptal/Telafi kaynağı: `lesson-disruption.ts` (öğretmen katılımından ayrı); öğretmen raporu `teacher-attendance-report.ts`.
- Oda düzenleme (owner ek isteği): `room-revision.ts` + `RoomEditDialog`.

## Güncel snapshot — 2026-09-27 (NeviiOS erişim)
- **Dal:** `feat/neviios-control-recovery` → `test`. Yeni migration yok. HYPER_ADMIN satırı YAZILMADI: canlı deployment'ın Supabase kimliği Vercel Secret olduğu için doğrulanamadı. Yerel `~/Projects/nevii-hub/.env` production ref'ine gider; ona sorgu/yazım yok.
- Platform kabuğu, kayıtlı tema yoksa koyu yeşil token kullanır (`neviios-theme.css`). `globals.css`, `ui.tsx`, `sidebar.tsx` bu turda değişmedi.
- Kurum özeti tenant kimliğiyle okul kaydını yan yana gösterir; ad farkını yazar, düzeltmez. Dil: `locale.language` tenant override + `Tenant.language`. Giriş, sıfırlama sayfası ve sıfırlama e-postası bu dili izler. Panelin geri kalanı Türkçe.
- Şifre yazımı `sessionsRevokedAt` basar. SMTP canlıda doğrulanamadı; anahtarlar `.env.example` içinde. SPF `include:_spf.mx.cloudflare.net`. DKIM/DMARC bu oturumda doğrulanamadı.
- Önceki 8. tur notu: `feat/uat-round-8` migration `20260927090000_room_soft_delete` test DB'ye uygulandı (owner). Claude'un 9. tur kirli paneli ayrı worktree'de duruyor.

## Ortamlar
- Test: `test` dalı → Vercel → `test.neviihub.com`; test DB Supabase `vxzewyiwfshobjizzetw` (repo migration'ları uygulandı,
  son kontrol 2026-09-21; 22–23.09 additive migration'ları için `docs/operations/RUNBOOK_2026_09_22_CSV_CONTRACT_DELETE.md`).
- Production: dokunulmaz (owner kararı). Yerel `.env` production'ı gösterebilir — DB komutundan önce hedefi kanıtla.
- Vercel Cron: günlük 00:30 UTC retention (`vercel.json`, `CRON_SECRET`).

## Açık iş
- Owner UAT: 9. tur (`UAT_2026_09_28_ROUND_9.md`).
- Mobil panel: yan menü 390 px'te de 256 px sabit (çekmece yok) — ayrı tur önerisi.
- Açık temada 10 eski kontrast ihlali (Evraklar küçük altın link, Öğrenciler soluk sayfalama, Özet gri alt yazı).
- Önceki turlardan: owner UAT 4–8; Pınar/Olcay Evka 3; geçmiş sözleşmeler (hukuki); `[neviios] platform store` timeout; mobil EAS build.

## Riskler / bilinen durum
- Tam paket 2026-09-28: 345 dosya / 3653 test, 0 başarısız (J2 tarihe bağlı kırmızısı kök nedeniyle düzeltildi).
- Denetim kaydı json modunda da Prisma'ya yazmaya çalışır; yerel tarayıcı testinde `DATABASE_URL`'i geçersiz adrese
  yönlendirin (bu turda böyle yapıldı — gerçek DB'ye yazım olmadı).
- `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş; güncel durum burası.
