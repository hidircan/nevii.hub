# API_AND_DATA.md — pointer

Kaynak: **`../../DATABASE_ARCHITECTURE.md`** (Prisma/PostgreSQL, multi-tenancy,
migration akışı, indexleme, backup — "Son doğrulama: 2026-07-31, HEAD
`f2fe8d83`" — göreve başlamadan önce mevcut HEAD ile karşılaştır, şema
o tarihten beri değişmiş olabilir, bkz. CURRENT_STATE.md'deki commit
edilmemiş `store-db.ts`/`types.ts` değişiklikleri).

## Migration akışı — DOĞRULANDI (CLAUDE.md)
`prisma validate` → `prisma generate` → `prisma migrate status` → (yalnız
onaylı staging hedefi için) `prisma migrate deploy`. `db push` günlük yol
DEĞİL. Production'a agent oturumundan migrate/push/reset asla CEO onayı
olmadan çalıştırılmaz.

## Tool Layer — tek DB erişim noktası
`src/lib/services/tools.ts` — DOĞRULANDI ama **şu an commit edilmemiş büyük
bir değişikliğin içinde (+1875 satır)**, bkz. CURRENT_STATE.md. Yeni bir API
işlemi eklemeden önce bu dosyadaki mevcut yamanın neyi değiştirdiğini
`git diff -- src/lib/services/tools.ts` ile kontrol et — üstüne çakışan bir
değişiklik yapma riski var.

## İlgili skill
`api-data-change` skill'i bu alandaki her değişiklikte kullanılmalı.
