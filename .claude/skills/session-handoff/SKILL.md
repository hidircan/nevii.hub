---
name: session-handoff
description: Oturum sonunda sonraki Claude Code çalışmasının bağlam kaybetmeden devam etmesini sağlar.
---

## Ne zaman kullanılır
Her çalışma oturumunun SONUNDA (görev tamamlandığında veya bağlam
sınırına yaklaşıldığında).

## İlk okunacak minimum proje-beyni dokümanları
`docs/agent-memory/PROJECT_STATE.md` — birincil devir notu; yalnız "Güncel
snapshot" bölümü üzerine yazılır (bkz. `nevii-hub` skill §6). Eski snapshot
`docs/agent-memory/archive/`'e taşınır, dosya büyümez.
`docs/project-brain/SESSION_HANDOFF.md` isteğe bağlı CEO özeti.

## İncelenecek minimum kod alanları
Yok — bu skill dokümantasyon günceller, kod değiştirmez.

## Güvenlik/iş kuralı kontrolleri
Yok.

## Hangi testler
Yok — ama oturumda çalıştırılan testlerin SONUÇLARI handoff'a yazılır.

## Çıktı formatı
`docs/project-brain/SESSION_HANDOFF.md`'yi ÜZERİNE YAZ (tarihçe biriktirme):
son görev, değişen dosyalar, çalıştırılan/başarısız testler, açık kararlar,
sonraki mantıklı adım. Aynı zamanda `docs/agent-memory/PROJECT_STATE.md`'nin
"Current focus"/"Open work" bölümünü kök CLAUDE.md talimatına göre güncelle
— bu proje-beyninin YERİNE geçmiyor, ikisi birlikte güncellenir.
Gerekirse `TASK_BOARD.md` ve `KNOWN_GAPS.md`'yi de tazele.

## CEO onayı gereken işlemler
Yok.

## Sık yapılan hatalar
- Sadece proje-beynini güncelleyip `PROJECT_STATE.md`/`LESSONS_LEARNED.md`'yi
  atlamak (veya tersi) — ikisi de güncel tutulmalı, biri diğerinin yerine
  geçmiyor.
- Handoff notunu uzun bir günlüğe dönüştürmek — sadece "kaldığın yerden
  devam" için yeterli kısalıkta tut, ayrıntı ilgili rapora gider.
