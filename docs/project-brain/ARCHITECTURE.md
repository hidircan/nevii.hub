# ARCHITECTURE.md — pointer

Bu dosya mimariyi yeniden yazmaz. Kaynak: **`../../CLAUDE.md`** §Architecture
(kod-doğrulanmış, `next dev` her çalıştığında ilgili bölümün altına otomatik
blok ekliyor — dosyanın kendisi aktif olarak bakımda).

## Hızlı harita (CLAUDE.md'den özet, DOĞRULANDI)
- Katmanlar: UI/REST API → Service/Tool layer (`src/lib/services/tools.ts`,
  RBAC) → Store layer (`src/lib/store.ts` + `store-{json,db,memory}.ts`) →
  Prisma/PostgreSQL. AI tarafı da aynı Tool Layer'dan geçer
  (`src/lib/agent/registry.ts` → `executeAgentTool`) — AI için ayrı bir DB
  erişim yolu YOK.
- Yeni AI-çağrılabilir yetenek = tool fonksiyonu + registry kaydı, özel AI-side
  DB erişimi değil.
- `STORE_MODE` (`json`/`db`/`memory`) üç backend'i de aynı `StoreApi` ile
  sunar — parite zorunlu, bkz. DOMAIN kuralları.
- Portallar: `/panel` (admin/staff), `/ogretmen`, `/veli`,
  `/makbuz/[paymentId]`. Sadece root layout ve `/panel/layout.tsx` paylaşımlı.
- `ServiceResult<T>` (`ok`/`fail`) her service/tool fonksiyonunun dönüş şekli
  — beklenen hatada throw ETME.

## Ne zaman derinleşmeli
Store/Prisma detay → `API_AND_DATA.md`. Auth/RBAC → `AUTH_SECURITY_RBAC.md`.
AI provider zinciri → `AI_SYSTEM.md`. Frontend kuralları → doğrudan
`../../FRONTEND_GUIDELINES.md` (henüz proje-beynine indekslenmedi, tek
doküman olarak yeterli).
