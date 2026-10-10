# Mobil Yayın Hazırlık — Store Compliance, Veri Envanteri, Hesap Silme, Admin Faz Planı, UAT

Tarih: 2026-09-20 · Branch: `release/mobile-review` · Kapsam: `apps/mobile` (Expo Router + TS, Expo SDK korunur)
İlke: backend API/RBAC/tenant izolasyonu değişmedi; onaysız veri silme ve geri döndürülemez migration YOK.

## 1. Store compliance matrisi

| # | Gereksinim | Durum | Not |
|---|------------|-------|-----|
| 1 | İzinler: yalnız fotoğraf seçimi; kamera/mikrofon istenmiyor | Kodla tamamlandı | `app.json`: `expo-image-picker` yalnız `photosPermission` (TR metin), `cameraPermission:false`, `microphonePermission:false`; `android.permissions`/`ios.infoPlist` ek izni yok |
| 2 | İzin anında gerekçe (Türkçe, sade) | Kodla tamamlandı | Galeri izni yalnızca fotoğraf seçiminde istenir; reddedilince ayar yolu gösterilir (`account-screen`) |
| 3 | Kullanılmayan SDK/izin/plugin | Kodla tamamlandı | `expo-notifications` + `expo-device` eklendi (SDK 57); ön-plan/push altyapısı gerçek — sahte bildirim YOK |
| 3a | Push izin akışı (iOS/Android) | Kodla tamamlandı | İzin yalnız oturum açıkken, fiziksel cihazda istenir; ret → sunucuya istek YOK; Android `lesson-reminders` kanalı |
| 3b | Online ödeme — kart verisi yasağı | Kodla tamamlandı | Kart/CVV uygulamaya GİRMEZ: hosted checkout URL'i sistem tarayıcısında açılır; `payment-result` deep-link'i sonucu kanıt saymaz (paid yalnız webhook'la) |
| 4 | Uygulama içi Gizlilik/Koşullar/Silme erişimi | Kodla tamamlandı (bilgi ekranı) | `Hesabım > Gizlilik ve veri`; URL yoksa placeholder YOK — bkz. blocker 10–12 |
| 5 | Inter denetimi | Hazır | Doğrudan/dolaylı Inter kullanımı YOK (`interface`/`interval`/`userInterfaceStyle` eşleşmeleri yanlış pozitif); gövde sistem sans, display yalnız Gloock (`tokens.ts`, `fonts.ts`) |
| 6 | Gloock ölçülü kullanım | Hazır | Yalnız `BrandMark` + `typography.display`; gövde/form/nav sistem |
| 7 | app.json kimlik (ad/slug/scheme/bundle/package) | Hazır | NeviiHub, `nevii-hub-mobile`, `neviihub`, `com.neviihub.mobile` / `com.neviihub.mobile` |
| 8 | version/build stratejisi | Manuel console işlemi | `0.1.0` == package.json; EAS build numarası Play Console / App Store Connect'te artırılır |
| 9 | icon/adaptive/splash | Kodla tamamlandı | `icon.png` + `adaptive-icon.png` (1024), splash `contain #FFFFFF` |
| 10 | Gizlilik Politikası public URL | Hukuki/operasyonel karar bekliyor (BLOCKER) | `getLegalLinks().privacyPolicyUrl = null`; placeholder yazılmadı |
| 11 | Kullanım Koşulları public URL | Hukuki/operasyonel karar bekliyor (BLOCKER) | `getLegalLinks().termsUrl = null` |
| 12 | Herkese açık hesap-silme talep URL (Google Play) | Hukuki + Backend blocker (BLOCKER) | `getLegalLinks().accountDeletionUrl = null`; web route önerisi: `GET /hesap-silme-talebi` (herkese açık bilgilendirme) + girişli `POST /api/v1/account/deletion-requests` — backend YOK, karar gerekli |
| 13 | Apple review demo hesabı / demo modu | Manuel console işlemi | İnceleme notuna çalışan kurumsal demo hesabı eklenir; güvenli demo modu YOK |
| 14 | Tablet davranışı | Manuel console işlemi | `supportsTablet:true`; büyük ekran düzeni ayrıca UAT ile doğrulanır |
| 15 | Deep-link scheme | Kodla tamamlandı | `neviihub`; `payment-result` (ödeme dönüşü) + push `data.kind` → rol-bazlı ekran eşlemesi (bilinmeyen kategori → `/notifications`, ölü link YOK) |
| 16 | Erişilebilirlik (SR label, focus, kontrast, font scaling, reduced motion, klavye) | Kodla tamamlandı (kısmi) | Persona/Login/Hesabım'da label+hint, hata anonsu, 44–48pt hedef; tam SR süpürmesi UAT'ta |
| 17 | PII/token log yasağı | Hazır | Hata mesajları sızdırmaz (`auth-context` genel mesajlar); push token değeri loglanmaz/yanıtta dönmez (maskeli); çocuk adı push'ta varsayılan KAPALI |
| 18 | Push sağlayıcı kimlikleri (FCM/APNs) | Manuel console işlemi (BLOCKER) | Expo Push için FCM sunucu anahtarı + APNs kimliği console'da tanımlanmadan production push iletilemez |
| 19 | Bildirim tetikleyici zamanlama (cron) | Backend/API blocker (BLOCKER) | `POST /api/v1/notifications/tick` secret-korumalı HAZIR; harici zamanlayıcı (cron/Vercel Cron) bağlanmadan per-offset hatırlatma çalışmaz |

## 2. Data Inventory / privacy disclosure taslağı (doğrulanacaklar işaretli)

| Veri | Amaç | Saklama yeri | Üçüncü taraf SDK | Kullanıcı kontrolü/silme | Teknik sahip |
|------|------|--------------|------------------|--------------------------|--------------|
| E-posta + parola (hash) | Oturum açma | Backend DB (mevcut) | Yok | Kurum yöneticisi üzerinden (self-servis YOK) | Backend — doğrulanacak |
| Access/refresh token | Oturum sürdürme | Cihaz `expo-secure-store` | Yok | Çıkışta cihazdan silinir; sunucu revoke logout'ta | Mobil (`auth-context`, `token-storage`) |
| Profil fotoğrafı | Hesap görseli | Backend `/photo` uçları | `expo-image-picker`, `expo-image-manipulator` (cihaz-içi) | Uygulamadan değiştir/kaldır | Mobil + Backend — saklama süresi doğrulanacak |
| Ders/ödev/devam/ödeme görüntüleme | Eğitim hizmeti | Backend API (salt-okunur istemci) | Yok | Salt-okunur; düzeltme kurum üzerinden | Backend — saklama politikası doğrulanacak |
| Tema tercihi | Görünüm | Cihaz (`SecureStore`, legacy key `notaplan_theme_preference`) | Yok | Uygulamadan değiştirilir | Mobil — key rename backlog |
| Tanılama/crash verisi | — | Doğrulanacak | Sentry/analytics SDK YOK (paket listesinde yok) | — | Helios — doğrulanacak |
| Expo push token (cihaz) | Hatırlatma/işlem bildirimi iletimi | Backend `DevicePushToken` (tenant+user kapsamlı); değer yanıtta dönmez | Expo Push (APNs/FCM taşıyıcı) | Bildirim tercihi + çıkışta tüm token'lar devre dışı; izin reddi = kayıt yok | Mobil + Backend — FCM/APNs console kimlikleri doğrulanacak |
| Ödeme yönlendirme (checkout URL) | Online tahsilat başlatma | Sunucu üretir, saklanmaz (deneme kaydı: referans + tutar) | Seçili sağlayıcı (iyzico/Stripe — karar bekliyor) | Sağlayıcı kapalıysa dürüst "henüz aktif değil" | Backend — sağlayıcı seçimi + sandbox E2E doğrulanacak |

Tahmin YOK: saklama süreleri, log politikası ve üçüncü taraf işlemciler hukuk/backend onayına tabi.

## 3. Account deletion tasarımı + eksik backend gereksinimleri

- Uygulama hesap OLUŞTURMAZ (kurumun verdiği hesap) — Apple "hesap oluşturma varsa silme de olmalı" koşulu bu yüzeyde tetiklenmez; yine de `Hesabım > Gizlilik ve veri > Hesabımı silme talebi` bilgi akışı eklendi.
- Tasarım: tek dokunuşla silme YOK; bilgi diyaloğu (geri döndürülemezlik, veri kategorileri, yasal saklama istisnası, kurum yöneticisi üzerinden talep) + `Anladım` ile kapanır. Sahte "silindi" API çağrısı YOK (`legal-links.test.ts` kilitler).
- Blocker'lar (onay gerekli): self-servis silme/anonimleştirme endpoint'i YOK (mobilde tek `apiDelete` fotoğraf uçları; `src/app/api/v1/account` yalnız change-password/email-change; admin-only `/platform/users` lifecycle); veri saklama kuralları YOK; public silme-talep URL'i YOK (web route + kimlik doğrulama yaklaşımı kararı gerekli). DB şeması/hukuki metin değişikliği ÖNERİLMEDİ, uygulanmadı.

## 4. Admin mobil faz planı (bu turda genişletme YOK)

Kural: öğrenci/veli/öğretmen deneyimini veya store blocker'ını etkileyen admin kırılması yoksa admin dosyasına dokunulmaz.

| Özellik | Öncelik | Gerekçe |
|---------|---------|---------|
| Yoklama alma (mobil) | P0 (admin) | Çekirdek kurum operasyonu; öğretmen read-only kalır |
| Öğrenci/personel temel yönetim (ara, görüntüle, iletişim) | P0 (admin) | Günlük saha ihtiyacı |
| Ödeme/finans özet + tahsilat kaydı | P1 | Web'de kalabilir; mobilde özet + kritik aksiyon |
| Duyuru/mesaj gönderimi | P1 | Sıklık düşük, web kabul edilebilir |
| Onay/iş akışları (telafi, izin, müsaitlik) | P1 | Mobil onay gerçek zaman kazandırır |
| Raporlar (kurum analitiği) | P2 | Web'de kalır; mobilde yalnız kritik özet |
| İleri operasyon (şube/ücret/dönem ayarları) | P2 | Web-only |

## 5. Çalıştırılan testler

- `apps/mobile`: `npm run typecheck` — PASS
- `apps/mobile`: `npm test` — 38 dosya / 277 test PASS (push kayıt/deep-link 9 + checkout 5 dahil)
- `apps/mobile`: `expo-doctor` — 21/21 PASS
- Backend: `npm run typecheck` — kendi dosyalarımız temiz; HEAD'den gelen 2 pre-existing hata (`push-preference-gate`, `teacher-availability-response` — `channel:"test"` daraltması, dokunulmadı)
- Backend: `npm test` (temiz `/tmp` ile tam süit) — 3275/3277 PASS; yeni `lesson-reminder-sweep` (6) + `mobile-payment-checkout-route` (4) dahil PASS. Kalan 2 hata `seed-demo-schedule` — çevresel (sandbox `tsx` IPC `EPERM`), izolasyonda da aynı, kodla ilgisiz
- Backend: `npx prisma validate` — PASS (client yeniden üretildi)
- `apps/mobile`: `verify:mobile-bundle` (expo export ios+android) — PASS
- Kilit testler: `welcome-flow` (iki persona), `display-name` (rol-etiket-asla-ad-değil + statik), `legal-links` (placeholder-yok + no-fake-delete), `teacher-read-only`, `student/parent-scope-guard`, `service-contracts` (hosted-checkout-only güncellendi)

## 6. Gerçek cihaz UAT checklist

1. Öğrenci SELF login → session restore (uygulamayı kapat/aç) → program → ödev → ödeme
2. Guardian login → `Çocuğum` bağlamı (ad/ilişki net, yanlış öğrenci YOK) → ders/ödev/ödeme
3. Öğretmen login → Bugün/hafta/ders-detay read-only (yoklama/start-end/öneri YOK) → ödev ver → gelişim/değerlendirme → profil adı (skeleton → gerçek ad, "Öğretmen" fallback YOK)
4. Welcome → persona login → geri welcome (tek back, döngü YOK) → login → session restore doğrudan persona evi
5. Küçük iPhone + büyük font + dark/light + klavye açık login (taşma/CTA gizlenmesi YOK)
6. Uçak modu / yavaş ağ / timeout / expired token / logout sonrası hassas veri temizliği
7. Hesap silme bilgi akışı (gerçek silme YOK — yalnız metin/UX; test hesabında bile silme denenmez)
8. Büyük yazı + screen reader ile ana akışlar; tüm CTA'lar ≥44pt
9. Push UAT (fiziksel cihaz, staging backend): izin ver → token kaydı (sunucuda maskeli doğrulama) → 1s/15dk hatırlatma bildirimi → dokunma ilgili programa düşer; izin reddi → kayıt YOK; çıkış → token devre dışı (tekrar bildirim YOK); veli iki çocuk → iki bildirim
10. Ödeme UAT (sandbox sağlayıcı): açık ödeme → "Online öde" → sistem tarayıcısı (uygulamada kart formu YOK) → success/cancel deep-link → `payment-result` bilgilendirme → liste bakiyesi tazelenir; sağlayıcı kapalıyken "henüz aktif değil" (sahte başarı YOK); webhook'suz "paid" YOK

## 7. Bilinen riskler ve onay gerektiren kararlar

1. [ONAY] Backend self-servis silme/anonimleştirme politikası + endpoint (yoksa store riski kalır).
2. [ONAY] Gizlilik/Koşullar/silme-talep public URL'leri + web route (`/hesap-silme-talebi` önerisi) ve kimlik doğrulama modeli.
3. [ONAY] Apple review demo kurumsal hesabı (hangi tenant/rol).
4. [BİLGİ] Yönetici görünür karşılama CTA'sı eklenmedi (istek §7); admin mevcut kurumsal rotadan çalışır.
5. [BİLGİ] `apps/mobile/.env.example` çalışma ağacında önceden kirliydi; dokunulmadı.
6. [BİLGİ] Tema SecureStore legacy key (`notaplan_theme_preference`) backlog; store engeli değil.
7. [ONAY] Ödeme sağlayıcı seçimi (iyzico vs Stripe) + sandbox E2E; seçim yoksa mobil "Online öde" dürüstçe kapalı kalır (CONFLICT → "henüz aktif değil").
8. [ONAY] Push sağlayıcı (Expo Push + FCM/APNs console kimlikleri) ve `EXPO_PUSH_ACCESS_TOKEN` prod değeri; `PUSH_ENABLED` açılışı.
9. [ONAY] `POST /api/v1/notifications/tick` harici zamanlayıcı bağlantısı (cron aralığı; 15dk penceresi için ≤10dk aralık önerilir).
10. [BİLGİ] `NotificationPreference` migration'ının prod DB'deki durumu bu turda doğrulanmadı.
11. [BİLGİ] Root `npm run lint`'te 2 pre-existing error (`bugun/index.tsx`, `home-screen.tsx` — conditional hook; dokunulmadı) + root typecheck'te 2 pre-existing error (yukarıda §5).
