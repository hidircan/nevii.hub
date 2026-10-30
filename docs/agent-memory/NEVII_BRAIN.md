# NeviiHub beyni — tek sayfalık bağlam (her ajan önce bunu okur)

Amaç: herhangi bir AI aracı (Claude Code `nevii-agent`, Codex, Cursor…) projeyi baştan anlatılmadan,
az token harcayarak doğru yerden başlasın. Ayrıntı her zaman aşağıda adı geçen dosyadadır; bu sayfa
yalnız haritadır. Güncel iş durumu: `docs/agent-memory/PROJECT_STATE.md` (yalnız en üst snapshot'ı oku).

## 1. Ürün ve sahip
- NeviiHub: eğitim kurumları (müzik okulu, yoga stüdyosu, dil kursu…) için çok kiracılı SaaS — ders
  programı, yoklama, telafi, sözleşme/tahsilat, öğretmen hakedişi, veli/öğretmen/öğrenci portalları, AI asistan.
- İlk müşteri: Nilüfer Acar (SUPER_ADMIN, kurum sahibi). Platform sahibi tek HYPER_ADMIN (Hıdırcan Yağız).
- NeviiOS = `/platform/*`: sahibin kod yazmadan kurum açtığı, paket/kampanya/hukuki belge/abonelik yönettiği ekranlar.
- Satıcı (fatura/sözleşme tarafı): HDR Mühendislik — kimlik NeviiOS › Fatura › E-belgeler › Satıcı profili'nden
  gelir, metinlere `{{SATICI_*}}` ile yerleşir (`src/lib/saas-billing/legal-templates.ts`). Kodda sabit yazma.
- Dil: arayüz Türkçe; kimlikler İngilizce. Her görünür hata = nedeni + nasıl düzeltileceği (Türkçe cümle).

## 2. Ortamlar ve yayın (en çok zarar veren yer)
- Canlı: `main` → Vercel (fra1) → neviihub.com; DB Supabase `ddskhtirzywbuucxeovz` (eu-central-1).
  Eski `wsbucz…` donmuş geri dönüş kaynağı — dokunma. Kalıcı test ortamı yok (local-first).
- HER canlı yayın sahibin açık onayıyla. Migration: önce sahibin onayı + yedek, migration KODDAN ÖNCE
  session pooler (5432) ile; transaction pooler'da (6543) oturum düzeyinde `SET` asla.
- `.env*` canlıyı gösterebilir: DB komutundan önce hedefi kanıtla. Seed yalnız yerel/test DB.
- Yerel: `STORE_MODE` yoksa `json` (gerçek veri yok). Dev HYPER_ADMIN test hesabı `src/lib/auth/users.ts`.

## 3. Mimari tek cümlede
UI (`src/app/panel|platform|ogretmen|veli`, `src/components`) → server action (`src/lib/actions.ts`) →
**tool** (`src/lib/services/tools.ts`: RBAC + `ServiceResult` ok/fail) → store (`src/lib/store.ts` → json/db/memory,
üçü aynı davranır) → Prisma/PostgreSQL. AI aynı tool'ları `src/lib/agent/registry.ts` üzerinden çağırır; AI'ya özel
DB yolu yok. Tenant kimliği yalnız oturumdan (ALS `tenant-context.ts`), asla istemci girdisinden.
SaaS satış/abonelik: `src/lib/saas-billing/*` (checkout `/satin-al/*`, müşteri `/abonelik/*`, PayTR/iyzico, mock).

## 4. Asla çiğneme
1. Supabase egress: yeni `readData()`/`readScopedData(` = ratchet testi kırmızı. Dar dilim kullan
   (`src/lib/reference-data.ts`, `read*ById`), döngüde "hepsini oku + JS'te süz" yok, cron okuması penceresiyle sınırlı.
2. Finans tek kaynak: ödenecek tutar = sözleşmenin dondurulmuş taksit `Payment` satırları; güncel sözleşme =
   `selectCurrentContract`; iptal edilen satır silinmez; tahsil edilen ≠ ödenmesi gereken.
3. Store parity: json/memory/db üçüne birden uygula. Vercel'de dosya = `/tmp` = örnek başına geçici →
   db modunda dosyaya kalıcı veri yazma (2026-10-30 saas-billing olayı).
4. Dış mesaj (e-posta/SMS/WhatsApp) AI tarafından yalnız taslak; insan onaylar.
5. `apps/mobile/` yalnız görev açıkça kapsıyorsa. Başkasının değişikliğine dokunma; "changed on disk" = onların işi.
6. Hukuki metin: hazır taslaklar var ama yayın NeviiOS'ta hukuki + ticari onayla; onaysız gerçek satış kapalı.

## 5. Sık tekrarlanan tuzaklar (ayrıntı: LESSONS_LEARNED.md'de başlıkla ara)
- Bir kuralı düzeltirken TÜM okuyucularını `grep` et (aynı soruya beş cevap olayları).
- Türetilmiş değeri saklama (statü, taksit sırası, ay) — okurken türet; saklanan bayatlar.
- `toLocaleDateString` seçeneksiz SSR'de kullanma; saat dilimi İstanbul, yerel PG ≠ canlı.
- Prisma 7 `updateMany` bir transaction; etkileşimli transaction içinde `return fail()` geri almaz (throw).
- `"use client"` dosyasından sunucu bileşenine sabit aktarma (Turbopack RSC kırılır) — paylaşılan modüle koy.
- `globals.css` katmansız kuralları (`body * {font-family !important}`, `h1,h2,h3 {color}`) Tailwind
  sınıflarını ezer: başlık fontu için `h2`, renk için satır içi stil.
- Tarayıcı/ekran görüntüsü animasyonun ortasında alınabilir; karar vermeden önce `getComputedStyle` ile doğrula.
- `npm test` tam pakette `auth-*-login` testleri yük altında zaman aşımına düşebilir; tek başına çalıştırıp ayır.

## 6. Çalışma sırası (ucuz ve doğru)
1. `git status` + `git log --oneline -3`; başka oturumun işi varsa ayrı worktree.
2. `.claude/skills/nevii-hub/SKILL.md` (yönlendirici) → tablodaki TEK konu skill'i.
3. Ders ara, hepsini okuma: `grep -n -i "<anahtar>" docs/agent-memory/LESSONS_LEARNED.md`.
4. Ekrandan başlayıp veri kaynağına daralt; kök nedeni ortak fonksiyonda düzelt.
5. Hedef test → kapı: `npm run typecheck` → `npm run lint` → `npm test` → `npx prisma validate` → `npm run build`.
6. Commit yalnız kapsamdaki dosyalar + `Co-authored-by` ve `Signed-off-by` (git config kullanıcısı).
7. Oturum sonu: `PROJECT_STATE.md` en üst snapshot'ın üzerine ~10 satır; yeni kanıtlı hata → LESSONS_LEARNED'e 3–5 satır;
   bu dosyada değişen bir harita/kural varsa burayı da güncelle (kısa kalsın, <150 satır).

## 7. Başka AI aracına geçerken
Codex/Cursor/OpenCode `AGENTS.md`'yi otomatik okur; o dosya buraya yönlendirir. Skill'ler düz Markdown'dır
(`.claude/skills/*/SKILL.md`) — her araç okuyabilir. Hafıza = bu klasör (`docs/agent-memory/`), araçtan bağımsız.
