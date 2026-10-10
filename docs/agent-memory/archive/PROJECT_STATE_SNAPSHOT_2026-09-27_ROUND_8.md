## Güncel snapshot — 2026-09-27 (8. tur)
- **Dal:** `feat/uat-round-8` (worktree `../nevii-hub-uat-round8`) → `test`. **Migration VAR (additive):**
  `20260927090000_room_soft_delete` (Room.deletedAt) — **test DB'ye uygulandı 2026-09-27** (owner onayı; önce uygulanmadan
  push edildiği için panel P2022 ile çöktü — bkz. LESSONS_LEARNED). `test` build'inde bekleyen migration kapısı var. 7. tur migration'ı
  (`20260926090000_trial_result_notes`) uygulandı (owner teyidi). Ayrıntı + UAT: `docs/testing/UAT_2026_09_27_ROUND_8.md`.
- Kurum adı test DB'de **"Nilüfer Acar Müzik Akademi"** (Tenant+School, 2026-09-27 bu oturumda). Kodda sabit ad yok
  (yalnız demo seed). Geçmiş 105 imzasız sözleşme yeniden üretilmedi — hukuki karar owner'da.
- Öğretmen şubeleri: birincil `branchId` + ek `branchIds` (JSON); tek kural `teacherServesBranch` — oda seçimi ve
  "Uygun saatleri bul" da artık buna uyuyor (önceden yalnız birincil şube odaları).
- Ders pop-up müsaitlik kartı: `teacher-day-availability.ts` + `teacherDayAvailabilityTool` (tarih+şube başına tek istek, istemci önbelleği).
- Sözleşmesiz öğrencinin takvim planı: `resolveContractPlanForMonth` → `student_plan` (tutar yalnız gerçek satırlardan; uydurma yok).
- Performans: `validateLessonSlot` ders indeksi + `Intl.DateTimeFormat` önbelleği → telafi önerisi 41 sn → ~150 ms (6000 ders).
- Denetim kaydı: Türkçe kategori/ekran/özne sunumda eşlenir (şema değişmedi).

