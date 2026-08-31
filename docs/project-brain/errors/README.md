# Hata Hafızası — pointer

Bu klasör `docs/agent-memory/LESSONS_LEARNED.md`'nin YERİNE geçmez. O dosya
zaten olgun, iyi bakımlı bir formatla ("Rules distilled" + tarihli girdiler)
mevcuttu ve `CLAUDE.md` tarafından zorunlu okuma olarak işaretli. Kopyalamak
yerine burası ona işaret eder.

## Yeni hata kaydı nereye yazılır?
**`docs/agent-memory/LESSONS_LEARNED.md`'ye**, dosyanın kendi "How to add an
entry" formatıyla (What was tried/Why it was wrong/Correct approach/Files
involved). Proje-beyni talimatındaki alan format (Tarih/Alan/Belirti/Kök
neden/...) ile aynı bilgiyi taşır — iki paralel dosya tutulmaz.

## RECURRENT_PATTERNS.md / PREVENTION_CHECKLIST.md
Bu iki dosya henüz ayrı olarak oluşturulmadı çünkü `LESSONS_LEARNED.md`
zaten en üstte "Rules distilled from past incidents" bölümüyle bu işlevi
görüyor (11 kural, numaralı, tekrar eden hata tiplerini kapsıyor). Aynı tür
hata 3. kez tekrar ederse ve LESSONS_LEARNED.md'nin üst bölümü yetersiz
kalırsa, o zaman bu iki dosya ayrı içerikle oluşturulur — şimdiden boş
iskelet yaratılmadı (gereksiz dosya şişirmemek için).

## İlgili skill kontrol listeleri
Her `.claude/skills/*/SKILL.md` kendi "sık yapılan hatalar" bölümünde
LESSONS_LEARNED.md'deki ilgili kural numarasına referans verir — kuralın
kendisi tekrar yazılmaz.
