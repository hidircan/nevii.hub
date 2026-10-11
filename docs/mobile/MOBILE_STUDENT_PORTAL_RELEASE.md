# Öğrenci/Veli Portalı Yayın Kalitesi — Teslim Dokümanı

Tarih: 2026-09-20 · Branch: `release/mobile-review`
Önceki dokümanlar: `MOBILE_GUARDIAN_MULTI_STUDENT.md`,
`MOBILE_TEACHER_SYNC_NOTIFICATIONS.md`, `MOBILE_STORE_RELEASE_CHECKLIST.md`
(hâlâ geçerli; store blocker'ları değişmedi).

## 1. P0 Müsaitlik crash — kök neden ve kanıt

- Belirti: `Hesabım > Müsaitlik` Render Error `Cannot read property 'length' of undefined`.
- Kök neden (doğrulandı): `listTeacherAvailabilityRequestsTool` yalnız
  `{ requests }` dönüyordu; `currentAvailability` alanı hiç üretilmiyordu.
  UI `res.data.currentAvailability.length` çağırınca crash.
- Düzeltme (iki katman):
  - Backend (`src/lib/services/tools.ts`): `{ requests, currentAvailability }`
    her zaman array; legacy kayıtlarda `proposedAvailability` []'e normalize;
    öğretmen kaydı yoksa `[]`. Yetki/filtre değişmedi (TEACHER-own).
  - Mobil (`musaitlik.tsx`): `res.data?.currentAvailability ?? []`,
    `res.data?.requests ?? []`, `r.proposedAvailability ?? []` + `DAYS[i]`
    fallback. Read-only aynen (yazma çağrısı yok — test kilitli).
- Kanıt: `teacher-availability-response.test.ts` (2 test: array sözleşmesi +
  sahiplik) + `availability-crash.test.ts` (savunmacı okuma + read-only) PASS.
- Cihaz doğrulaması: gerçek öğretmen hesabıyla UAT madde 1 (aşağıda).

## 2. Commit listesi

| Commit | Dosyalar | API/RBAC etkisi | Test |
|--------|----------|-----------------|------|
| `af82138` fix availability crash | `tools.ts`, `musaitlik.tsx`, 2 test | Yanıt normalizasyonu (alan ekleme, yetki aynı) | backend 2 + mobil 250 PASS |
| `0fdbd5b` öğrenci navigasyonu | 2 `_layout`, 5 sekme kökü, `portal-tabs.test` | Yok | 253 PASS |
| `e53a34d` durum dili | `lesson-status.ts`, kart, 2 ekran, test | Yok | 256 PASS |
| `26c668e` ödemeler aylık görünüm | `payments-screen.tsx` | Yok | PASS |
| `0fb750d` sözleşmeler + Hesabım | `contracts-screen.tsx`, tipler, route'lar, `account-screen.tsx` | Mevcut uçlar (contracts:read+sahiplik) | 263 PASS |

Güvenlik notu (tümü): backend her istekte erişimi doğrular; istemci ID
üretmez; finans/hukuk verisi uydurulmadı. `.env.example` değişikliğine
dokunulmadı, commitlenmedi.

## 3. Navigasyon before/after

- Sekmeler: Ana Sayfa/Dersler/Ödevler/Gelişim/**Hesabım** → Ana
  Sayfa/Dersler/Ödevler/Gelişim/**Ödemeler** (26pt ikon, 13pt etiket, 64pt bar).
  Hesabım route'u korunur; erişim sekme köklerindeki zil SAĞI profil ikonu
  ("Hesabım" SR etiketi, 44pt, optik hizalı).
- Hesabım (öğrenci+veli): e-posta, şifre, bildirim ayarları, iletişim
  tercihleri, Müfredat (→Gelişim), Materyaller, Sözleşmelerim, Gizlilik ve
  veri, Çıkış + seçili-öğrenci bağlam bandı (çok çocukta seçiciye gider).

## 4. Ödeme veri sözleşmesi

Mevcut (`GET /students/:id/balance`): `{id, studentId, amount, paidAmount,
status, dueDate, paidAt?, description, method?, lessonId?, receiptAvailable}` +
`outstanding`; makbuz (`receipt`); sözleşme taksitleri
(`ContractInstallmentView`: periodLabel/breakdown var). Uygulanan: aylık
gruplama + tahakkuk/ödenen/kalan özeti (backend tutar sunumu) + standart
durumlar + makbuz kartı + detay toplam açılımı.
Eksik (ders-kırımlı tahakkuk: tarih/saat/süre/öğretmen/şube/yoklama/tutar
kalemi): böyle bir uç YOK — N+1 kırılgan çözüm kurulmadı, sahte kalem yok.

**ONAY İSTEMİ — `GET /api/v1/mobile/students/:studentId/payment-ledger?month=YYYY-MM`:**
salt-okunur read model; auth + `assertStudentAccess` + tenant; yanıt
`{studentId, month, currency:"TRY", items:[{lessonId?, date, startAt, endAt,
durationMinutes, teacherName, branchName, instrument, attendanceStatus,
lessonKind: normal|makeup|excluded|pending, amount, pricingRef?}], totals:{...}}`;
cursor pagination; timezone Europe/Istanbul; para minor-unit değil mevcut
`formatCurrency` ile uyumlu; audit log; test: tenant izolasyon, yetkisiz
öğrenci 403, iptal/telafi kuralları, ay filtresi. Finans kuralı/hesaplama
değişikliği YOK — yalnız mevcut kayıtların birleştirilmiş görünümü.

## 5. Sözleşme/PDF raporu — UYGULANDI (gerçek API)

Liste (`contracts:read` + `assertStudentAccess`), detay + taksit planı, imzalı
nüsha paylaşımı (`expo-file-system`+`expo-sharing`, Bearer [REDACTED] indirme, cache'e
yazılmaz, loglanmaz). Paylaşım butonu yalnız `documentInstanceId` varsa;
yoksa açıklayıcı metin (PDF yeniden üretilmez, "aktar" butonu yok). Sahiplik
ön-kontrol + sunucu reddinde güvenli hata; iptal/offline güvenli.

## 6. Bildirim mimarisi — KISMEN MEVCUT, push BLOCKER

Mevcut (doğrulandı): `lesson_upcoming` kategorisi + `sweepUpcomingLessons`
(pencere + `dedupeKey` + 20s penceresi) + kullanıcı bazlı in-app tercihleri
(`notification-preferences` GET/PATCH, yalnız kendi); mobil ayar ekranı gerçek
API kullanır; `tick` secret-korumalı ama cronsuz.
Eksik (onay/altyapı): 1gün/1saat/15dk ayrı per-offset kategori YOK;
per-student tercih kapsamı YOK (satır `tenant_user_category`); push altyapısı
YOK (token tablosu, expo-notifications, APNs/FCM, cron, observability);
guardian politikası KARARSIZ (öneri: aktif çocukların bildirimleri + PII-minimize
metin — uygulamadan önce onay). Sahte toggle/timer yapılmadı.

## 7. Web-mobil parite matrisi (genişletilmiş)

| Web aksiyonu | Mobil ekran | Yenileme | Gecikme | Test |
|---|---|---|---|---|
| Ders/program/yoklama/telafi | Program, ders detayı, ev | focus+foreground+PTR | foreground dönüşü | UAT 11 |
| Ödev ver/değerlendir | Ödev listesi/detay | focus+foreground+PTR | foreground dönüşü | UAT 11 |
| Tahsilat/ödeme kaydı | Ödemeler, sözleşme taksitleri | focus+foreground+PTR | foreground dönüşü | UAT 6,11 |
| Sözleşme oluştur/yenile | Sözleşmelerim | focus+foreground+PTR | foreground dönüşü | UAT 9 |
| Materyal yükle | Materyaller | focus+foreground+PTR | foreground dönüşü | UAT 8 |
| Müfredat ilerlemesi | Gelişim | focus+foreground+PTR | foreground dönüşü | UAT 8 |
| Erişim ver/iptal | Picker/bağlam/tüm kapsamlı | liste+doğrulama | sonraki doğrulama | UAT 4-5 |
| Müsaitlik onayı (admin) | Öğretmen Müsaitlik | focus+PTR | foreground dönüşü | UAT 1 |

Realtime yok (bilinçli); polling yok.

## 8. Test sonuçları ve UAT

- Mobil: typecheck PASS · 36 dosya / 263 test PASS (yeni: crash-sözleşmesi,
  portal-tabs, lesson-status nötr, contracts).
- Backend: availability-response 2/2, my-children 6/6 PASS.
- UAT (gerçek cihaz): 1. Müsaitlik crash yok (loading/empty/error/dolu).
  2. Header zil+sağ hesap. 3. Panelde Hesabım yok, Ödemeler var. 4. SELF/tek/
  çok çocuk. 5. Değişimde eski veri yok. 6. Aylık özet+detay doğruluğu.
  7. "Yoklama bekliyor" yok. 8. Müfredat/materyal doğru çocuk. 9. Sözleşme
  açma/paylaşma/iptal/hata. 10. Bildirim ayarları (push: altyapı sonrası).
  11. Web değişikliği→güncel veri. 12. Küçük iPhone/büyük font/temalar/
  offline/timeout/token/logout.

## 9. Eksikler ve sonraki admin fazı

- Onaylar: payment-ledger ucu (§4), push altyapısı (§6), guardian bildirim
  politikası (§6), yasal URL'ler + deletion endpoint'i (önceki checklist).
- Admin mobil: bu turda değişiklik yok; plan geçerli (P0 yoklama/kişiler/
  erişim, P1 tahsilat/duyuru/onay, P2 rapor/ayarlar).
