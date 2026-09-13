# Muse → Claude: Öğrenci/Veli P0 Blocker'ları

Tarih: 2026-09-13 · Branch: `feature/mobile-student-parent-p0` · Base: `origin/test`
Sahip: Muse (öğrenci/veli portal UI/UX). Commit/push yapılmadı.

Claude'un `docs/mobile/MOBILE_P0_HANDOFF.md` belgesi bu worktree'de
**bulunamadı** (docs/mobile/ dizini yoktu). Aşağıdaki public
contract'lar koddan okunarak kullanıldı (tümü read-only referans,
hiçbir ortak dosyaya yazılmadı):

- `apps/mobile/src/api/client.ts` — `apiGet/apiPost/apiPatch/apiDelete`,
  `{ok, data/error{code,message}}` zarfı, 401'de refresh-then-clear.
- `apps/mobile/src/types/api.ts` — StudentProfile, ScheduleResponse,
  HomeworkResponse, BalanceResponse, PaymentReceiptResponse,
  AttendanceSummary, AssessmentsResponse, CurriculumResponse,
  TeachingMaterialsResponse, NotificationsResponse, AbsenceNoticesResponse.
- `apps/mobile/src/auth/auth-context.tsx` — `useAuth().user.studentId`
  bağlamı, PersonaGuard (`student`/`parent`).
- Backend hata kelime dağarcığı: `src/lib/services/result.ts`
  ServiceErrorCode (VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND,
  CONFLICT, RATE_LIMITED, INTERNAL_ERROR).

## B1 — Çoklu-çocuk (ilişkili öğrenci listesi) endpoint'i yok

Durum: Velinin birden çok ilişkili öğrencisini listeleyen bir backend
endpoint'i bulunamadı (`src/app/api/v1/people` yalnız hassas-veri reveal;
`students` listesi `students:write` ister). Mobil bağlam tek
`ctx.studentId`'dir (StudentPortalAccess GUARDIAN/SELF).

Muse kararı: Sahte çocuk seçici YAPILMADI. `ParentChildScreen` aktif
öğrenci bağlamını gösterir. Çoklu-çocuk desteği backend'de açılana kadar
bu P1/P2'de kalır. Gerekli contract: velinin ilişkili öğrenci ID'lerini
döndüren salt-okunur bir endpoint (örn. `GET /api/v1/me/children`).

## B2 — Ödeme başlatma contract'ı yok (beklenen, P0 dışı)

P0 read-only kuralı gereği ödeme başlatma eklenmedi. `PaymentCheckoutResponse`
tipi mevcut ama öğrenci/veli ekranlarından çağrılmıyor (guard testiyle
kilitlendi). Ödeme UI'ı çıkarsa Claude'un canonical akışı beklenir.

## B3 — Dosya sahipliği / yol notasyonu farkı

Görev `apps/mobile/app/student/**` + `app/parent/**` yazıyor; gerçek yapı
grup notasyonludur: `apps/mobile/app/(student)/**` + `app/(parent)/**`.
Muse bu grup dizinlerindeki SADECE öğrenci/veli route dosyalarına yazdı.
`src/features/student-scope` (ortak öğrenci/veli mantığı) Claude'un
alanı sayıldı — okundu, dokunulmadı. Yeni kodlar:
`src/features/student/**`, `src/features/parent/**`,
`src/components/mobile-ui/**` (çakışmasız yeni isimler).

## B4 — Ana Sayfa refresh kapsamı (dokunulmadı, P1 önerisi)

`StudentScopeHomeScreen` pull-to-refresh'i yalnız `schedule.refresh`
çağırıyor (ödev/bakiye/bildirim tazelenmiyor). Dosya ortak alanda olduğu
için değiştirilmedi; Claude'un `refreshAll` ile genişletmesi önerilir.

## B5 — Yedek parent bildirim route'u (dokunulmadı)

`app/(parent)/bildirimler.tsx` eski yedek dosyadır; layout'ta `href:null`
ile gizli, gerçek merkez kök `/notifications`'tır. Dokunulmadı.
Temizlik Claude'la merge sırasında netleştirilmeli (silme YAPILMADI).
