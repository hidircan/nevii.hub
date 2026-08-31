# MOBILE_AND_INTEGRATIONS.md — pointer

## ⚠️ Önce oku: dokunma kuralı
`docs/agent-memory/LESSONS_LEARNED.md` kural #10: **Admin Mobile
(`apps/mobile/`) açıkça görevlendirilmeden çalışılmaz** — paralel oturum
geliştirmesi altında. `git status` bunu DOĞRULUYOR: tüm `apps/mobile/*`
şu an stage edilmiş (A), yani aktif/yakın zamanda bir oturum tarafından
eklenmiş. CEO açıkça bu alanı görevlendirmedikçe elleme.

## Kaynak
`apps/mobile/README.md` (varsa, bu taramada açılmadı) + kanonik yol tablosu:
`../../DEVELOPMENT_WORKFLOW.md` (kanonik mobil kaynak
`/Users/hidircanyagiz/Projects/notaplan/apps/mobile`, geçici agent çalışması
sadece `.claude/worktrees/*` altında olmalı).

## Yapı — DOĞRULANDI (dosya listesi, içerik okunmadı)
Expo/React Native, `(admin)`/`(parent)`/`(teacher)` route grupları,
`src/api/client.ts`, `src/auth/*`, tema/token dosyaları — web panel'in
mobil karşılığı gibi görünüyor, kapsamı bu taramada doğrulanmadı.

## İlgili skill
Ayrı bir mobile skill'i şu an tanımlı değil — mobile göreve girildiğinde
`feature-delivery` skill'i + bu doküman kullanılır, CEO onayı ile birlikte.
