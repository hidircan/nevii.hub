# FINANCE_CONTRACTS.md — pointer

En zengin doküman kümesi zaten `../contracts/` altında (25+ rapor) — burası
onu indeksler, kopyalamaz.

## Okuma sırası
1. `docs/agent-memory/PROJECT_STATE.md` — "Owner-approved policy decisions"
   (telafi/ödeme/KDV — FINAL, yeniden tartışılmaz).
2. `../contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md` — sözleşme metni ↔
   uygulanan politika farkları (bilinçli, hukuk onayı olmadan "düzeltme").
3. `../roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md` — açık P1
   kalemler.
4. Göreve özel: `../contracts/` altında konuya uyan rapor (dosya adları
   kendini anlatıyor — CONTRACT_PRINT_DESIGN, HYDRATION_DATE_HOTFIX,
   DOCX_WORKFLOW, HISTORICAL_CONTRACT_IMPORT vb.)

## Değişmez kurallar — DOĞRULANDI (LESSONS_LEARNED.md #2-6)
- Telafi: eğitim yılı başına 2 hak (dönem değil), orijinal ders tarihinden 30
  gün. Aynı-gün iptal ASLA `markedAt` gibi bir heuristic'ten türetilmez —
  ayrı, açık kayıtlı bir iptal-bildirim olayı gerekir.
- Ödeme pencereleri merkezi: kart 1-5, havale/EFT/nakit 1-15 —
  `src/lib/contracts.ts` (`resolveContractPaymentDueRule`) VE
  `src/lib/payment-due-rule-client.ts` (client kopyası) senkron tutulmalı.
- KDV: tüm fiyatlar dahil, "+ KDV" asla gösterilmez.
- Şablon yaşam döngüsü: draft → activate, asla yerinde mutasyon. Bu kural iki
  AYRI sistemde var (kanonik sözleşme şablonları VE genel `DocumentTemplate`
  Evraklar sistemi) — biri düzeltilince diğerinin de korunduğu varsayılmaz,
  ayrı ayrı denetlenir (LESSONS_LEARNED.md 2026-08-30 girişi).

## İlgili skill
`finance-contracts`
