---
name: testing-regression
description: Yeni regresyonu eski baseline probleminden ayırır; hedef test seçer; geçersiz "test edildi" iddiasını engeller.
---

## Ne zaman kullanılır
Herhangi bir kod değişikliğinden sonra, "doğrulama" adımında. Ayrıca
başarısız bir testle karşılaşıldığında ilk başvurulacak skill.

## İlk okunacak minimum proje-beyni dokümanları
`docs/project-brain/CURRENT_STATE.md` (bilinen commit edilmemiş
değişiklikler — bir testin ONLARDAN mı yoksa senin değişikliğinden mi
kırıldığını ayırt etmek için).

## İncelenecek minimum kod alanları
Değişen dosyaların testleri. `vitest.config.mts`'nin `fileParallelism:false`
ayarını unutma — testler `STORE_MODE=json` ile aynı diskteki store'u
paylaşır, paralel çalıştırma flaky sonuç üretir (kasıtlı, "workaround"
denenmez).

## Güvenlik/iş kuralı kontrolleri
Yok — bu skill doğrulama sürecinin kendisi.

## Hangi testler
Varsayılan: hedeflenmiş (`npx vitest run <path>`). Tam suite (`npm test`)
sadece hedef testler yetersizse veya CEO özellikle istediğinde. Değişiklik
öncesi baseline'ı bir kez çalıştırıp (mümkünse) "bu test zaten kırıktı mı"
sorusuna cevap ver.

## Çıktı formatı
`komut` — sonuç şeklinde liste + çalıştırılmayan kritik test varsa açık
neden (örn. "Chrome kurulumu bu ortamda mümkün değil").

## CEO onayı gereken işlemler
Yok.

## Sık yapılan hatalar
- Önceden başarısız bir testi yeni değişiklikten kaynaklanıyor sanıp
  "düzeltmeye" çalışmak.
- "Test edildi" demek ama aslında sadece typecheck/lint çalıştırmak —
  bunlar test değildir, ayrı ayrı raporlanır.
- Her küçük değişiklikte tam suite çalıştırıp gereksiz token/süre harcamak.
