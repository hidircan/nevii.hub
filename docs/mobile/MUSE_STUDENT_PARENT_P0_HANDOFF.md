# Muse Student/Parent P0 Handoff

Tarih: 2026-09-13 · Branch: `feature/mobile-student-parent-p0` · Base: `origin/test`
Sahip: Muse (öğrenci/veli portal UI/UX). Commit/push YOK.

## 1. Tamamlanan öğrenci ekranları

Mevcut `student-scope` ekranları incelendi, sağlam bulundu, dokunulmadı:
Ana Sayfa (`/(student)/anasayfa`), Program + Ders Detayı (`/dersler`,
`/dersler/[lessonId]`), Ödevler + Ödev Detayı (`/odevler`,
`/odevler/[homeworkId]`, öğrenci teslim akışı mevcut API ile),
Ödemeler + Ödeme Detayı (`/odemeler`, `/odemeler/[paymentId]` — read-only
+ makbuz), Gelişim + Materyaller (`/gelisim`, değerlendirme, materyal
indirme), Hesabım + Şifre Değiştir (`/hesabim`, canonical auth akışı).
Bildirim merkezi kök `/notifications` (sayfalı, okundu-işaretleme,
empty/error) üç rolde ortak — dokunulmadı.

Bu turda öğrenci tarafına YENİ eklenenler:

- `src/components/mobile-ui/api-error-message.ts` — backend
  ServiceErrorCode + mobil NETWORK_ERROR/UNEXPECTED_RESPONSE →
  kullanıcı dostu Türkçe metinler (bağlantı/oturum/yetki/kayıt/
  hız-limiti/yüklenemedi) + `isAccessScopeError` (FORBIDDEN/NOT_FOUND
  retry'siz nötr ton). Mevcut `ui/states.tsx` ErrorState `code`
  deseniyle uyumlu.
- `src/features/student/__tests__/student-scope-guard.test.ts` —
  `(student)` route'larında finans akışı yok, `students/` URL'leri
  yalnız auth `studentId`'den, öğretmen operasyonu çağrısı yok.

## 2. Tamamlanan veli ekranları

- `app/(parent)/yoklama.tsx` — placeholder'dan gerçek ekrana:
  `src/features/parent/attendance-screen.tsx` (read-only
  `attendance-summary`: katılım oranı + Katıldı/Gelmedi/İzinli/Telafi/
  Bekleyen + suçlayıcı-olmayan açıklama; loading/empty/error/retry,
  pull-to-refresh, focus-refetch).
- `app/(parent)/cocugum.tsx` — eski `ListScreen`'den yeni UI'ya:
  `src/features/parent/child-screen.tsx` (StudentProfile'dan aktif
  öğrenci bağlam kartı — ad, branş, öğretmen, paket; telefon numaraları
  GÖSTERİLMEZ + Dersler/Ödevler/Ödemeler/Gelişim/Yoklama hızlı erişim).
  Çoklu-çocuk seçici YOK (backend desteği yok — bkz. BLOCKERS B1).
- Veli Ana Sayfa/Program/Ödev/Ödeme/Gelişim/Hesabım mevcut
  `student-scope` paylaşımıyla çalışıyor; veli ödev teslimi
  öğrenciye özel (`user?.role === "STUDENT"` kilidi mevcut kodda).
- `src/features/parent/__tests__/parent-scope-guard.test.ts` —
  yasak hedefe yazma yok (iletişim-tercihi gibi kullanıcı tercihleri
  meşru), ID tahmini yok, telefon yok, sahte selector yok.

## 3. Kullanılan mevcut endpoint/contract'lar

`GET /api/v1/students/[studentId]` (profil),
`/schedule` (program), `/homework` (+`POST /api/v1/homework/[id]/submit`
öğrenci), `/balance` + `/api/v1/payments/[id]/receipt` (read-only),
`/attendance-summary`, `/assessments/[studentId]`, `/curriculum`,
`/teaching-materials` (+dosya indirme), `/api/v1/notifications`
(+okundu POST), `/api/v1/absence-notices` (öğrenci), `/api/v1/makeup`
(liste), `PATCH .../communication-preference` (mevcut veli ekranı).
Mock/fake veri HİÇBİR yerde kullanılmadı.

## 4. Claude'un çözmesi gerekenler

`MUSE_STUDENT_PARENT_BLOCKERS.md` B1–B5: çoklu-çocuk endpoint'i,
ödeme UI contract'ı (post-P0), yol-notasyonu onayı, Ana Sayfa
`refreshAll`, yedek bildirim route temizliği.

## 5. Bilinen P1/P2/post-launch eksikler

P1: Ana Sayfa refresh kapsamı (B4); 401 sonrası login akışı E2E
doğrulaması (client+guard mevcut, cihazda denenmedi); küçük ekran
(iPhone SE) + Android orta ekran elle kontrolü. P2: çoklu-çocuk
seçici (backend'e bağlı); offline kalıcı önbellek (şu an anlık
error/retry var). Post-launch: ödeme UI (backend contract'ıyla).

## 6. UAT test listesi (ekran bazlı)

Ana Sayfa: skeleton → özet kartlar → pull-to-refresh; uçak modunda
"İnternet bağlantısı kurulamadı"; yetkisiz öğrencide "erişim yok".
Program: hafta gezinme, boş hafta empty state, ders detay geçişi.
Ödevler: filtreler, detay, öğrenci teslim / veli salt-görünüm.
Ödemeler: bakiye kartı, detay, makbuz; ödeme BAŞLATMA BUTONU YOK.
Yoklama (veli): oran + detay kartları, sıfır ders empty state.
Çocuğum (veli): bağlam kartı, hızlı erişim, hesapta kayıt yoksa empty.
Hesabım: tema, çıkış onayı, şifre değiştirme akışı.
Bildirimler: boş liste, sayfalama, okundu-işaretleme, hata-retry.

## 7. Merge/entegrasyon dosya sahipliği

## 8. Bu turun hardening/test/UAT paketi (2026-09-13, 2. tur)

- `src/features/parent/attendance-screen.tsx` — `attendance-summary.ts`
  view-model (`toSafeCount/toAttendanceRate/toAttendanceView`,
  null/NaN/negatif/sıfır-toplam güvenli; fake kart yok), a11y oranı
  etiketi, iPhone SE `minWidth:0` kart satırları, adsız profilde yanlış
  isim yok.
- `src/features/parent/child-screen.tsx` — `child-context.ts`
  view-model (`toChildContextView`, adsız profilde empty state;
  PII bu katmandan geçmez) + `PARENT_QUICK_LINKS` canonical liste
  (testle route-varlığı kilitli), yenile butonunda 48pt hedef + label.
- `src/components/mobile-ui/api-error-message.ts` — bilinmeyen kodda ham
  backend mesajı ASLA gösterilmez; `containsSensitiveText` filtresi
  (stack/token/password/DATABASE_URL/prisma/supabase).
- Yeni testler: `attendance-view`, `child-context-view` (quick-link
  route kilidi dahil), `guardian-homework-lock` (legacy STUDENT-kapısı
  davranış kilidi — follow-up'ta güncellenecek), parent guard'a
  teacher/admin-operasyon kilidi eklendi. Vitest 18/18 dosya, 126/126 test.
- Yeni dokümanlar: `MOBILE_DEVICE_UAT_RUNBOOK.md`,
  `MUSE_STUDENT_PARENT_REGRESSION_MATRIX.md`.

## 9. Claude Sonrası Follow-Up

1. Claude'un `feature/mobile-p0` local commit SHA'sı bekleniyor
   (bu turda cherry-pick YAPILMADI; SHA gelmedi).
2. Claude commit'i yalnız o SHA ile cherry-pick edilecek
   (`git cherry-pick <SHA>`; conflict çıkarsa shared/auth çekirdeği
   Claude'un — Muse yalnız kendi dosyalarını çözer, Claude'a sorar).
3. Cherry-pick sonrası shared canonical contract kullanılacak:
   `personaOf(user)`, `user.portalAccessType`, STUDENT + SELF,
   STUDENT + GUARDIAN, PersonaGuard, ErrorState.
4. Sonraki focused fix: `src/features/student-scope/homework-screen.tsx`
   dosyasındaki legacy `user.role === "PARENT"` kontrolü kaldırılacak;
   guardian için submit/upload/student mutation CTA'ları gizlenecek;
   STUDENT SELF behavior korunacak. Bu fix
   `guardian-homework-lock.test.ts` kilidinin güncellenmesini gerektirir
   (legacy assertion'lar yeni contract'a taşınacak).
5. Claude'un makeup, absence-notices ve receipt route kararlarına göre
   UI bağlanacak veya safe unavailable fallback uygulanacak
   (şu an: makeup listesi home'da salt-görünüm, absence-notice öğrencide
   mevcut akış, receipt ödeme detayında mevcut).
6. Bu turda shared auth/api/types/student-scope dosyalarına DOKUNULMADI
   (homework-screen'e test-yazma dışında referans bile yazma yok;
   `guardian-homework-lock.test.ts` yalnız read-only davranış kilididir).

Muse yazdı (merge'te korunmalı): `app/(parent)/yoklama.tsx`,
`app/(parent)/cocugum.tsx`, `src/features/parent/**`,
`src/features/student/**`, `src/components/mobile-ui/**`,
`docs/mobile/MUSE_*`, `docs/mobile/MOBILE_DEVICE_UAT_RUNBOOK.md`. Muse DOKUNMADI (Claude serbest):
`src/auth/**`, `src/api/**`, `src/types/**`, `src/lib/**`,
`src/hooks/**`, `src/theme/**`, `src/components/ui/**`,
`src/components/{list-screen,persona-guard,placeholder-screen,
screen-states}.tsx`, `src/features/{student-scope,account,
notifications}/**`, `app/(teacher)/**`, `app/(student)/_layout.tsx`,
`app/(parent)/_layout.tsx`, kök `/notifications.tsx`, config/imza
dosyaları. Çakışma beklenmiyor (ayrı dosyalar).
