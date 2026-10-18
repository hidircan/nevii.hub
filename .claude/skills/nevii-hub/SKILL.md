---
name: nevii-hub
description: NeviiHub'da her görevin başlangıç yönlendiricisi — "şu hatayı düzelt / şunu ekle / teste al" denince önce bunu kullan. Konuya göre hangi skill/dokümanın okunacağını, değişikliğin hangi katmana yapılacağını, local→test→prod sınırını, finans tek-kaynak kuralını ve doğrulama/teslim sırasını kısaca verir.
---

# NeviiHub yönlendirici (kısa — ansiklopedi değil)

## 1. Başlarken (sırayla, en fazla bu kadar oku)
1. `git status --short`, `git branch --show-current`, `git log --oneline -3`, `git log origin/test --oneline -1`.
   Başkasına ait değişiklik varsa DOKUNMA; başka bir Claude oturumu aynı ağaçta çalışıyor olabilir
   (ListAgents) → kendi işini ayrı worktree'de yap (`git worktree add ../nevii-hub-<iş> origin/test -b <dal>`,
   `npm ci`, `npx prisma generate`, `.env*` kopyala).
2. `docs/agent-memory/PROJECT_STATE.md` (kısa snapshot) → konu `LESSONS_LEARNED.md`'de geçiyorsa ilgili madde.
   `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş — güncel durum için kullanma.
3. Aşağıdaki tablodan TEK konu skill'i. Kod aramasını ekrandan başlayıp veri kaynağına doğru daralt.

| İstek konusu | Skill | İlk bakılacak kod |
|---|---|---|
| Sözleşme, taksit, tahsilat, tahakkuk, makbuz, finans özeti | `finance-contracts` | `src/lib/contracts.ts`, `payment-profile.ts`, `attendance-calendar-plan.ts` |
| Ders programı, yoklama, telafi, takvim | `scheduling-attendance-makeup` | `src/components/program-studio.tsx`, `services/tools.ts` |
| API/route, Prisma, migration, store parity | `api-data-change` | `src/lib/store*.ts`, `prisma/schema.prisma` |
| Yetki, PII (TC/IBAN), oturum, tenant | `security-rbac-review` | `src/lib/auth/*`, `src/lib/pii/*` |
| AI/chat/workflow | `ai-system` | `src/lib/ai/*`, `src/lib/agent/*` |
| E-posta/SMS/bildirim | `communications-email` | `src/lib/email/*` |
| Hata düzeltme süreci | `bug-fix` + `testing-regression` | — |
| Yeni özellik süreci | `feature-delivery` | — |
| Deploy/env/cron/Vercel | `production-readiness` | `vercel.json`, `docs/operations/*` |
| Performans, Supabase egress/kota, yavaş sorgu, Vercel CPU, oturum gecikmesi | `performance-db-egress` | `src/lib/store-db.ts`, `reference-data.ts`, `scripts/bench/*` |
| Oturum sonu | `session-handoff` | — |

## 2. Değişiklik nereye yapılır
UI (`src/app/panel/*`, `src/components/*`) → server action (`src/lib/actions.ts`) → **tool** (`src/lib/services/tools.ts`, RBAC + `ServiceResult`) → store (`src/lib/store.ts` → json/db/memory) → Prisma.
- İş kuralı tool'da veya saf `src/lib/*.ts` yardımcıda; sayfada/komponentte hesap kopyalama.
- Birden çok ekranın okuduğu değeri ortak fonksiyonda düzelt (tüm çağıranları `grep` et), tek ekranı yamalama.
- Kullanıcıya görünen her hata: nedeni + nasıl düzeltileceğini söyleyen Türkçe cümle.

## 3. Finans/sözleşme tek kaynak
- Ödenecek tutar = sözleşmenin dondurulmuş taksit `Payment` satırları (`contractId`, `installmentSequence`). Takvim/ekran kendi tutarını türetmez, ayrıca saklamaz.
- Güncel sözleşme tek kural: `selectCurrentContract` (iptal/`superseded` asla güncel değil).
- İptal/yenilenmiş sözleşmenin satırları SİLİNMEZ/yeniden yazılmaz; gerçekleşmiş tahsilat her zaman görünür.
- "Ödenmesi gereken" ile "tahsil edilen" ayrı alan ve ayrı başlık.

## 4. Ortam sınırı (2026-10-01'den beri local-first — `docs/operations/LOCAL_FIRST_DEPLOYMENT.md`)
- Canlı: `main` → Vercel → `neviihub.com`, DB Supabase `wsbucznpujcfzhitzrbl`. Sürekli açık test ortamı YOK:
  `test.neviihub.com` geçici olarak canlıya yönlenir; eski test DB'si (`vxzewyiwfshobjizzetw`) gerçek veri taşıyan
  salt-okunur geri dönüş kaynağıdır, test hedefi DEĞİL.
- Düşük riskli, migration'sız iş: yerel doğrulama → `main`. Migration/finans/silme/auth/tenant/toplu veri/dış mesaj:
  yerel → geçici test ortamı (sentetik veri) → owner UAT → planlı yayın.
- `.env` production'ı veya artık olmayan bir projeyi gösterebilir: DB komutundan önce hedefi kanıtla, `DATABASE_URL`'i
  açıkça ver. Seed yalnız yerel/test DB'ye (`assertSeedTarget`). Migration gerekmiyorsa DB komutu yok.
- Canlı DB'de gerçek öğrenci/sözleşme/ödeme verisini silme veya yeniden üretme. Sır/DB URL/şifreyi dosyaya yazma.

## 5. Doğrulama ve teslim sırası
1. Kök nedeni kanıtla (kod yolu + gerekirse yeniden üreten test). Yalnız UI metniyle veri hatası örtme.
2. Hedef testler (`npx vitest run <dosya>`), sonra kapı: `npm run typecheck` → `npm run lint` → `npm test` (SON değişiklikten sonra) → `npx prisma validate` → `npm run build`.
   Tam paket kırmızıysa kaç test/neden yaz; "hepsi geçti" deme.
3. Commit: yalnız kapsamdaki dosyalar; `Co-authored-by` + `Signed-off-by` (git config kullanıcısı). `apps/mobile/*`, `docs/notion-export/*`, `pazarlama/*` gibi ilgisiz dosyaları stage etme.
4. **Migration içeren değişiklik:** önce owner onayı + canlı yedeği, migration canlıya session pooler (5432) ile, KODDAN
   ÖNCE uygulanır (şema kodu migration'sız DB'ye giderse panel P2022 ile çöker — 2026-09-27 P0). `main` ve `test`
   build'leri uygulanmamış migration varken `scripts/check-pending-migrations.ts` ile durur.
   Canlıya çıkış: `git fetch` → hızlı ileri `main` push → deployment READY (fra1) → health/ready + giriş + ana sayfalar.
   Tarayıcıda giriş yapıp tıklamadıysan "hazır" deme; yüksek riskli işte owner'a UAT adımlarını ver.

## 6. Oturum sonu (kısa tut)
- `PROJECT_STATE.md`: yalnız "Güncel snapshot" bölümünü ÜZERİNE yaz (commit, ortam, açık iş, riskler — ~40 satır). Ayrıntı → `docs/testing/UAT_*.md` / `docs/operations/*`; eski snapshot → `docs/agent-memory/archive/`.
- `LESSONS_LEARNED.md`: yalnız bu oturumda KANITLANIP düzeltilen yeni hata için 3–5 satır; var olan maddeyi tekrar etme.

## 7. Supabase egress kuralı (2026-10-16, zorunlu)
- Yeni `readData()`/`readScopedData(` = `egress-full-read-ratchet.test.ts` kırmızı. Dar dilim kullan
  (`reference-data.ts`, `readScoped*`, `read*ById`, `readLessonsStartingBetween`, `readMakeupCenterData`).
- Döngü/satır başına "hepsini listele + JS'te süz" yasak → SQL `where`/`select`/`take`.
- Cron/tick: tur başına okuma × günlük tur sayısını PR'a yaz; 10 dk'lık iş yalnız penceresini okur.
- Büyük kolon (logo, sözleşme snapshot'ı, dosya/HTML) yalnız onu gösteren tekil ekranda seçilir.
- Mobil/API ucu ekliyorsan: tek öğrenci → `readStudentScope`, tarih aralığı → `readLessonWindow`, liste → `readReferenceData`;
  `readData()` önüne önbellek koyma (instance'lar arası bayat finans verisi). Ölçüm/yöntem: `performance-db-egress` skill.
- Yazım sonrası tüm veriyi yeniden okuma (`data: await readData()`); ders düzenleme → `readLessonEditScope`, e-posta logosu
  → `readSchoolBranding`, sayaç → `count` sorgusu. Kalan yollar: son `docs/performance/DB_EGRESS_*.md` "Kalan" bölümü.
- Ayrıntı: CLAUDE.md "Egress rules — enforced".
