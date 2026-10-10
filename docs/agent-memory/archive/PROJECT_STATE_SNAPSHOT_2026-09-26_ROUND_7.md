# Arşiv — PROJECT_STATE snapshot (7. tur, 2026-09-26)

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

