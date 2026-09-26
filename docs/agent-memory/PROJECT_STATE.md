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

## Güncel snapshot — 2026-09-26 (7. tur)
- **Dal:** `feat/trial-dashboard-widgets` (worktree `../nevii-hub-trial-dashboard`) → `test`. **Migration VAR (additive):**
  `20260926090000_trial_result_notes` (TrialLesson.resultNotes/At/ByUserId) — test DB'ye owner onayıyla uygulanmalı.
- Günlük Özet: "Deneme dersleri" bölümü (`dashboard/trial-digest.ts`); "Widget ekle" = menü ekranı widget'ları
  (`dashboard/screen-widgets.ts`, kaynak `panel-nav.ts`, yetki sidebar ile aynı, `addedWidgets` kullanıcı tercihinde, opt-in).
- Deneme: hazırlık notu (`notes`) ≠ sonuç notu (`resultNotes`); `updateTrialLessonTool` + `PATCH /api/v1/trials/[id]`;
  gerçekleşmiş/iptal/dönüşmüş denemede plan+hazırlık kilitli; plan değişince `validateTrialSlot`. Liste: `trial-list-filter.ts`.
- Öğretmen seçici kök neden: UI yalnız birincil şubeye bakıyordu (sunucu `teacherServesBranch` kullanıyor) → atanmış öğretmen
  sessizce düşüyordu. Tek kural `lesson-teacher-options.ts`. Test DB: Gülce→Pınar (yalnız Erzene), Mine→**Olcay Özdemir** (yalnız Erzene).
- Kurum adı test DB'de "Nilüfer Acar Müzik Akademisi" (Tenant+School); kodda sabit değil. Değişiklik owner kararı bekliyor.
- UAT: `docs/testing/UAT_2026_09_26_TRIAL_DASHBOARD_ROUND_7.md`.

## Ortamlar
- Test: `test` dalı → Vercel → `test.neviihub.com`; test DB Supabase `vxzewyiwfshobjizzetw` (repo migration'ları uygulandı,
  son kontrol 2026-09-21; 22–23.09 additive migration'ları için `docs/operations/RUNBOOK_2026_09_22_CSV_CONTRACT_DELETE.md`).
- Production: dokunulmaz (owner kararı). Yerel `.env` production'ı gösterebilir — DB komutundan önce hedefi kanıtla.
- Vercel Cron: günlük 00:30 UTC retention (`vercel.json`, `CRON_SECRET`).

## Açık iş
- Owner UAT: 5. tur (yukarıdaki belge) + 4. tur `docs/testing/UAT_2026_09_23_OPS_ROUND_4.md`.
- Mobil: devralma onayı için yeni EAS build (ayrı tur; `apps/mobile/*` bu turda dokunulmadı).
- Test verisinde, düzeltmeden önce takvimden alınmış tahsilatlar sözleşme taksiti yerine `monthly_plan` satırına yazılmış
  olabilir (taksit hâlâ ödenmemiş görünür). Otomatik düzeltme YAPILMADI — owner kararıyla salt-okunur tespit + elle eşleme.
- Test DB'ye salt-okunur erişim bu oturumda izin sistemiyle engellendi; gerçek öğrenci vakası UAT ile doğrulanmalı.
- Uzun vadeli açıklar (PDF sayfa altbilgisi, toplu tarihsel sözleşme importu, aynı-gün iptal bildirimi): arşivdeki "Open work".

## Riskler / bilinen durum
- Bilinen başarısızlıklar (2026-09-26, origin/test 71fa5b9'da da var): `lesson-series-tools › skipConflicts`,
  `lesson-reassignment › kutucuk işaretliyse…`, `change-password-route › yanlış mevcut şifre` (>15 dk asılı kalıyor).
- `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş; güncel durum burası.
