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

## Güncel snapshot — 2026-09-27 (8. tur)
- **Dal:** `feat/uat-round-8` (worktree `../nevii-hub-uat-round8`) → `test`. **Migration VAR (additive):**
  `20260927090000_room_soft_delete` (Room.deletedAt) — test DB'ye owner onayıyla uygulanmalı. 7. tur migration'ı
  (`20260926090000_trial_result_notes`) uygulandı (owner teyidi). Ayrıntı + UAT: `docs/testing/UAT_2026_09_27_ROUND_8.md`.
- Kurum adı test DB'de **"Nilüfer Acar Müzik Akademi"** (Tenant+School, 2026-09-27 bu oturumda). Kodda sabit ad yok
  (yalnız demo seed). Geçmiş 105 imzasız sözleşme yeniden üretilmedi — hukuki karar owner'da.
- Öğretmen şubeleri: birincil `branchId` + ek `branchIds` (JSON); tek kural `teacherServesBranch` — oda seçimi ve
  "Uygun saatleri bul" da artık buna uyuyor (önceden yalnız birincil şube odaları).
- Ders pop-up müsaitlik kartı: `teacher-day-availability.ts` + `teacherDayAvailabilityTool` (tarih+şube başına tek istek, istemci önbelleği).
- Sözleşmesiz öğrencinin takvim planı: `resolveContractPlanForMonth` → `student_plan` (tutar yalnız gerçek satırlardan; uydurma yok).
- Performans: `validateLessonSlot` ders indeksi + `Intl.DateTimeFormat` önbelleği → telafi önerisi 41 sn → ~150 ms (6000 ders).
- Denetim kaydı: Türkçe kategori/ekran/özne sunumda eşlenir (şema değişmedi).

## Ortamlar
- Test: `test` dalı → Vercel → `test.neviihub.com`; test DB Supabase `vxzewyiwfshobjizzetw` (repo migration'ları uygulandı,
  son kontrol 2026-09-21; 22–23.09 additive migration'ları için `docs/operations/RUNBOOK_2026_09_22_CSV_CONTRACT_DELETE.md`).
- Production: dokunulmaz (owner kararı). Yerel `.env` production'ı gösterebilir — DB komutundan önce hedefi kanıtla.
- Vercel Cron: günlük 00:30 UTC retention (`vercel.json`, `CRON_SECRET`).

## Açık iş
- Owner UAT: 8. tur (`UAT_2026_09_27_ROUND_8.md`); önceki turlar 4–7 belgeleri.
- Owner kararları: Pınar Çelik/Olcay Özdemir'e Evka 3 (yapılmadı, test DB'de yalnız Erzene); ayrı test kurumu; geçmiş sözleşmeler
  (hukuki); `room_soft_delete` migration onayı; denetim kaydına IP/cihaz yazımı (ayrı tur).
- Mobil: devralma onayı için yeni EAS build (ayrı tur; `apps/mobile/*` bu turda dokunulmadı).
- Test verisinde, düzeltmeden önce takvimden alınmış tahsilatlar sözleşme taksiti yerine `monthly_plan` satırına yazılmış
  olabilir (taksit hâlâ ödenmemiş görünür). Otomatik düzeltme YAPILMADI — owner kararıyla salt-okunur tespit + elle eşleme.
- Test DB salt-okunur sorgu 8. turda Supabase MCP ile çalıştı (proje `vxzewyiwfshobjizzetw`); yazma yalnız owner talimatıyla.
- Uzun vadeli açıklar (PDF sayfa altbilgisi, toplu tarihsel sözleşme importu, aynı-gün iptal bildirimi): arşivdeki "Open work".

## Riskler / bilinen durum
- Bilinen başarısızlıklar: 8. turda `lesson-reassignment` kök nedeni (tarihe bağlı seed) düzeltildi; `skipConflicts` geçiyor;
  `change-password-route` geçiyor. Tam paket 2026-09-27: 343 dosya / 3634 test, 0 başarısız.
- `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş; güncel durum burası.
