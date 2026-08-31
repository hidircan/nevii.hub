# CURRENT_STATE.md

**Son güncelleme:** 2026-08-31 (ilk kurulum taraması, read-only)

## Ürün
Nevii Hub (marka adı) — müzik okulları için çok-kiracılı SaaS. Repo/klasör adı
hâlâ `notaplan` (kasıtlı, bkz. DECISIONS.md). Referans müşteri: Nilüfer Acar
Müzik Akademisi (İzmir, 2 şube). DOĞRULANDI (PROJECT_REQUIREMENTS.md).

## Teknoloji
Next.js 16 (App Router) · React 19 · TypeScript strict · Prisma/PostgreSQL +
JSON/memory store parity (`STORE_MODE`) · Tailwind 4. Detay: `../../CLAUDE.md`
(kod-doğrulanmış, güncel tutulan doküman).

## Branch / worktree durumu — DOĞRULANDI (git worktree list)
- Kanonik checkout: bu klasör, branch `main`, HEAD `8dfb929`.
- **9 adet `.claude/worktrees/*` paralel agent branch'i var, hepsi `prunable`
  işaretli** (git tarafından temizlenebilir ama silinmemiş — kimin/ne zaman
  bıraktığı belirsiz). CEO onayı olmadan dokunma veya silme.
- Repo dışı ilişkili worktree: `/Users/hidircanyagiz/Projects/neviios-control`
  (branch `grok-neviios-control`) — bağlı klasörün dışında, bu oturumdan
  erişilemez.

## Commit edilmemiş değişiklikler — DOĞRULANDI (git status/diff, 2026-08-31)
1. **Çekirdek değişiklik, 129 dosya (+6340/-1507)**: `src/lib/services/tools.ts`
   (+1875 satır), `store-db.ts`/`store-json.ts`/`store-memory.ts`/`store.ts`,
   `makeup-quota.ts`, `notifications/*`, `types.ts`, `validation.ts` dahil.
   İçerik bu taramada satır bazlı incelenmedi — bir sonraki göreve başlamadan
   `git diff --stat` ile tazele.
2. **`apps/mobile/*` yeni, stage edilmiş (A)** — Expo/React Native admin+veli+
   öğretmen mobil app iskeleti. LESSONS_LEARNED.md kural #10 gereği paralel
   oturumun elinde sayılır — **CEO açıkça görevlendirmedikçe dokunma.**
3. Dokümantasyon dosyaları modifiye (CLAUDE.md, DATABASE_ARCHITECTURE.md,
   DEVOPS_GUIDE.md, FRONTEND_GUIDELINES.md, PROJECT.md, README.md,
   PRODUCT_*.md, NOTAPLAN_CHANGELOG.md, .env.example) — satır bazlı
   doğrulanmadı, muhtemelen marka/genel güncelleme.
4. `maestron-logo.png` silinmiş (D) — marka geçişiyle tutarlı.

## Doğrulanmış çelişki — kod ↔ doküman
`CLAUDE.md`, `@AGENTS.md` import ediyor ve "Orion → Atlas → Prisma → Nova →
Helios → Forge → Sentinel" pipeline'ının orada tanımlı olduğunu söylüyor.
**Repo kökünde `AGENTS.md` YOK** (bazı `.claude/worktrees/*` altında var, ana
checkout'ta değil — muhtemelen `.gitignore`'lı ya da hiç commit edilmemiş).
CEO kararı gerektirir: dosya geri mi eklenecek, referans mı kaldırılacak?
Detay: KNOWN_GAPS.md.

## En yakın öncelikler — `docs/agent-memory/PROJECT_STATE.md`'den (2026-08-31)
Tamamlanan: P0 hydration hotfix (contract-panel tarih formatlama), karşılama
e-postası, CSV toplu geçmiş sözleşme içe aktarma.
Açık: Puppeteer PDF sayfa numaraları, "Ödeme Şekli" sütun düzeltmesi (hukuk
onayı bekliyor), gerçek tarayıcıda DOCX/print doğrulama, tam ZIP+CSV toplu
içe aktarma, aynı-gün iptal UI'ı. Tam liste: TASK_BOARD.md.

## Kritik değişmezler — asla ihlal etme (DOĞRULANDI, CLAUDE.md + LESSONS_LEARNED.md)
- Her satır bir `tenantId`'ye ait; kiracı kimliği yalnız JWT/session'dan gelir.
- Tüm iş mantığı `src/lib/services/tools.ts` (Tool Layer) üzerinden geçer.
- json/db/memory store paritesi zorunlu — tek store'a yapılan fix diğer ikisini
  sessizce bozar.
- Aktif/canlı şablonlar asla yerinde değiştirilmez — draft → activate.
- Telafi: eğitim yılı başına 2 hak (dönem değil), orijinal ders tarihinden 30
  takvim günü. Ödeme pencereleri: kart 1-5, havale/EFT/nakit 1-15 — merkezi,
  kullanıcı tarafından düzenlenemez. Tüm fiyatlar KDV dahil, asla "+ KDV".
  Detay: DECISIONS.md.
