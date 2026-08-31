# Proje Beyni — Nevii Hub — Giriş Noktası

Yeni bir görevde ÖNCE bu dosyayı, SONRA `CURRENT_STATE.md`'yi oku. Sonra göreve uyan
tek alan dokümanını + ilgili `.claude/skills/*` dosyasını oku. Repoyu, tüm dokümanları
veya tüm testleri baştan tarama.

## Zaten var olan hafıza sistemi — kopyalanmadı, indekslendi

Bu repoda proje-beyni kurulmadan ÖNCE zaten olgun bir "resume-from-here" sistemi
vardı: `docs/agent-memory/PROJECT_STATE.md` (canlı özet) ve
`docs/agent-memory/LESSONS_LEARNED.md` (hata hafızası). Kök `CLAUDE.md` bunları
zorunlu okuma olarak işaretliyor. **Bu proje-beyni o sistemin yerine geçmez** —
üzerine CEO/CTO için hızlı-karar katmanı ekler. Kod değişikliği yapan her oturum
hâlâ `PROJECT_STATE.md` ve `LESSONS_LEARNED.md`'yi CLAUDE.md'nin talimatına göre
güncellemeli.

## Konu → Doküman haritası

| Konu | Önce oku | Kaynak (orijinal, kopyalanmadı) |
|---|---|---|
| Mimari, katmanlar, store, AI provider zinciri | `ARCHITECTURE.md` | `../../CLAUDE.md` |
| Veritabanı / Prisma / migration | `API_AND_DATA.md` | `../../DATABASE_ARCHITECTURE.md` |
| Auth / RBAC / güvenlik | `AUTH_SECURITY_RBAC.md` | `../../CLAUDE.md` §Auth, `src/lib/auth/*` |
| E-posta / bildirim / davet | `COMMUNICATIONS.md` | `src/lib/email/*`, `docs/agent-memory/PROJECT_STATE.md` |
| Sözleşme / finans / ödeme | `FINANCE_CONTRACTS.md` | `../contracts/*` (25+ rapor), `PRODUCT_BACKLOG.md` |
| Program / yoklama / telafi | `SCHEDULING_ATTENDANCE_MAKEUP.md` | `docs/agent-memory/LESSONS_LEARNED.md` #1-3, `docs/policies/*` |
| AI sistemi (chat/workflow/tool) | `AI_SYSTEM.md` | `../../CLAUDE.md` §AI platform, `src/lib/ai/*`, `src/lib/agent/*` |
| Mobil app / entegrasyonlar | `MOBILE_AND_INTEGRATIONS.md` | `apps/mobile/*` — ⚠️ paralel oturum, dokunma |
| Production hazırlık | `PRODUCTION_READINESS.md` | `../launch/ADMIN_WEB_PRODUCTION_READINESS.md`, `../../DEVOPS_GUIDE.md` |
| Bilinen eksikler | `KNOWN_GAPS.md` | derlenmiş |
| CEO/CTO kararları | `DECISIONS.md` | derlenmiş |
| Uzun vadeli vizyon/öncelik sırası | `VISION.md` | derlenmiş |
| Aktif işler | `TASK_BOARD.md` | derlenmiş |
| Oturum devri | `SESSION_HANDOFF.md` | her oturum sonunda güncellenir |
| Hata hafızası | `errors/README.md` | `../agent-memory/LESSONS_LEARNED.md` (ayrı kopya yok) |

## Yeni görevde minimum okuma seti

- **Seviye 1** (küçük/düşük risk): bu dosya + `CURRENT_STATE.md` + ilgili skill.
- **Seviye 2-3** (orta/yüksek risk): yukarıdakiler + ilgili alan dokümanı +
  `docs/agent-memory/PROJECT_STATE.md` + `docs/agent-memory/LESSONS_LEARNED.md`.

## Etiket sözleşmesi

Alan dokümanlarındaki her iddia şu etiketlerden biriyle işaretlenir:
**DOĞRULANDI** (koddan teyit edildi) · **KISMİ** (bir kısmı doğrulandı) ·
**PLANLANDI, UYGULANMADI** · **DOĞRULANMADI** (dokümanda var, kod okunmadı) ·
**RİSKLİ**. Kodla çelişen doküman bulunursa kod gerçek sayılır, çelişki
`KNOWN_GAPS.md`'ye not edilir.
