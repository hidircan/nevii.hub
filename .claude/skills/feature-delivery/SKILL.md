---
name: feature-delivery
description: Yeni özellik için mevcut davranış → minimal plan → implementasyon → hedef test → dokümantasyon akışını uygular.
---

## Ne zaman kullanılır
Yeni bir özellik/davranış eklenirken (Seviye 2-3 çoğunlukla).

## İlk okunacak minimum proje-beyni dokümanları
`README.md` → `CURRENT_STATE.md` → ilgili alan dokümanı → `TASK_BOARD.md`
(aynı iş zaten kayıtlı mı?).

## İncelenecek minimum kod alanları
Sadece etkilenecek modül(ler) + doğrudan bağımlılıkları + ilgili mevcut
testler. `src/lib/services/tools.ts`'e dokunuyorsa önce
`git diff -- src/lib/services/tools.ts` ile mevcut commit edilmemiş
değişiklikle çakışmayı kontrol et.

## Güvenlik/iş kuralı kontrolleri
- Tenant/RBAC etkisi var mı? (`AUTH_SECURITY_RBAC.md`)
- Store paritesi (json/db/memory) etkileniyor mu?
- `ServiceResult`/`ok`/`fail` deseni korunuyor mu (throw yok)?
- Şablon/aktif veri yerinde mi değiştiriliyor (yasak)?

## Hangi testler
Değişen modülün mevcut testleri + yeni davranış için en az bir hedeflenmiş
test. Tam suite sadece hedef testler yetersizse veya CEO isterse.

## Çıktı formatı
Seviye 2-3 için: önce kısa mevcut durum + 3-7 maddelik plan (etkilenen
dosyalar, rol/tenant etkisi, test planı) → CEO/CTO onayı → uygulama. Sonda
kök talimattaki "Sonuç/Değişen dosyalar/Doğrulama/Risk/Proje beyni/Git
durumu" formatı.

## CEO onayı gereken işlemler
Plan onayı (Seviye 2-3), migration/production/gerçek e-posta gönderimi gibi
Seviye 3 alt-işlemler.

## Sık yapılan hatalar
- İlgisiz refactor/formatlama eklemek.
- Var olmayan endpoint/tablo/fonksiyon uydurmak — kod okunmadan iddia etmek.
- `PROJECT_STATE.md`/`LESSONS_LEARNED.md`'yi güncellemeyi unutmak (oturum
  sonunda).
