---
name: project-orientation
description: Yeni bir göreve başlamadan önce en kısa yoldan doğru bağlamı bulur.
---

## Ne zaman kullanılır
Her yeni görevin İLK adımı. CEO/CTO'dan bir istek geldiğinde, kod okumadan
önce.

## İlk okunacak minimum proje-beyni dokümanları
Ana yönlendirici artık `nevii-hub` skill'i — önce onu izle. Ek olarak:
1. `docs/agent-memory/PROJECT_STATE.md` (güncel snapshot; `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş)
2. Görev konusuna uyan TEK alan dokümanı (`docs/project-brain/README.md` tablosu)

## İncelenecek minimum kod alanları
Yok — bu skill saf keşif/yönlendirme, kod değişikliği yapmaz.

## Güvenlik/iş kuralı kontrolleri
- CURRENT_STATE.md'deki "commit edilmemiş değişiklikler" listesini
  `git status`/`git diff --stat` ile tazele — tarama tarihinden beri
  değişmiş olabilir.
- Görevin `apps/mobile/*`'a dokunup dokunmadığını kontrol et — dokunuyorsa
  CEO'nun açıkça görevlendirdiğini doğrula (LESSONS_LEARNED.md #10).

## Hangi testler
Yok.

## Çıktı formatı
Kısa: (a) görev hangi risk seviyesinde (1/2/3), (b) hangi alan dokümanı/
skill kullanılacak, (c) bilinen açık risk/karar varsa tek satır.

## CEO onayı gereken işlemler
Yok — bu skill onay gerektiren bir işlem yapmaz.

## Sık yapılan hatalar
- Tüm repoyu veya tüm proje-beynini baştan tarama — sadece ilgili dosyayı oku.
- CURRENT_STATE.md'yi güncel varsayıp git durumunu tazelemeden devam etmek.
