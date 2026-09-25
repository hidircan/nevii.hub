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

## Güncel snapshot — 2026-09-25 (6. tur)
- **Dal:** `fix/uat-round-6` (worktree `../nevii-hub-uat-round6`) → `test`. Önceki: `8f85a4b` (5. tur). **Migration yok.**
- **Kök neden (ödeme/yoklama):** db `readData()` ödeme eşlemesinde `contractId`/`installmentSequence` yoktu → takvim her ay
  "plan yok", takvim tahsilatı ayrı `monthly_plan` açıyordu. Düzeltildi (`mapDbPayment` + parity testi); sözleşme varken
  `monthly_plan` yedeği kapalı.
- **Borç kuralı tek:** `isLiveObligation` (payment-profile.ts) + `listTerminalContractIds` — gecikmiş, Günlük Özet, tahsilat
  kuyruğu, otomatik hatırlatma, Ödemeler/Öğrenciler listesi, öğrenci "Borç" bölümü aynı kuralı kullanır.
- Öğrenci Ödemeler sekmesi "Borç" görünümü; Değişiklik geçmişi varsayılan kapalı; Yoklama seçicisi yalnız aktif öğrenci;
  Evraklar Merkezi sayfalama + aktif/pasif + kişi/tür/durum/şube/tarih/sıralama.
- UAT: `docs/testing/UAT_2026_09_25_ROUND_6.md`. 5. tur: `docs/testing/UAT_2026_09_24_ROUND_5.md`.

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
- Tarihe bağlı bilinen başarısızlıklar (2026-09-25, origin/test 8f85a4b): `lesson-series-tools › skipConflicts`, `lesson-move-resize-flow › başarılı taşıma`.
- `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş; güncel durum burası.
