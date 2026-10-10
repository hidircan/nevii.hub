---
name: finance-contracts
description: Paket, ücret, ödeme, tahsilat, makbuz, sözleşme, ödeme sağlayıcısı ve finansal yetki akışlarını ele alır.
---

## Ne zaman kullanılır
`src/lib/contracts.ts`, `src/lib/payment-*`, `src/lib/tahsilat/*`,
`src/lib/documents/*`, sözleşme şablonu, makbuz, `docs/contracts/*` konulu
her değişiklik.

## İlk okunacak minimum proje-beyni dokümanları
`docs/project-brain/FINANCE_CONTRACTS.md` → `docs/agent-memory/PROJECT_STATE.md`
"Owner-approved policy decisions" → göreve uyan `docs/contracts/*` raporu.

## İncelenecek minimum kod alanları
Değişen modül + `src/lib/contracts.ts`
(`resolveContractPaymentDueRule`) VE `src/lib/payment-due-rule-client.ts`
(ikisi senkron kalmalı) + şablon motoru
(`src/lib/documents/index.ts`, `contract-template-schema.ts`).

## Güvenlik/iş kuralı kontrolleri
- Telafi: yıl başına 2 hak, 30 gün, orijinal ders tarihinden. Aynı-gün iptal
  heuristic'ten türetilmiyor mu (LESSONS_LEARNED #1)?
- Ödeme pencereleri merkezi mi kaldı (kart 1-5, diğer 1-15), kullanıcı
  tarafından düzenlenebilir hale gelmedi mi?
- KDV dahil ibaresi korunuyor mu, "+ KDV" sızmadı mı?
- Şablon draft→activate akışı korunuyor mu (yerinde mutasyon yok)?
- Tarihsel/geçmiş sözleşme-ödeme kayıtları mutasyona uğramıyor mu (yeni
  metin sadece gelecekteki sözleşmeleri etkiler)?

## Hangi testler
`src/lib/__tests__/*contract*`, `*payment*`, `*makeup*` ile eşleşen
hedeflenmiş testler + yeni kural için en az bir e2e test.

## Çıktı formatı
Etkilenen finansal/yasal kural + hangi `docs/contracts/*` raporunun
güncellendiği veya yeni rapor gerekip gerekmediği.

## CEO onayı gereken işlemler
Sözleşme kaynak metni değişikliği (hukuk onayı), gerçek ödeme işlemi,
KDV/fiyat politikası değişikliği — hepsi Seviye 3.

## Sık yapılan hatalar
- `contracts.ts` kuralını güncelleyip `payment-due-rule-client.ts`'i
  unutmak (client/server kopyası senkronsuz kalır).
- Sabit-satır (12 taksit gibi) şablonlarda kısa süreli sözleşmeler için boş
  satır bırakmak (bkz. LESSONS_LEARNED 2026-08-30 #2. örnek pattern).
