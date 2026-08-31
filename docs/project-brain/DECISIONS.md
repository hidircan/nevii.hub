# DECISIONS.md

CEO/CTO tarafından verilmiş, tahmin edilmemiş kararlar. Tarih, gerekçe,
etkilenen alan, geri alma koşulu.

## Marka: "Nevii Hub"
- **Karar:** Kullanıcıya görünen ürün adı "Nevii Hub". Teknik slug
  `nevii-hub` (mobil: `nevii-hub-mobile`). Eski adlar (NotaPlan/notaplan/
  Maestron/maestron) her kullanıcıya-görünen ve aktif-kaynak bağlamdan
  kaldırıldı.
- **Kaldırılmadı (kasıtlı):** local klasör yolu (`.../notaplan`), repo adı,
  JWT issuer/audience, şifreleme salt'ları, storage key'leri, migration/DB
  isimleri, geçmiş/uyumluluk verisi — geriye uyumluluk riski nedeniyle.
- **Kaynak:** `../../NEVII_HUB_BRAND_MIGRATION_REPORT.md`,
  `../../BRAND_MIGRATION_INVENTORY.md`.
- **Durum:** Faz 0-3, 5-7 tamamlandı; Faz 4 kapsam dışı/bloke; Faz 6 sadece
  kod referansları temizlendi, asset dosyaları diskte referanssız kaldı.
- **Geri alma koşulu:** Belirtilmemiş — CEO'ya sorulmadan tersine çevrilmez.
- **Bu oturumun (2026-08-31, ikinci tur) doğrulaması:** Case-sensitive
  `NotaPlan`/`Maestron` taraması tekrarlandı — repo genelinde yalnızca bu
  göçü belgeleyen rapor/karar dosyalarında ve tarihsel/harici bağlamlarda
  (bkz. `TASK_BOARD.md`, brand-migration raporları) kaldı, canlı
  kullanıcı yüzeyinde YOK.
- **ÇELİŞKİ TESPİT EDİLDİ (2026-08-31, ikinci tur):**
  `apps/mobile/app.json` içinde iOS/Android bundle identifier
  (`com.notaplan.mobile`→`com.neviihub.mobile`) paralel/eş oturum
  tarafından zaten değiştirilmiş bulundu. Bu, bu oturumun aldığı açık
  talimatla ("apps/mobile'da Expo/Apple/Android bundle identifier
  DEĞİŞTİRİLMEYECEK — ayrı bir mobil sürüm kararı") çelişiyor. **Geri
  alınmadı** (talimat: ilgisiz/paralel oturum değişiklikleri geri
  alınmaz) — CEO'nun bu değişikliği onaylaması veya paralel oturumla
  koordine edilmesi gerekiyor. Uygulama hiçbir mağazaya dağıtılmadığı
  için şu an canlı risk yok, ama bilinçli bir CEO kararı olmadan
  kalıcılaşmamalı.

## Telafi (makeup) politikası
- **Karar:** Öğrenci başına eğitim yılı içinde (dönem değil) maksimum 2
  telafi hakkı. Orijinal kaçırılan ders tarihinden 30 takvim günü geçerlilik.
- **Kaynak:** `docs/agent-memory/PROJECT_STATE.md` "Owner-approved policy
  decisions" (FINAL, yeniden tartışılmaz).
- **Not:** Sözleşme metni ("iptalin gerçekleştiği ay içinde") bu kararla
  çelişiyor, BİLİNÇLİ olarak düzeltilmedi — hukuk/sahip onayı olmadan yasal
  kaynak metin değiştirilmez. Detay:
  `../contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`.

## Ödeme pencereleri
- **Karar:** Kart ödemeleri ayın 1-5'i (dahil), havale/EFT/nakit 1-15'i
  (dahil). Kurum politikası, öğrenci/paket bazında düzenlenemez.
- **Kaynak:** `docs/agent-memory/PROJECT_STATE.md`.

## KDV
- **Karar:** Tüm müşteriye-görünen eğitim ücretleri KDV dahil. Zorunlu
  ibare: "Tüm eğitim ücretleri KDV dahildir." Asla "+ KDV" veya oran
  gösterimi.
- **Kaynak:** `docs/agent-memory/PROJECT_STATE.md`.

## Şablon yaşam döngüsü
- **Karar:** Aktif/canlı şablon asla yerinde (in-place) düzenlenmez —
  her düzenleme yeni draft + ayrı yetkili aktivasyon adımı.
- **Kaynak:** `docs/agent-memory/LESSONS_LEARNED.md` kural #6.

---
*Yeni bir CEO/CTO kararı verildiğinde bu dosyaya eklenir: karar, tarih,
neden, etkilenen alan, geri alma koşulu — kısa.*


## Ürün önceliklendirme sırası (2026-08-31)
- **Karar:** 1) Web sürümünü canlıya al, 2) Öğretmen-öğrenci mobil
  uygulamaları, 3) Yönetim mobil portalı. Bu sırayla ilerlenecek.
- **Kaynak:** CEO, bu oturumda doğrudan belirtti.
- **Detay:** `docs/project-brain/VISION.md`.

## Uzun vadeli vizyon: AI-native ERP ekosistemi (2026-08-31)
- **Karar:** Nevii Hub uzun vadede çok katmanlı bir AI-native ERP
  uygulaması/ekosistemi olarak büyütülecek. Güvenlik, hız, hatasızlık, veri
  güvenliği, çökme direnci ve kurumsal profesyonellik asla ödün
  verilmeyecek standartlar olarak kabul edildi.
- **Kaynak:** CEO, bu oturumda doğrudan belirtti.
- **Detay:** `docs/project-brain/VISION.md`.

## AGENTS.md geri yüklendi (2026-08-31)
- **Karar:** `4ab2f3d` commit'inde (muhtemelen kazara) silinen `AGENTS.md`
  `f2fe8d8`'den geri getirildi — bu dosya araç-bağımsız (Claude Code,
  Codex CLI, Cursor, OpenCode) çalışacak şekilde tasarlandığı için CEO'nun
  "Claude'un token'ı bitse bile başka bir araçla devam edebilme" ihtiyacının
  temel dayanağı.
- **Kaynak:** Bu oturumun teknik bulgusu, CEO'nun devir-altyapısı talebiyle
  doğrudan örtüşüyor.


## Domain: neviihub.com (2026-08-31)
- **Karar:** CEO domaini Cloudflare Registrar üzerinden kendisi, **2
  yıllığına** satın aldı (Vercel üzerinden ALINMADI — CTO'nun önerdiği
  $11.25/yıl Vercel seçeneği kullanılmadı, muhtemelen Cloudflare daha
  uygun/tercih edilen seçenekti).
- **Durum (2026-08-31 itibarıyla):** DNS/Vercel bağlantısı **HENÜZ
  YAPILMADI**. `neviihub.com`, `www.neviihub.com`, `app.neviihub.com`
  adresleri Cloudflare DNS üzerinden Vercel projesine bağlanmadan
  production'a alınmayacak — bkz. `TASK_BOARD.md` go-live sırası adım 8.
- **Sıradaki adım:** DNS'i Vercel projesine (`notaplan`, takım
  `hidircans-projects`) yönlendirme — henüz yapılmadı, go-live sırasının
  8. adımı (veri taşıma ve migration doğrulamasından SONRA).

## Vercel Pro plan (2026-08-31)
- **Karar:** Şimdilik ERTELENDİ — go-live'a daha yakın bir zamanda tekrar
  değerlendirilecek. Hobby plan ticari kullanım için uygun değil (bkz.
  KNOWN_GAPS.md §3) ama CEO bunu bilerek, bilinçli olarak erteledi.


## Portal Erişim Yönetimi — varsayılan durum ve mimari kararlar (2026-08-31)
- **Karar (varsayılan durum):** Mevcut TÜM öğrenci/öğretmenler için portal
  erişimi geriye dönük olarak GÜVENLİ (kapalı/pasif) durumda kalır — hiç
  kimsenin erişimi bu görevle "yanlışlıkla" açılmadı. Teknik gerekçe:
  `StudentPortalAccess` zaten yalnızca admin `davet et`/`erişim ver`
  eylemiyle satır kazanıyor (varsayılan olarak kayıt YOK = erişim YOK);
  öğretmen tarafında yeni `User.active` alanı `@default(true)` (Prisma
  şeması) — yani mevcut hiçbir öğretmenin erişimi bu görevle kapatılmadı,
  yalnızca admin'e artık bunu AÇIKÇA kapatabileceği bir "Portal Erişimi"
  kartı eklendi. Yeni öğrenci/öğretmen kaydı ekranlarında "portal erişimi"
  seçeneği **varsayılan olarak KAPALI/işaretsiz** — admin bilinçli olarak
  işaretlemedikçe davet gönderilmez.
- **Mimari karar — token altyapısı TEKRAR KULLANILDI, yeni bir sistem
  EKLENMEDİ:** Admin-tetikli "şifre sıfırlama bağlantısı gönder" eylemi,
  mevcut `createPasswordResetToken`/`consumePasswordResetToken`
  (`src/lib/auth/password-reset.ts`) altyapısını AYNEN kullanır — yalnızca
  30 dakikalık TTL ile. Davet e-postası da AYNI altyapıyı 7 günlük TTL ile
  kullanıyordu (önceki karar, korunuyor). İki ayrı token sistemi YOK.
- **Karar — erişim kapatma veri SİLMEZ:** Öğrenci erişimi kapatmak
  `StudentPortalAccess.status`'u `"revoked"` yapar (satır silinmez); öğretmen
  erişimi kapatmak `User.active = false` yazar (satır silinmez). Öğrenci/
  ders/ödeme/sözleşme/KVKK/yoklama/geçmiş verisi HİÇBİR durumda silinmez.
  Erişim yeniden açıldığında MEVCUT kayıt/hesap yeniden etkinleştirilir,
  YENİ bir kopya oluşturulmaz.
- **Karar — aynı e-posta çakışması:** Öğrenci tarafında aynı velinin
  e-postasının birden fazla çocuğa GUARDIAN erişimi için kullanılması
  BİLİNÇLİ OLARAK serbest bırakıldı (beklenen kullanım). Ancak bir e-posta
  zaten FARKLI bir role (öğretmen/admin) veya öğretmen tarafında FARKLI bir
  öğretmene bağlıysa davet/erişim engellenir — hesap eşlemesi asla
  bozulmadan (yazma işlemi yapılmadan) net bir hata mesajı gösterilir.
- **Bulunan ve düzeltilen hata (bu görev kapsamında, kod incelemesiyle):**
  `authenticateUser`'ın json/memory modu (STORE_MODE=json — Nilüfer Acar'ın
  BUGÜN kullandığı mod) dalı, yeni eklenen `activeOverrides` haritasını HİÇ
  kontrol ETMİYORDU — yani öğretmen erişimini kapatmak yalnızca EKRANDA
  "kapalı" gösteriyordu, girişi GERÇEKTEN engellemiyordu. `db` modu zaten
  doğruydu (`if (!row.active) return null`). Düzeltme: `src/lib/auth/users.ts`
  `authenticateUser` json/memory dalına aynı `active` kontrolü eklendi —
  artık her iki modda da tutarlı. Bu, görevin "erişimi kapatmak girişi HEMEN
  engellemeli" kuralının json modunda GERÇEKTEN karşılanması için zorunluydu.
- **İKİNCİ TUR (2026-08-31, CEO gerçek panelde denedi) — GERÇEK KÖK NEDEN
  BULUNDU VE DÜZELTİLDİ:** CEO mevcut bir öğrenciye portal daveti
  gönderirken "Kullanıcı hesabı oluşturulamadı/bulunamadı" hatası aldı. Kök
  neden: `provisionEntityLogin` yalnızca `STORE_MODE=db`'de yeni bir `User`
  satırı oluşturabiliyordu — "json/memory üretimde kullanılmıyor" yorumu
  YANLIŞTI, çünkü bugünkü TEK üretim modu `json` ve BOOTSTRAP/`HASHED`
  dizisi yalnızca ~15 demo hesabı kapsıyor. Yani BOOTSTRAP dışındaki
  (gerçekte neredeyse TÜM) öğrenci/öğretmen için davet ASLA çalışmıyordu.
  **Düzeltme:** yeni `src/lib/auth/dynamic-users.ts` — mevcut
  `StudentPortalAccess`/`PasswordResetToken` ile AYNI dosya-tabanlı kalıcı
  depo deseni — json/memory modunda da çalışma zamanında gerçek `User`
  satırı oluşturabiliyor. `authenticateUser`/`getUserIdByEmail`/`getUserById`/
  `getUserAccountStatus(ForTeacher)`/`setUserActive`/`updatePasswordHash`/
  `changeOwnPassword`/`findUserByEmail`/`getUserIdByTeacherId`/
  `getUserIdByStudentId` bu yeni depoyu da kontrol eder. Eski/bozuk
  `StudentPortalAccess` ilişkileri (User kaydı hiç yoksa — ör. bu hatanın
  DAHA ÖNCE oluşturmuş olabileceği kayıtlar) admin yeniden davet
  gönderdiğinde additive/idempotent biçimde "revoked" olarak işaretlenip
  onarılıyor, veri SİLİNMİYOR. Ayrıca CEO'nun kendi makinesinde çalıştırdığı
  test paketinde bulunan 4 başarısız test de düzeltildi — kök neden test
  tarafındaydı: bazı testler e-postası OLMAYAN sentetik bir userId ile
  "şifre sıfırlama e-postası gönder" akışını test etmeye çalışıyordu, bu da
  (doğru biçimde) "önce e-posta ekleyin" hatasına düşüyordu, e-posta
  gönderim/token testine hiç ulaşamıyordu — testler artık gerçek
  (dynamic-users üzerinden oluşturulan) bir hesap kullanıyor.
- **Kaynak:** CEO'nun 2026-08-31 tarihli "Portal Erişim Yönetimi" görev
  talebi (tam metin bu oturumun sohbet geçmişinde), bu oturumun kod
  incelemesi ve uygulaması.
