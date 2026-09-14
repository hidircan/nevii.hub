# Mobil P0 — API Route Kararları

- Tarih: 2026-09-13 · Branch `feature/mobile-p0` (base `origin/test` @ `4c1b599`).
- Kural: kapsam YALNIZ oturumdan (JWT → `ServiceContext`) çözülür; hiçbir mobil uç tenantId / teacherId /
  studentId / branchId parametresi almaz. Tüm yeni uçlar salt-okunur (yalnız `GET` export). Sahte veri yok.
- Fail-closed roller (mobil persona'sı yok): HYPER_ADMIN, BRANCH_MANAGER (unified preset'te efektif SCHOOL_ADMIN
  olsa bile — `ctx.loginRole` kontrolü), AI_AGENT.

| Route | Mobile caller | Somut yapılan değişiklik | Server-side scope | Test | P0 sonucu |
|---|---|---|---|---|---|
| `GET /api/v1/mobile/session` | `src/auth/auth-context.tsx` (AuthProvider) | **Yeni route** `src/app/api/v1/mobile/session/route.ts` | Kimlik/tenant JWT'den; `loginRole` + efektif rol; `portalAccessType` = `getActiveAccessType(tenant, user, student)` (yalnız STUDENT). BRANCH_MANAGER'a açık (mobil "desteklenmiyor" gösterebilsin diye), veri döndürmez | root `mobile-session-route.test.ts` (TEACHER, BM unified, HYPER_ADMIN, STUDENT SELF/GUARDIAN, 401, mobil logout) | ✅ Tamam |
| `GET /api/v1/makeup` | `app/(teacher)/telafi.tsx` (yeni), student-scope `home-screen.tsx`, admin `islemler/index.tsx`, `islemler/telafi.tsx` | **Yeni route** `src/app/api/v1/makeup/route.ts` → `listMakeupRequestsTool` (`src/lib/services/mobile-read.ts`) | TEACHER: `m.teacherId === ctx.teacherId` (teacherId yoksa 403) · STUDENT (SELF/GUARDIAN): yalnız `canAccessStudent` (aktif StudentPortalAccess) geçen öğrenciler · SCHOOL_ADMIN/SUPER_ADMIN: `readData()` tenant'ı · diğerleri 403. Yanıt: domain alanları + ad/ders tarihi zenginleştirmesi; iç alanlar (`decidedBy`, `decisionNote`, `attendanceId`) dönmez | root `mobile-read-tools.test.ts` (öğretmen kendi/başkası, SELF, GUARDIAN, erişimsiz STUDENT, admin, HYPER/AI/BM/BM-unified 403, iç alan sızıntısı), `mobile-read-routes.test.ts` (401, öğretmen yalnız t1, X-Tenant-Id spoof 401, BM/HYPER 403, yalnız GET) · mobil `makeup-view.test.ts` | ✅ Tamam (öğretmen telafi ekranı eklendi) |
| `GET /api/v1/absence-notices` (+ `POST`, `DELETE /:id`) | student-scope `lessons-screen.tsx` (`AbsenceNoticeSection`) | **Seçenek B — stale çağrı kaldırıldı.** Bölüm, `AbsenceNotice*` tipleri ve kullanılmayan import'lar silindi; `FEATURE_UNAVAILABLE` (`src/api/errors.ts`) kanonik "kullanılamıyor" durumu Muse için tanımlandı | — (route yok) | mobil `api-contract.test.ts` ("absence-notices mobilde çağrılmıyor" + tüm mobil yollar backend'de var) | ✅ Kapatıldı (özellik P1: domain tasarımı gerekli) |
| `GET /api/v1/payments/:paymentId/receipt` | student-scope `payments-screen.tsx` (ödeme detayı) | **Seçenek A — yeni route** `src/app/api/v1/payments/[paymentId]/receipt/route.ts` → `getPaymentReceiptTool` | Web `/makbuz/[paymentId]` ile aynı kaynak (`src/lib/receipt.ts`): ödeme `readData()` tenant'ında aranır (yoksa 404); STUDENT için `assertStudentAccess` (başka öğrencinin ödemesi 403); yalnız `status === "paid"` makbuz → aksi halde `{eligible:false, ineligibleReason}`; TEACHER/HYPER/AI/BM 403 | root `mobile-read-tools.test.ts` (SELF kendi, GUARDIAN bağlı/ilişkisiz, paymentId-only 403, ödenmemiş → eligible:false, 404, TEACHER/HYPER/AI/BM 403), `mobile-read-routes.test.ts` (401, öğretmen 403, 404, yalnız GET) | ✅ Tamam |

## Gerekçeler

- **Makeup:** `MakeupRequest` gerçek domain kaydı (`src/lib/types.ts`), web `/panel/telafi` ve `/ogrenci` bunu doğrudan
  okuyor; eksik olan yalnız mobil REST sarmalayıcısı ve kapsam kuralıydı. Mutasyonlar (`/makeup/create|confirm|cancel`)
  mevcut ve değiştirilmedi.
- **Absence notices:** `src/lib` ve `src/app` içinde "absence notice" domain'i, modeli, store'u veya politikası
  (`minNoticeDays`, `maxNoticesPerPeriod`) YOK — `git log --all` bu yolda hiç route kaydı bulmadı. 200 + boş dizi ile
  taklit veya uydurma "izin bildirimi" semantiği yasak olduğundan UI çağrısı kaldırıldı. Gerçek özellik için domain
  kararı (izin hakkı/telafi hakkı ilişkisi, onay akışı) owner'dan gelmeli → P1.
- **Receipt:** gerçek, test edilmiş makbuz modeli (`buildReceiptViewModel`) ve sahiplik kuralı web'de mevcut; mobil
  yanıt tipi (`PaymentReceiptResponse`) bu modelle birebir uyumlu. Yeni PDF/URL/ödeme işlemi YOK.

## Kalan bilinen eksik yollar (yalnız yönetici mobil — post-launch)

`dashboard/summary`, `branches`, `rooms`, `instruments`, `lessons`, `lessons/:id/reassign`, `homework/report`,
`students/:id/documents`, `students/:id/social-media-consent`, `teachers/payouts/:id/mark-paid` —
`apps/mobile/src/api/__tests__/api-contract.test.ts` `KNOWN_MISSING`. Öğretmen/öğrenci/veli yollarının tamamı backend'de mevcut.
