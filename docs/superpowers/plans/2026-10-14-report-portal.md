# Rapor Portalı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Öğretmenler `/gelisim`'den telefonla gelişim raporu doldurur; öğrenciler portal veya kişiye özel linkle öğretmen değerlendirmesi yapar; yöneticiler `/panel/raporlar`'dan takip eder ve her gönderimde bildirim alır.

**Architecture:** Aynı Next 16 uygulamasında panel kabuğu olmayan mobil sayfalar; mevcut tool katmanı (`services/tools.ts`) ve mevcut modeller (`LessonAssessment`, `PeriodicAssessment`, `TeacherFeedback`) yeniden kullanılır; tek yeni model `FeedbackInvite`. Okumalar dar dilimle (`readStudentScope`, `readLessonWindow`, tek satır okuyucular); tam `readData()` yok.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 (PostgreSQL) + json/memory store parity, zod, vitest (`STORE_MODE=json`).

**Spec:** `docs/superpowers/specs/2026-10-14-report-portal-design.md`

## Global Constraints

- Yeni/değişen sayfa ve tool'larda `readData()` / `readScopedData()` YOK (kota; skill `performance-db-egress`).
- Tenant yalnız oturumdan veya davet satırından; TEACHER yalnız `isOwnStudent` öğrencisi ve kendi dersi.
- Tool'lar `ServiceResult` döner (`ok`/`fail`), beklenen hatada throw yok; tüm kullanıcı hataları Türkçe, nedenli, çözüm yollu.
- Davet: 32 bayt `crypto.randomBytes` → base64url kod; DB'de `sha256` hex; geçerlilik 14 gün; hız sınırı `consumeRateLimit("feedback-invite", ip+":"+kodHash, { windowMs: 600_000, max: 10 })`.
- Polling yok; `next/link` yok (`@/components/link`); mobil `max-w-md`, dokunma hedefi ≥ 44 px.
- Migration yalnız ekleme; canlıya owner onayıyla, koddan önce.
- Commit trailer'ları: `Co-authored-by` + `Signed-off-by: hidircan <hidircan@users.noreply.github.com>`.

## Review Focus

- Çoklu branşlı öğrenci: ikinci branş öğretmeni rapor yazınca kayıt O öğretmene atfedilmeli (Task 2 testi).
- Aynı davet linkiyle aynı öğretmene iki hızlı gönderim: ikincisi reddedilmeli (Task 4 testi).
- Başka kurumun davet kodu / iptal edilmiş / süresi dolmuş kod: Türkçe nedenli hata, veri sızmamalı (Task 4 testi).
- Öğretmen başka öğretmenin öğrencisinin `/gelisim/[studentId]` sayfasını açarsa: "size atanmamış" ekranı, form yok (Task 5 testi).
- Formda ağ kesilirse: taslak kaybolmamalı, hata Türkçe gösterilmeli (Task 5 UAT adımı).

---

### Task 1: Öğretmen değerlendirmesi — uygun öğretmen kuralı + `teacherId` düzeltmesi

**Files:**
- Create: `src/lib/teacher-feedback-eligibility.ts`
- Modify: `src/lib/validation.ts` (`submitTeacherFeedbackSchema`), `src/lib/services/tools.ts` (`submitTeacherFeedbackTool`), `src/app/ogrenci/degerlendirme/page.tsx`
- Test: `src/lib/__tests__/report-portal-feedback.test.ts`

**Interfaces:**
- Produces: `eligibleFeedbackTeacherIds(student: Pick<Student,"teacherId"|"enrollments">, lessons: Pick<Lesson,"studentId"|"teacherId"|"startAt">[], nowMs: number, windowDays = 90): string[]` (aktif branş öğretmenleri ∪ pencere içi ders öğretmenleri, sıralı, tekil). `submitTeacherFeedbackSchema.teacherId?: string`.

- [ ] Test yaz: `eligibleFeedbackTeacherIds` — atanmış + ikinci branş + 90 gün içi ders öğretmeni döner; 91 gün önceki ders öğretmeni dönmez. `submitTeacherFeedbackTool` `teacherId: "t2"` (uygun) → kayıt `teacherId === "t2"`; uygun olmayan `teacherId` → `fail("FORBIDDEN")`; `teacherId` yoksa `student.teacherId` (eski davranış).
- [ ] Çalıştır, kırmızı gör: `npx vitest run src/lib/__tests__/report-portal-feedback.test.ts`
- [ ] Uygula: saf fonksiyon; tool `readStudentScope(studentId)` ile dersleri alır, `teacherId` varsa kümede doğrular; sayfa aynı fonksiyonu kullanır.
- [ ] Yeşil gör, commit: `fix(geri-bildirim): coklu ogretmende degerlendirme dogru ogretmene yazilir`

### Task 2: Rapor kaydetme araçları — dar okuma, doğru öğretmen, yönetici bildirimi

**Files:**
- Modify: `src/lib/services/tools.ts` (`createAssessmentTool`, `createPeriodicAssessmentTool`), `src/lib/notification-categories.ts`, `src/lib/notification-href.ts`
- Test: `src/lib/__tests__/report-portal-assessments.test.ts`

**Interfaces:**
- Produces: kategoriler `"lesson_assessment_submitted"`, `"periodic_assessment_submitted"` (group `"students"`, roles `["SCHOOL_ADMIN","SUPER_ADMIN"]`, `defaultInAppEnabled: true`); href `"/panel/raporlar?sekme=gelisim"` / `"?sekme=donemsel"`; `teacher_feedback_submitted` href'i değişmez.

- [ ] Test yaz: ikinci branş öğretmeni (ders `teacherId: "t2"`) değerlendirme oluşturunca kayıt `teacherId === "t2"`; TEACHER başka öğretmenin dersine → `FORBIDDEN`; her iki tool başarıda `notifyAdmins` bir kez, `dedupeKey` = kayıt id (`vi.spyOn` manager-notifications); kaynak kilidi: iki tool gövdesinde `readData()` yok.
- [ ] Kırmızı gör.
- [ ] Uygula: `createAssessmentTool` → `readStudentById` + `readLessonById`, `teacherId: lesson.teacherId`; `createPeriodicAssessmentTool` → `readStudentScope`, TEACHER için `teacherId: ctx.teacherId`, admin için `student.teacherId`; bildirim try/catch (mevcut `submitTeacherFeedbackTool` deseni).
- [ ] Yeşil gör, commit: `feat(raporlar): gelisim kayitlari dar okur, dogru ogretmene yazar, yoneticiye bildirir`

### Task 3: Ortak mobil form bileşenleri + öğretmen portalı "Gelişim" alanı

**Files:**
- Create: `src/components/reports/score-segment.tsx`, `src/components/reports/lesson-assessment-mobile-form.tsx`, `src/components/reports/periodic-assessment-mobile-form.tsx`, `src/components/reports/use-form-draft.ts`
- Modify: `src/app/ogretmen/ogrenciler/[studentId]/page.tsx` (#gelisim), `src/app/ogretmen/degerlendirme/[studentId]/page.tsx`, `src/app/ogretmen/donemsel-degerlendirme/page.tsx`; eski `src/components/lesson-assessment-form.tsx` kullanan kalmazsa sil
- Test: `src/lib/__tests__/report-portal-forms.test.ts` (kaynak sözleşmesi)

**Interfaces:**
- Produces: `<LessonAssessmentMobileForm studentId lessons={{id,startAt,label}[]} defaultLessonId? onDone? />`, `<PeriodicAssessmentMobileForm studentId period={{periodStart,periodEnd}} onDone? />`, `useFormDraft<T>(key: string, initial: T): [T, (v: T) => void, () => void]` (localStorage, try/catch). Kriter listesi/etiketleri mevcut `lesson-assessment-form.tsx`'ten taşınır (tek kaynak).
- POST: `/api/v1/assessments`, `/api/v1/periodic-assessments` (mevcut); 401'de bir kez `/api/v1/auth/refresh`; hata `friendlyApiErrorMessage`.

- [ ] Kaynak testi yaz: öğretmen sayfaları yeni bileşenleri import eder, eski formu etmez; bileşenler `max-w-md`/`min-h-11` içerir; `useFormDraft` gönderimde temizler.
- [ ] Kırmızı gör → uygula (segment düğmeler 1–5, zorunlu notlar, isteğe bağlı alanlar `<details>`), yeşil gör.
- [ ] Commit: `feat(raporlar): sade mobil gelisim formlari; ogretmen portali ayni bileseni kullanir`

### Task 4: `FeedbackInvite` — model, kütüphane, araçlar

**Files:**
- Modify: `prisma/schema.prisma`; Create: `prisma/migrations/20261014120000_feedback_invites/migration.sql`
- Create: `src/lib/feedback-invites.ts`; Modify: `src/lib/services/tools.ts` (+3 tool), `src/lib/agent/registry.ts` (yönetici tool'ları)
- Test: `src/lib/__tests__/report-portal-invites.test.ts`

**Interfaces:**
- Produces (lib, 3 mod paritesi; json dosyası `feedback-invites.json`):
  `createInvite(tenantId, studentId, createdBy): Promise<{ invite: FeedbackInviteRow; code: string }>` (aynı öğrencinin etkin davetini iptal eder),
  `resolveInvite(code): Promise<{ status: "ok"|"expired"|"revoked"|"completed"|"not_found"; invite?: FeedbackInviteRow }>`,
  `markInviteTeacherCompleted(inviteId, teacherId): Promise<boolean>` (koşullu; zaten varsa `false`),
  `revokeInvite(tenantId, inviteId): Promise<boolean>`,
  `countActiveInvites(tenantId): Promise<number>`.
- Tool'lar: `createFeedbackInviteTool(ctx,{studentId}) → {url, expiresAt}` ve `revokeFeedbackInviteTool(ctx,{inviteId})` (SCHOOL_ADMIN/SUPER_ADMIN, audit);
  `submitTeacherFeedbackViaInviteTool(code: string, input: {teacherId, scores, continueWithTeacher?, comment?}, ip: string)` → `runWithTenantAsync`, Task 1 kuralıyla uygunluk, `submitterRole "STUDENT_LINK"`, `submittedBy "invite:<id>"`, `notifyAdmins("teacher_feedback_submitted")`, tüm öğretmenler bitince `completed`.
- URL: `${APP_BASE_URL ?? "https://neviihub.com"}/degerlendir/${code}`.

- [ ] Test yaz: üret → çöz `ok`; ikinci üretim ilkini `revoked` yapar; 15. gün `expired`; aynı öğretmene ikinci gönderim `fail("CONFLICT")`; uygun olmayan öğretmen `FORBIDDEN`; tüm uygun öğretmenler bitince `completed`; DB/json'da düz kod yok (yalnız hash); hız sınırı 11. istekte `fail("RATE_LIMITED")`.
- [ ] Kırmızı gör → model + migration (`npx prisma migrate diff` ile üret, elle düzenleme yok) + lib + tool'lar → yeşil gör; `npx prisma validate`.
- [ ] Commit: `feat(degerlendirme): kisiye ozel 14 gunluk degerlendirme linki (FeedbackInvite)`

### Task 5: Öğretmen sitesi `/gelisim`

**Files:**
- Create: `src/app/gelisim/layout.tsx`, `src/app/gelisim/page.tsx`, `src/app/gelisim/[studentId]/page.tsx`, `src/components/reports/report-shell.tsx`
- Modify: `src/middleware.ts` (matcher `/gelisim`, `/gelisim/:path*`)
- Create (lib): `src/lib/reports/pending.ts` — `pendingLessonAssessments(lessons, assessedLessonIds: Set<string>, teacherId, nowMs): Lesson[]` (geçmiş 14 gün, iptal/statüsüz hariç, raporsuz)
- Modify: `src/lib/assessment/index.ts` — `listAssessedLessonIds(tenantId, teacherId: string | null, fromIso): Promise<Set<string>>` (null = tüm öğretmenler) (`select: { lessonId }`)
- Test: `src/lib/__tests__/report-portal-teacher-site.test.ts`

**Interfaces:**
- Consumes: Task 3 formları, `readLessonWindow`, `readStudentScope`, `isOwnStudent`, `computePendingPeriodicAssessmentPeriods`.

- [ ] Test yaz: `pendingLessonAssessments` (15 gün önceki ders yok, raporlu ders yok, başka öğretmen dersi yok, iptal yok); kaynak kilidi: `src/app/gelisim/**` `readData`/`readScopedData` içermez; `[studentId]` sayfası `isOwnStudent` false ise form render etmez (kaynak sözleşmesi); middleware matcher `/gelisim` içerir.
- [ ] Kırmızı gör → uygula (kurum adı başlıkta, logo `getInstitutionInfo` ile; admin oturumunda "yalnız görüntüleme" uyarısı) → yeşil gör.
- [ ] Commit: `feat(gelisim): ogretmenler icin mobil gelisim raporu sitesi (/gelisim)`

### Task 6: Öğrenci değerlendirme sayfaları `/degerlendir`, `/degerlendir/[kod]`

**Files:**
- Create: `src/app/degerlendir/page.tsx` (oturum → `/ogrenci/degerlendirme`, yoksa login), `src/app/degerlendir/[kod]/page.tsx`, `src/app/api/v1/feedback-invites/[code]/submit/route.ts`, `src/components/reports/invite-feedback-cards.tsx`
- Modify: `src/components/teacher-feedback-cards.tsx` (yeni sade kart görünümü + `teacherId` gönderir)
- Test: `src/lib/__tests__/report-portal-student-pages.test.ts`

**Interfaces:**
- Consumes: Task 4 `resolveInvite`, `submitTeacherFeedbackViaInviteTool`; Task 1 `eligibleFeedbackTeacherIds`.
- `[kod]` sayfası: `metadata.robots = { index: false }`; `status !== "ok"` → nedenli Türkçe ekran; yalnız öğrenci adı + öğretmen adları.

- [ ] Test yaz: route handler — geçersiz kod 404 Türkçe; geçerli gönderim 200 ve `TeacherFeedback.submitterRole === "STUDENT_LINK"`; kaynak: sayfa `noindex`, tam okuma yok.
- [ ] Kırmızı gör → uygula → yeşil gör.
- [ ] Commit: `feat(degerlendir): ogrenci degerlendirme kisa linki ve kisiye ozel link sayfasi`

### Task 7: Yönetici ekranı `/panel/raporlar` + bildirim href + menü

**Files:**
- Create: `src/app/panel/raporlar/page.tsx`, `src/components/reports/report-tables.tsx`, `src/components/reports/invite-link-button.tsx`
- Modify: `src/lib/nav/panel-nav.ts` (Ödev Raporu'ndan önce `{ href: "/panel/raporlar", label: "Raporlar", icon: ClipboardList, roles: ["SUPER_ADMIN","SCHOOL_ADMIN"] }`), `src/app/panel/ogrenciler/[studentId]/*` (link oluştur düğmesi, mevcut başlık eylemlerine)
- Modify (lib, sayfalı): `listAssessmentsPage`, `listPeriodicAssessmentsPage`, `listTeacherFeedbackPage` — imza `(tenantId, f: { teacherId?, studentId?, fromIso, toIso, page, pageSize }) => Promise<{ rows: T[]; total: number }>` (db: `where` + `skip/take` + `count`; json: filtre+dilim)
- Test: `src/lib/__tests__/report-portal-admin.test.ts`

**Interfaces:**
- URL parametreleri: `?sekme=gelisim|donemsel|degerlendirme&ogretmen=&ogrenci=&bas=&bit=&sayfa=`; varsayılan son 30 gün, `pageSize` 25.
- Üst kartlar: son 30 gün tür bazında sayı (sayfalı fonksiyonların `total`'ı), bekleyen ders gelişimi (Task 5 `pendingLessonAssessments` tüm öğretmenler için, `readLessonWindow(now−15g, now)` + `listAssessedLessonIds` öğretmensiz varyantı), etkin link sayısı (`countActiveInvites`). Paylaşım kutusu: `neviihub.com/gelisim` ve `neviihub.com/degerlendir` "Kopyala".
- Ad çözümü: `readReferenceData()` (panel standardı). Kurum: `getInstitutionContext` → birleşik görünümde yazma düğmeleri gizli + `<KurumScopeNote>`.

- [ ] Test yaz: sayfalı lib fonksiyonları filtre/sayfa/total doğru (json); TEACHER rolü sayfaya erişemez (tool RBAC); kaynak kilidi: tam okuma yok.
- [ ] Kırmızı gör → uygula → yeşil gör.
- [ ] Commit: `feat(raporlar): yonetici rapor takip ekrani, link paylasimi ve menu`

### Task 8: Kapı, doküman, teslim

**Files:**
- Modify: `docs/agent-memory/PROJECT_STATE.md`; Create: `docs/testing/UAT_2026_10_14_REPORT_PORTAL.md`

- [ ] Kapı: `npm run typecheck` → `npm run lint` → `npm test` (başarısızlar taban `origin/main`'deki 15 test ile karşılaştırılır) → `npx prisma validate` → `npm run build`.
- [ ] UAT dokümanı: telefonla `/gelisim` (giriş, bekleyen, ders gelişimi, 4 haftalık, taslak geri yükleme), yönetici bildirimi, `/panel/raporlar` filtreleri, link üret/iptal/WhatsApp, `/degerlendir/<kod>` (süre/tamamlandı), çoklu branş öğrencisi.
- [ ] Commit + push + PR; migration'ın koddan önce canlıya uygulanması için owner onayı istenir.
