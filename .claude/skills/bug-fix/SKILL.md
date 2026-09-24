---
name: bug-fix
description: Hatanın yeniden üretimi, kök neden, minimal düzeltme, regresyon testi ve hata hafızası güncellemesini uygular.
---

## Ne zaman kullanılır
Açık bir hata/regresyon bildirildiğinde.

## İlk okunacak minimum proje-beyni dokümanları
`CURRENT_STATE.md` + `docs/agent-memory/LESSONS_LEARNED.md` (aynı hata daha
önce yaşanmış ve "denenip geri alınmış" olabilir — özellikle telafi/aynı-gün
iptal alanında, kural #1) + ilgili alan dokümanı.

## İncelenecek minimum kod alanları
Hatanın belirtisiyle doğrudan ilişkili dosya(lar) + varsa ilgili test
dosyası. Baseline'ı ayır: hata yeni değişiklikten mi, önceden var olan
başarısız testten mi kaynaklanıyor (`testing-regression` skill'iyle
koordineli).

## Güvenlik/iş kuralı kontrolleri
Kök neden bir tenant izolasyonu/RBAC/finansal kural ihlaliyse
`security-rbac-review` veya `finance-contracts` skill'ine eskale et.

## Hangi testler
Hatayı yeniden üreten en az bir regresyon testi eklenir/güncellenir, sonra
hedeflenmiş çalıştırılır. Tam suite yalnız gerekliyse.

## Çıktı formatı
Kısa rapor: belirti → kök neden → uygulanan minimal düzeltme → eklenen test
→ doğrulama komutları.

## CEO onayı gereken işlemler
Düzeltme production veri/migration/gerçek dış mesaj gerektiriyorsa Seviye 3
kuralları geçerli.

## Sık yapılan hatalar
- Belirtiyi (symptom) düzeltip kök nedeni atlamak.
- Heuristic/türetilmiş sinyalle "düzeltme" yapmak (bkz. LESSONS_LEARNED #1 —
  daha önce tam bu şekilde başarısız oldu).
- `docs/agent-memory/LESSONS_LEARNED.md`'ye kayıt eklemeyi atlamak — gerçek
  bir hata bulunup düzeltildiyse ZORUNLU.
