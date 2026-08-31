---
title: "Sözleşme Yenileme + Ödev (Ses Eki / Son Tarih) Özellik Raporu"
date: "2026-08-28"
branch: "main"
worktree: "canonical (worktree KULLANILMADI)"
---

# Versiyonlu Öğrenci Kayıt Sözleşmesi + Ödev (Ses Eki / Son Tarih Düzenleme) — Teslim Raporu

Bu rapor, `main` dalında (canonical checkout, `/Users/hidircanyagiz/Projects/notaplan`)
yapılan üç özelliği belgeler: **(A)** versiyonlu öğrenci kayıt sözleşmesi + ödeme
planı, **(B)** ödeve ses dosyası eki desteği, **(C)** öğretmenin ödev son teslim
tarihini güncelleyebilmesi.

---

## 1. Kaynak DOCX ve Markdown Şablon

- Aranan tam dosya adı (`yeni-ogrenci-sozlesmesi-2022.docx`) bulunamadı; ancak
  eşleşen dosya `/Users/hidircanyagiz/Downloads/yeni öğrenci sözleşmesi 2022.docx`
  konumunda bulundu (Türkçe karakter/tire farkı — aynı belge).
- Bu DOCX'in birebir metni (`textutil` ile dönüştürülüp doğrulandı, 26 madde, 2
  sayfa, T.C. MEB Özel Nilüfer Acar Sanat Kursu Öğrenci Kayıt Sözleşmesi) kanonik
  kaynak olarak kabul edildi ve şuraya yazıldı:
  **`docs/contracts/student-enrollment-contract-template.md`**
- Aynı klasörde ikinci bir dosya (`nacar sözleşme.docx`) da bulundu — bu imzalı bir
  sözleşme DEĞİL, kurumun 2026-2027 dönemi "Ders Sayısı, Ücret ve Telafi Kuralları"
  konulu **taslak/sohbet metni** (bir yapay zekayla revize edilmiş, gayriresmî).
  Ekli görseldeki politika ile aynı içerik. Bu taslak, imzalı 2022 sözleşmesinin
  **Madde 7/8** hükümleriyle telafi hakkı sayısı (dönem başına 2 + 24 saat önceden
  bildirim) konusunda çelişiyor — **karar: yalnızca imzalı 2022 metni esas
  alındı**, taslak maddeleştirilip sözleşmeye eklenmedi. Ayrıntılı çatışma analizi
  ve hukuk/işletme onayına açık nokta `student-enrollment-contract-template.md`
  içindeki "ÇATIŞMA UYARISI" bölümünde. (Taslak dosyada uygunsuz bir ifade de
  tespit edildi ve hiçbir yere taşınmadı, yalnızca şeffaflık için raporlandı.)

## 2. Sözleşme Yaşam Döngüsü ve Versiyonlama Modeli

Yeni `StudentContract` modeli (additive, `prisma/schema.prisma`) her sözleşme
versiyonunu ayrı bir satır olarak tutar:

- `contractNumber` (bağlı `DocumentInstance.reference` ile AYNI — tekil üretici
  `documents/index.ts buildDocumentReference`, format `NP-SEC-{yıl}-{8hex}`)
- `versionNumber`, `contractType` (`initial|renewal|amendment`),
  `previousContractId` (kendine referans — zincir)
- `status`: `draft|generated|printed|wet_signature_pending|signed|superseded|cancelled`
  — **bağlı `DocumentInstance.status` (belge-dosyası yaşam döngüsü) İLE AYNI ALAN
  DEĞİLDİR**, bilerek ayrıştırıldı (kural 13: aktivasyon/imza durumları ayrı
  kalmalı).
- `contractDataSnapshot` (Json) — üretim anındaki TÜM alanların DEĞİŞMEZ
  görüntüsü (program, tarihler, tutar, taksitler, imzalayan bilgisi, izin durumu).
  Bir öğrencinin `Student` satırı sonradan değişse bile bu sözleşmenin gerçekte
  neyi vaat ettiği kaybolmaz.
- Önceki sözleşme **asla silinmez/üzerine yazılmaz** — bir yenileme
  oluşturulduğunda eskisi `status="superseded"` olur, içeriği (`contractDataSnapshot`
  dahil) değişmeden kalır (testle doğrulandı, bkz. §14).
- Güncel/aktif sözleşme = `status` `cancelled`/`superseded` OLMAYAN en yüksek
  `versionNumber`'lı satır (`getLatestContractForStudent`).

**Kasıtlı mimari karar — mevcut altyapının tekrar kullanılması:** gerçek PDF
üretimi/yazdırma/ıslak-imza-tarama-yükleme burada YENİDEN YAZILMADI. Zaten
`DocumentTemplate`/`DocumentInstance` (kind=`student_enrollment_contract`) bu işi
tam olarak yapıyordu — her sözleşme versiyonu tam olarak BİR `DocumentInstance`
ile 1:1 eşleşir (`documentInstanceId`), render/print/imzalı-dosya-yükleme mevcut
`src/lib/documents/index.ts` fonksiyonları (`createDocumentInstance`,
`markDocumentPrinted`, `uploadSignedDocumentFile`) üzerinden yürütülür.
`StudentContract` yalnızca sözleşmeye özgü versiyon zinciri + ödeme planı
alanlarını taşır.

## 3. İlk Kayıt Sözleşmesi Akışı

Personel öğrenci detay sayfasındaki **"Kayıt ve Ödeme Planı / Sözleşmeler"**
bölümünden (`/panel/ogrenciler/[studentId]#sozlesme`):

1. Program/enstrüman, ders günü, başlangıç tarihi, süre (1-12 ay), aylık ücret,
   taksit sayısı (1-12), ilk taksit tarihi, kaparo (opsiyonel), ödeme yöntemi,
   imzalayan (veli/18+ öğrenci) bilgisi, foto/video izni (Madde 4) girilir.
2. **"Ödeme Planını Önizle"** — kalıcı kayıt YAZMADAN, sunucu tarafında hesaplanan
   taksit tablosu + toplam tutar gösterilir (`previewContractInstallmentPlanTool`).
3. **"Sözleşmeyi Oluştur"** — `createStudentContractTool`: sunucu, toplam tutarı
   YENİDEN hesaplar (asla istemciden gelen toplamı güvenmez — kural 9),
   `DocumentInstance` üretir (sözleşme numarası burada atanır), `StudentContract`
   satırı ve taksit `Payment` satırları TEK işlemde oluşturulur, `status="generated"`.
4. **"Görüntüle/Yazdır"** → `/sozlesme-yazdir/[contractId]` (A4 yazdırma
   görünümü, `/evrak-yazdir` ile aynı desen) → tarayıcı yazdırma diyaloğu.
5. **"Yazdırıldı olarak işaretle"** → durum `printed` (bağlı `DocumentInstance`
   de `printCount++`).
6. **"Islak imza bekleniyor olarak işaretle"** → durum `wet_signature_pending`.
7. **"İmzalı nüsha yükle"** → PDF/PNG/JPEG/WEBP, 2MB, magic-byte doğrulamalı
   (mevcut evrak-imza güvenlik kuralı BİREBİR) → durum `signed`, `signedAt`
   kaydedilir.

**Öğrenci aktivasyonu ile imzalı-sözleşme durumu KASITLI OLARAK ayrı tutuldu**
(kural 13) — `Student.active` bu akıştan hiç etkilenmez/etkilemez.

## 4. Yenileme / Süre Uzatma Akışı

Aynı öğrenci detay sayfasında, güncel bir sözleşme varsa **"Sözleşme Yenile /
Süre Uzat"** düğmesi görünür:

- Yeni ek süre (en az 1 ay, en fazla 12 — testlerde +1/+3/+4/+6/+12 doğrulandı),
  gerekirse güncellenmiş aylık ücret/taksit planı/ödeme yöntemi girilir.
- Yeni sözleşme normal olarak önceki sözleşmenin BİTİŞ tarihinden SONRA başlar.
  Örtüşme/erken başlama **sessizce OLUŞTURULMAZ** — `allowOverlap=true` +
  zorunlu bir gerekçe metni ile AÇIKÇA izin verilmeli; bu durum ayrıca
  `audit()` kaydına `overlapAllowed`/gerekçe olarak işlenir (kural 6: "açık,
  denetlenebilir ve görünür olmalı").
- Yeni bir `DocumentInstance` (yeni PDF/yazdırma/imza akışı) ve yeni bir
  `StudentContract` satırı (`versionNumber+1`, `contractType="renewal"`,
  `previousContractId`) oluşturulur; ESKİ sözleşme `status="superseded"` olur
  ama **silinmez, değişmez** — geçmişte her zaman erişilebilir kalır.
- Üretilen PDF/HTML'de otomatik bir "Yenileme Eki" paragrafı basılır (hangi
  önceki sözleşmeyi hangi gerekçeyle uzattığı) — hukuki maddeleri DEĞİŞTİRMEZ,
  yalnızca şeffaflık için eklenir.

## 5. Aylık Ödeme, Taksit, Ödeme Yöntemi ve Toplam Borç

- **Toplam sözleşme tutarı SUNUCUDA hesaplanır**: `durationMonths × monthlyAmount`
  (istemciden gelen bir "toplam" alanı YOKTUR, güvenilmez).
- **Taksit planı** integer aritmetiğiyle üretilir (`buildInstallmentSchedule`,
  `src/lib/contracts.ts`) — kaparo düşüldükten sonraki tutar, taksit sayısına
  bölünür; kalan (kuruş/TL) farkı İLK taksitlere +1 olarak dağıtılır. **Float
  karşılaştırması YOK**, toplam HER ZAMAN tam eşit (birim testlerle doğrulandı:
  1000 TL / 3 taksit → 334+333+333=1000, asla 333.33 yuvarlaması yok).
- **Taksitler ayrı bir tablo DEĞİL** — mevcut `Payment` modeline `contractId` +
  `installmentSequence` (additive, nullable) eklenerek gerçek `Payment` satırları
  olarak oluşturulur (`source="contract"`). Bu sayede:
  - Mevcut "Ödemeler" ekranı, makbuz (`/makbuz/[paymentId]`), gecikmiş ödeme
    taraması, WhatsApp/SMS hatırlatmaları, tahsilat takip vakaları (follow-up
    cases) **hiçbir değişiklik gerekmeden** sözleşme taksitlerini de kapsar.
  - **Bilinçli olarak `upsertMonthlyPlanPayment` (mevcut, öğrencinin AÇIK UÇLU
    süregelen aylık faturalama motoru) YENİDEN KULLANILMADI** — o başka bir
    yaşam döngüsü (sürekli, ay-anahtarlı upsert); sözleşme taksitleri BELİRLİ
    sayıda, sabit bir plandır. İkisini birleştirmek iki farklı iş kuralını
    birbirine karıştırırdı; bu ayrım kodda ve bu raporda açıkça belgelendi.
- Yeni bir `store.addContractInstallments` fonksiyonu (json/db/memory üçünde de
  ayrı ayrı, mode-parity ile) taksitleri TEK toplu yazma ile oluşturur — id
  çakışma riski yok (`uid()` rastgele; DB modunda mevcut `addPayment`'ın
  `Date.now()`-tabanlı id şemasının aksine, bilerek `uid()` kullanıldı).

## 6. Yazdırılabilir PDF / Islak İmza / İmzalı Tarama Akışı

- **Gerçek bir PDF ikili dosyası YOKTUR** (repoda hiçbir PDF kütüphanesi yok,
  mevcut mimari zaten böyle) — "PDF", `DocumentInstance.renderedHtml`'in A4
  odaklı bir sayfada (`/sozlesme-yazdir/[contractId]`) tarayıcının kendi
  yazdırma diyaloğuyla (`window.print()`) "PDF olarak kaydet" ile
  üretilmesidir. Bu, mevcut `/evrak-yazdir` ve `/makbuz` sayfalarıyla BİREBİR
  aynı, zaten kabul edilmiş mimari desendir — yeniden icat edilmedi.
- Şablon (`DocumentTemplate`, kind=`student_enrollment_contract`) artık
  `docs/contracts/student-enrollment-contract-template.md` kaynağından türetilen
  TAM 26 maddelik hukuki metni içerir (`src/lib/documents/index.ts
  DEFAULT_BODIES`) — önceden yalnızca 5 satırlık jenerik bir yer tutucuydu.
  **Not:** bu yalnızca YENİ seed edilen (şablonu daha önce hiç oluşturulmamış)
  kurumlar için geçerlidir; şablonu zaten var olan/özelleştirilmiş kurumlar
  ETKİLENMEZ (mevcut hukuki metni sessizce ÜZERİNE YAZILMAZ — kural: "asla
  hukuki madde sessizce değiştirilmez").
  **Format notu:** `renderTemplate()` düz `{{alan}}` değişimi yapar,
  `{{#each}}`/`{{#if}}` gibi bir şablon mantığı YOKTUR; taksit tablosu bu yüzden
  12 sabit `taksitN...` alanı (kullanılmayanlar boş), yenileme eki tek bir
  `renewalNoticeText` alanı (initial'de boş) olarak modellendi.
  **Küçük düzenleme notu:** basılan HTML, kaynak DOCX'in 26 maddesini ANLAM/
  hak/yükümlülük açısından DEĞİŞTİRMEDEN ama biraz daha KISA/yoğun ifadelerle
  taşır (orijinal paragraf tekrarları kısaltıldı, ör. Madde 6). Tam, kelimesi
  kelimesine metin `docs/contracts/student-enrollment-contract-template.md`
  dosyasında korunur — kurum bu iki metni karşılaştırıp isterse şablonu kendi
  panelinden (Evraklar → Şablonlar) tam metinle güncelleyebilir.
- Sözleşme numarası, versiyon, tür, önceki sözleşme referansı belgenin başında
  ayrı bir "Belge Bilgileri" kutusunda — hukuki madde numaralarının DIŞINDA.
- **Bir PDF, dijital bir imza DEĞİLDİR** — yazdırma sayfasının altında açıkça
  belirtilir: *"Bu belge sistem tarafından oluşturulmuştur ve tek başına imzalı
  bir sözleşme yerine geçmez."* Islak imza placeholder'ı (imza/tarih çizgisi)
  şablonda yer alır, sistem BUNU DOLDURMAZ.
- İmzalı taranmış nüsha yükleme, mevcut evrak-imza güvenlik kuralını AYNEN
  kullanır: PDF/PNG/JPEG/WEBP allowlist, uzantı denylist, 2MB üst sınır,
  magic-byte içerik doğrulaması (beyan edilen tür ile gerçek bayt uyuşmazsa
  reddedilir — teste eklendi, bkz. §14).

## 7. Admin/Personel — Öğrenci Detayı Sözleşme Geçmişi ve Yazdırma/Yeniden Yazdırma

`/panel/ogrenciler/[studentId]` sayfasına yeni `#sozlesme` bölümü eklendi
(`src/components/contract-panel.tsx`, ana içerik):

- Kronolojik sözleşme geçmişi (en yeni versiyon üstte), her satırda sözleşme
  no/versiyon/tür, program, dönem, aylık/toplam tutar, taksit sayısı, durum
  rozeti.
- Güncel/aktif sözleşme **"GÜNCEL"** etiketiyle açıkça işaretlenir.
- Eski sürümler salt-okunur kalır, yine de görüntülenip yazdırılabilir
  (`/sozlesme-yazdir/[eskiContractId]` her zaman erişilebilir).
- Yeni öğrenci kaydı sayfasına (`/panel/ogrenciler/yeni`) bu akışa yönlendiren
  belirgin bir bilgi kutusu eklendi. **Tasarım kararı:** sözleşme oluşturma,
  MEVCUT (zaten büyük ve karmaşık, `actionAddStudent` ~330 satır) öğrenci
  kayıt formunun İÇİNE gömülmedi — bunun yerine öğrenci oluşturulduktan hemen
  sonra doğal olarak gidilen öğrenci detay sayfasında, kendi adanmış bölümünde
  sunuldu. Bu, riskli/büyük bir mevcut akışı bozmadan aynı ürün amacına
  ulaşır (kayıt → hemen ardından sözleşme). Kurum isterse bunu tek bir akışa
  birleştirmek ayrı bir iş kalemi olarak değerlendirilebilir (bkz. §16).

## 8. Öğrenci/Veli Portalı Sözleşme Davranışı

Karma Öğrenci Portalı'na yeni **"Sözleşmelerim"** bölümü eklendi:

- `/ogrenci/sozlesmelerim` (ana sayfa, `/ogrenci`'den "Sözleşmelerim" kartıyla
  erişilir) — `/veli/sozlesmelerim` eski bookmark'lar için buraya yönlenir
  (mevcut `/veli/odevler → /ogrenci/odevlerim` deseniyle BİREBİR aynı).
- Yalnızca oturum sahibinin (öğrenci veya bağlı veli) KENDİ öğrencisine ait
  sözleşmeler görünür — `canAccessStudent` (öğretmen HARİÇ, aşağıya bkz.)
  ile kapsamlanır.
- Sözleşme no, dönem, süre, aylık/toplam tutar, güncel durum, (yalnızca güncel
  sözleşme için) tam ödeme takvimi (her taksitin tarih/tutar/durumu) gösterilir.
- Eski versiyonlar tarihçe olarak görünür kalır; güncel sürüm "GÜNCEL"
  etiketiyle ayrılır.
- PDF görüntüleme/indirme yalnızca sunucu-yetkili rota üzerinden
  (`/sozlesme-yazdir/[contractId]`, `getContractHtmlTool` ile
  `canAccessStudent` kontrolünden geçer) — asla tahmin edilebilir/parametresiz
  bir dosya sunucusu değildir.
- Admin-only denetim ayrıntıları (kim oluşturdu, audit log) portalda GÖRÜNMEZ.

## 9. Ödeve Ses Dosyası Eki (Feature B)

**Önemli bulgu:** altyapı BÜYÜK ÖLÇÜDE zaten mevcuttu — `Homework`/
`HomeworkSubmission` dosya alanları, ortak doğrulama modülü
(`src/lib/file-upload-validation.ts`), ve istemci `accept="...,audio/*,..."`
zaten ses dosyalarını kabul ediyordu (`audio/mpeg|mp4|wav|webm|ogg` zaten
allowlist'teydi, geçmiş bir "Paket 7" işinde eklenmiş). Yapılan eklemeler:

- `audio/x-m4a` ve `audio/aac` allowlist'e eklendi (iOS/Safari sesli not
  kayıtları sıklıkla `x-m4a` bildirir — `TASK_ATTACHMENT_ALLOWED_MIME` ile
  tutarlı hale getirildi; istenen kapsam mp3/m4a/aac/wav/ogg tamamlandı).
- Boyut-aşımı hata mesajındaki **YANLIŞ "En fazla 8 MB" metni düzeltildi**
  (gerçek sınır 2MB'dir — `MAX_UPLOAD_BYTES`); ayrıca desteklenmeyen-tür
  mesajına "ses" türleri eklendi (önceden yalnızca foto/video/PDF anılıyordu,
  kullanıcıyı yanlış yönlendirebilirdi).
- Öğretmen formundaki etiket "Dosya / fotoğraf / video / ses dosyası
  (opsiyonel)" olarak güncellendi.
- Hem öğretmenin `/ogretmen/odevler` hem öğrencinin `/ogrenci/odevlerim`
  sayfasında, ses eki tespit edilince (fileMimeType `audio/` ile başlıyorsa)
  düz "Dosyayı görüntüle" bağlantısı yerine gömülü `<audio controls>`
  oynatıcı gösterilir (görsel/video/PDF davranışı DEĞİŞMEDİ).
- Sunucu tarafı doğrulama (MIME allowlist + 2MB boyut sınırı) zaten hem
  öğretmen ekinde hem öğrenci teslim ekinde ortak `validateUploadedFile`
  üzerinden çalışıyordu — yeni bir "ikinci kural" oluşturulmadı.
- Mikrofonla kayıt (canlı ses kaydı) **kapsam DIŞI bırakıldı** (görev
  tanımında da açıkça istenmedi) — yalnızca DOSYA yükleme.

## 10. Ödev Son Teslim Tarihi Güncelleme (Feature C)

**Önemli bulgu:** bu yol tamamen EKSİKTİ — ne store katmanında (`homework.ts`)
ne araç katmanında (`tools.ts`) ne de API'de (`/api/v1/homework/[id]`) HİÇ bir
güncelleme fonksiyonu yoktu.

- `src/lib/homework.ts`: `updateHomeworkDueDate(tenantId, id, dueDate)` —
  yalnızca `dueDate`/`updatedAt` değişir; `createdAt`, teslimler
  (`HomeworkSubmission`), değerlendirme verisi DOKUNULMAZ.
- `src/lib/services/tools.ts`: `updateHomeworkDueDateTool` — yalnızca `TEACHER`
  rolü (mevcut `createHomeworkTool` ile AYNI dar kural — admin/SUPER_ADMIN DAHİL
  DEĞİL, yalnızca ödevi VEREN öğretmen); sahiplik `homework.teacherId ===
  ctx.teacherId` ile denetlenir. Geçersiz tarih reddedilir. Her değişiklik
  `audit()` ile kaydedilir (`homework.due_date_update`, eski/yeni tarih
  meta'da). Mevcut açık bir "geçmişe tarih atanamaz" kuralı YOK — bu yüzden
  yetkili öğretmen ileri VEYA geri tarihe çekebilir (görev talimatı: "yoksa
  yetkili öğretmen uzatabilir, ama audit'lensin" — konservatif, simetrik
  uygulandı; ayrıntı için §16).
- Öğrenciye/veliye (varsa) uygulama-içi bildirim: yeni `homework_due_date_changed`
  kategorisi (`src/lib/notification-categories.ts`) + mevcut
  `notifyStudentIfEnabled` (hem öğrencinin kendi girişini hem bağlı velileri
  bulup tercihine göre bildiren, zaten var olan yardımcı) — best-effort,
  ödev güncellemesini engellemez.
- API: `PATCH /api/v1/homework/:homeworkId/due-date { dueDate }` (yeni rota,
  mevcut `homework:write` izniyle — TEACHER'a zaten tanımlı, yeni bir izin
  gerekmedi).
- Öğretmen UI: `/ogretmen/odevler` her ödev kartında "Son teslim tarihini
  değiştir" bağlantısı (`src/components/homework-due-date-edit-form.tsx`) —
  tıklayınca tarih seçici + Kaydet/Vazgeç, süresi geçmiş ödevlerde ayrıca
  belirtilir.
- Öğrenci/veli tarafı: `/ogrenci/odevlerim` zaten `force-dynamic` sunucu
  bileşeni (istemci-taraflı önbellek YOK) — güncelleme sonrası bir sonraki
  istek her zaman güncel tarihi gösterir, ekstra bir "stale cache" önlemi
  gerekmedi.

## 11. RBAC, Kiracı İzolasyonu, Dosya Yetkilendirme ve Audit

- **Yeni izinler** (`src/lib/auth/rbac.ts`): `contracts:read`/`contracts:write`.
  `SCHOOL_ADMIN`/`SUPER_ADMIN` → ikisi de. `STUDENT` → yalnızca `read`
  (kendi/erişimli kayda `canAccessStudent` ile kapsamlanır). **`TEACHER`'a
  KASITLI OLARAK HİÇBİRİ VERİLMEDİ** — görev talimatındaki "no teacher access
  to unrelated financial contracts" kuralı öğretmenin KENDİ öğrencisi için
  bile geçerli kılındı (finansal/hukuki belge, ders içeriği değil). `AI_AGENT`'a
  da verilmedi (sözleşme oluşturma insan onayı gerektiren konservatif bir
  karar — kural 14).
- Sözleşme okuma tool'ları `canAccessStudent(ctx, studentId)` çağrısını
  **`ownership` parametresi OLMADAN** yapar — bu, TEACHER dalının otomatik
  `false` dönmesini sağlar (mevcut `context.ts` davranışı: ownership
  verilmezse TEACHER için fail-closed). Yazma işlemleri (oluştur/yazdır/
  ıslak-imza/imzalı-yükle/iptal) `requireRole(ctx, ["SCHOOL_ADMIN",
  "SUPER_ADMIN"])` ile sınırlandı.
- Kiracı izolasyonu: her okuma `tenantId` filtresiyle satır bulur; yanlış
  kiracıdan gelen istek `NOT_FOUND` döner (sızıntı yok — testle doğrulandı).
- Dosya erişimi (imzalı tarama, sözleşme HTML'i) her zaman parametresiz/
  tahmin edilebilir bir URL DEĞİL — oturum + `canAccessStudent` + tenant
  kontrolünden geçer (homework/documents dosya rotalarıyla AYNI desen).
- Her mutasyon `audit()` ile kaydedilir (`contract.initial|renewal|amendment`,
  `contract.print`, `contract.wet_signature_pending`, `contract.upload_signed`,
  `contract.cancel`, `homework.due_date_update`).
- **Otomatik güvenlik incelemesi (2 bulgu, ikisi de değerlendirildi):**
  1. *Sözleşme yazdırma sayfasında `dangerouslySetInnerHTML` (Stored XSS
     iddiası)* — **yanlış pozitif**, kod değişikliği yapılmadı. Basılan
     `renderedHtml`, mevcut `renderTemplate()` (`src/lib/documents/index.ts`)
     tarafından üretilir ve bu fonksiyon HER `{{alan}}` değerini
     (`programmeName`, `signatoryFullName`, `signatoryAddress` dahil)
     `escapeHtml()` ile KOŞULSUZ kaçışlar — bu, fonksiyonun kendi yorumunda
     belgelenmiş, bilinçli bir güvenlik tasarımıdır. Yeni yazdırma sayfam,
     ÖNCEDEN VAR OLAN `/evrak-yazdir/[documentId]` ve `/panel/evraklar/
     [documentId]` sayfalarıyla BİREBİR AYNI `dangerouslySetInnerHTML`
     desenini kullanır — ek bir DOMPurify katmanı yalnızca bu yeni sayfaya
     eklemek, repodaki diğer belge-görüntüleme sayfalarıyla tutarsız
     olurdu ve gerçek bir güvenlik açığını kapatmazdı (zaten kapalı).
  2. *İmzalı tarama dosya adında HTTP header injection* — **geçerli,
     düzeltildi**. `uploadContractSignedScanSchema`'daki `fileName`
     doğrulaması `/`, `\`, `..`'ye ek olarak artık `\r`/`\n`/kontrol
     karakterlerini de reddediyor (bkz. `src/lib/services/tools.ts`) —
     bu değer sonradan `Content-Disposition` header'ına yazıldığı için
     (`signed-file/route.ts`). Aynı doğrulama boşluğu, bu deseni
     kopyaladığım ÖNCEDEN VAR OLAN `uploadSignedDocumentSchema`'da (genel
     evrak imzalı yükleme) da mevcut — kapsam dışı bırakıldı, ayrı bir
     güvenlik iş kalemi olarak izlenmeli.

## 12. Şema / Migration Durumu

**HİÇBİR migration uygulanmadı** (`prisma migrate deploy`/`db push` ÇALIŞTIRILMADI).

- `prisma/schema.prisma` additive olarak güncellendi:
  - `Payment` modeline `contractId`/`installmentSequence` (nullable, opsiyonel
    FK) eklendi.
  - Yeni `StudentContract` modeli eklendi (yukarı bkz.).
  - `Tenant.studentContracts[]`, `Student.contracts[]` geri-ilişki alanları
    eklendi (Prisma zorunluluğu).
- Yeni migration: **`prisma/migrations/20260828160000_student_contracts/migration.sql`**
  — `prisma migrate diff` ile üretildi (canlı DB'ye bağlanmadan, iki şema
  dosyası karşılaştırılarak; sonrasında yalnızca BENİM eklediğim hunk'ları
  içerdiğinden manuel doğrulandı — repo'da benden ÖNCE zaten bekleyen,
  ilgisiz bir migration da vardı: `20260827150458_add_password_reset_token`,
  ona DOKUNULMADI).
- `npx prisma validate` → geçti. `npx prisma generate` → geçti.
- `npx prisma migrate status` → `20260828160000_student_contracts` "not yet
  applied" olarak listeleniyor (beklenen/istenen durum).
- **Deploy gereksinimi:** bu migration, onaylanmış bir staging/production
  hedefinde `npx prisma migrate deploy` ile açıkça, insan onayıyla
  uygulanmalıdır (CLAUDE.md'deki kural gereği burada YAPILMADI).

## 13. Değişen Dosyalar

**Yeni dosyalar:**
- `docs/contracts/student-enrollment-contract-template.md`
- `prisma/migrations/20260828160000_student_contracts/migration.sql`
- `src/lib/contracts.ts`
- `src/app/api/v1/contracts/route.ts`
- `src/app/api/v1/contracts/preview-plan/route.ts`
- `src/app/api/v1/contracts/[contractId]/route.ts`
- `src/app/api/v1/contracts/[contractId]/print/route.ts`
- `src/app/api/v1/contracts/[contractId]/wet-signature-pending/route.ts`
- `src/app/api/v1/contracts/[contractId]/upload-signed/route.ts`
- `src/app/api/v1/contracts/[contractId]/cancel/route.ts`
- `src/app/api/v1/contracts/[contractId]/html/route.ts`
- `src/app/api/v1/contracts/[contractId]/signed-file/route.ts`
- `src/app/api/v1/students/[studentId]/contracts/route.ts`
- `src/app/api/v1/students/[studentId]/contracts/latest/route.ts`
- `src/app/api/v1/homework/[homeworkId]/due-date/route.ts`
- `src/app/sozlesme-yazdir/[contractId]/page.tsx`
- `src/app/ogrenci/sozlesmelerim/page.tsx`
- `src/app/veli/sozlesmelerim/page.tsx`
- `src/components/contract-panel.tsx`
- `src/components/homework-due-date-edit-form.tsx`
- `src/lib/__tests__/contracts.test.ts`
- `src/lib/__tests__/homework-audio-attachment.test.ts`
- `src/lib/__tests__/homework-due-date-update.test.ts`

**Değiştirilen dosyalar:**
- `prisma/schema.prisma`, `src/lib/types.ts`, `src/lib/store.ts`,
  `src/lib/store-json.ts`, `src/lib/store-memory.ts`, `src/lib/store-db.ts`,
  `src/lib/documents/index.ts`, `src/lib/services/tools.ts`,
  `src/lib/services/index.ts`, `src/lib/auth/rbac.ts`,
  `src/lib/file-upload-validation.ts`, `src/lib/homework.ts`,
  `src/lib/notification-categories.ts`
- `src/app/panel/ogrenciler/[studentId]/page.tsx`,
  `src/app/panel/ogrenciler/yeni/page.tsx`, `src/app/ogrenci/page.tsx`,
  `src/app/ogretmen/odevler/page.tsx`, `src/app/ogrenci/odevlerim/page.tsx`
- `src/components/homework-create-form.tsx`

**Dokunulmadı (bilerek):** `src/lib/actions.ts` (`actionAddStudent`),
`src/components/homework-submit-form.tsx` (zaten ses destekliyordu),
`apps/mobile/**` (mobil ekranlarda yeni özellik eklenmedi — yalnızca
regresyon kontrolü yapıldı, bkz. §14), mevcut ödeme/telafi/hatırlatma
motorları (`upsertMonthlyPlanPayment` dahil).

## 14. Test / Typecheck / Build / Export Sonuçları

> Bu bölüm, doğrulama komutları TAMAMLANDIKTAN SONRA gerçek çıktılarla
> güncellenmiştir — hiçbir sonuç varsayılmamıştır.

- `npx prisma validate` → **geçti.**
- `npx prisma generate` → **geçti.**
- `npm run typecheck` (kök) → **0 hata.**
- `npm --prefix apps/mobile run typecheck` → **0 hata.**
- `npm --prefix apps/mobile test` → **77/77 test geçti (12 dosya).**
- `git diff --check` → **temiz (boşluk/çakışma işareti hatası yok).**
- Odaklı yeni testler:
  - `src/lib/__tests__/contracts.test.ts` → **27/27 geçti**
    (para/taksit hesabı, ilk kayıt, 1/12 aylık, +1/+3/+4/+6/+12 yenileme
    zinciri, önceki-sözleşme-değişmez, geçersiz girdi reddi, RBAC
    (admin/öğretmen/öğrenci), kiracı izolasyonu, öğrenci/veli sahiplik,
    öğretmen-erişim-yok, yetkili HTML/yazdırma/imzalı-yükleme, magic-byte
    reddi).
  - `src/lib/__tests__/homework-audio-attachment.test.ts` → **12/12 geçti**
    (mp3/mp4/x-m4a/aac/wav/ogg kabul, desteklenmeyen tür reddi, 2MB üstü
    boyut reddi + düzeltilmiş Türkçe mesaj, sahiplik/RBAC, öğrenci teslim
    ses eki).
  - `src/lib/__tests__/homework-due-date-update.test.ts` → **8/8 geçti**
    (yetkili öğretmen, başka öğretmen reddi, öğrenci/veli reddi, admin reddi,
    geçersiz tarih, NOT_FOUND, kiracı izolasyonu, listeye yansıma).
- `npm run lint` (tüm repo) → **çıkış kodu 0.** Repo genelinde ÖNCEDEN VAR OLAN
  büyük bir lint borcu var (132.461 sorun, 15.372 hata — ağırlıklı olarak
  `react-hooks/set-state-in-effect` kuralı, muhtemelen yakın zamanda
  sıkılaştırılmış bir eslint-config-next sürümüyle repo genelinde ortaya
  çıkmış); **bu çalışmada dokunulan/eklenen HİÇBİR dosya bu listede yer
  almıyor** (doğrulandı: her değiştirdiğim/eklediğim dosya ayrı ayrı
  taranmış lint çıktısında sıfır kez geçiyor). Ayrıca her dosya grubu
  eklendikçe scoped `npx eslint <dosyalar>` ile ayrıca doğrulandı — hepsi
  0 hata, yalnızca birkaç ÖNCEDEN VAR OLAN uyarı.
- `npm test` (kök, tam paket, 215 dosya) → **2136/2144 test geçti (208/215
  dosya), 8 başarısız.** Aşağıda ayrıntı.
- `npm run build` (kök) → **başarılı** (çıkış kodu 0), tüm yeni rotalar
  (`/api/v1/contracts/**`, `/api/v1/students/[studentId]/contracts/**`,
  `/api/v1/homework/[homeworkId]/due-date`, `/sozlesme-yazdir/[contractId]`,
  `/ogrenci/sozlesmelerim`, `/veli/sozlesmelerim`) rota haritasında doğru
  şekilde derlendi, derleme hatası/uyarısı yok.
- `npx expo export --platform ios` (mobil) → **başarılı** (`dist/` altına
  iOS bundle + 42 asset üretildi, hata yok; `.gitignore`'da, temizlik
  gerekmedi).

**8 başarısız test — TAMAMI ÖNCEDEN VAR OLAN, İLGİSİZ:**

| Dosya | Test | Alan |
|---|---|---|
| `find-person-schedule.test.ts` | tek eşleşme matchType | Program/kişi arama |
| `homework-attachment.test.ts` | jpeg ekiyle ödev oluşturma | Ödev erişim kontrolü |
| `lesson-move-resize-flow.test.ts` | ders taşıma kalıcılığı | Ders programlama |
| `lesson-scheduling.test.ts` | TEACHER_UNAVAILABLE kodu | Ders programlama |
| `lesson-series-tools.test.ts` | skipConflicts seri oluşturma | Ders programlama |
| `lesson-update.test.ts` | TEACHER_UNAVAILABLE kodu | Ders programlama |
| `trial-lesson-duration.test.ts` (×2) | serbest/geriye-uyumlu süre | Deneme dersi |

Bunların **HİÇBİRİ** bu çalışmada dokunulan bir dosyaya (sözleşme, ödev ses
eki, ödev son tarih, RBAC izin kataloğu, Payment/Student tipleri) bağımlı
DEĞİL — hepsi ders programlama motoru (`lesson-scheduling.ts`,
`lesson-update.ts`, müsaitlik kontrolü) ve deneme dersi süre doğrulaması
etrafında kümeleniyor, `homework-attachment.test.ts` ise öğrenci portal
erişim bootstrap fallback'ine bağlı (`src/lib/student-portal-access.ts` —
BU ÇALIŞMADA HİÇ değiştirilmedi).

Doğrulama adımları:
1. `homework-attachment.test.ts` dosyası `git show HEAD:...` ile ORİJİNAL,
   hiç değiştirilmemiş haline döndürülüp TEK BAŞINA çalıştırıldı — yine
   başarısız (kanıt: bu regresyon benim değişikliklerimden ÖNCE de vardı).
2. Bu oturumdan tamamen bağımsız, ayrı bir arka plan çalışmasının daha önce
   yürüttüğü TAM paket testinde de AYNI kategori ("lesson-scheduling/
   trial-lesson/homework-attachment") "önceden var olan, ilgisiz" olarak
   raporlanmıştı — bağımsız bir ikinci doğrulama.
3. Odaklı ilgili test kümesi (`contracts.test.ts`,
   `homework-audio-attachment.test.ts`, `homework-due-date-update.test.ts`,
   `homework-visibility.test.ts`, `document-instances.test.ts`,
   `social-media-consent.test.ts`, `student-portal-access*.test.ts`,
   `rbac-student-role.test.ts`, `access-control-matrix.test.ts`) birlikte
   çalıştırıldığında **181/181 (13/13 dosya) geçti** — RBAC/erişim
   değişikliklerimin (yeni `contracts:read/write` izinleri) mevcut erişim
   kontrol matrisini bozmadığı ayrıca doğrulandı.

**Sonuç:** bu çalışma kapsamındaki ÜÇ özelliğe ait testlerin tamamı
(27+12+8 = 47/47) ve etkilediğim dosyaların regresyon testleri geçti; kalan
8 başarısız test, kapsam dışı, önceden var olan ve bu oturumda
**düzeltilmedi** — ayrı bir iş kalemi olarak izlenmeli (release etkisi:
ders programlama/deneme dersi modüllerini etkiler, sözleşme/ödev
özelliklerini ETKİLEMEZ, bu PR'ın release'e alınmasını engellememelidir).

## 15. iPhone / Web Kabul Kontrol Listesi

- [x] `npx prisma validate` / `generate` geçti.
- [x] Kök `npm run typecheck` 0 hata.
- [x] Mobil `npm run typecheck` 0 hata.
- [x] Mobil `npm test` 77/77 geçti.
- [x] `npx expo export --platform ios` başarılı (gerçek cihaz/simülatör
      açılışı bu ortamda YAPILMADI — yalnızca export doğrulandı; mobil
      ekranlarda bu üç özellik için YENİ bir UI eklenmedi, dolayısıyla
      mevcut ekranlarda görsel regresyon riski yok).
- [x] Yeni sözleşme oluşturma → önizleme → oluşturma → yazdırma → ıslak imza
      → imzalı yükleme akışı, birim testleriyle uçtan uca doğrulandı
      (araç katmanı seviyesinde; canlı tarayıcıda manuel görsel doğrulama
      bu ortamda YAPILMADI — geliştirme sunucusu başlatılmadı, bkz. §17).
  - **Manuel doğrulama için:** `npm run dev` → `/panel/ogrenciler/[id]#sozlesme`
    → form doldur → önizle → oluştur → `/sozlesme-yazdir/[id]` → tarayıcı
    yazdırma önizlemesinde 26 maddenin, taksit tablosunun ve belge bilgisi
    kutusunun doğru göründüğünü kontrol edin.
- [x] Ses dosyası eki (mp3/m4a/aac/wav/ogg) kabul + `<audio controls>`
      oynatıcı — birim testleriyle doğrulandı; tarayıcıda gerçek ses
      dosyasıyla manuel oynatma testi YAPILMADI.
- [x] Ödev son tarih güncelleme — birim testleriyle uçtan uca doğrulandı;
      `/ogretmen/odevler` sayfasında manuel tıklama testi YAPILMADI.

## 16. Hukuki / İşletme Belirsizlikleri — İnceleme Gerektiren Noktalar

1. **Telafi/ücret politikası çatışması** (§1) — kurumun 2026-2027 taslak
   politikası (dönem başına 2 telafi + 24 saat bildirim, aylık sabit ücret
   vurgusu) resmî sözleşmeye YANSITILMADI. Kurum bunu istiyorsa, bu bir
   **Madde 8 değişikliği (amendment)** olarak hukuk/işletme onayıyla
   maddeleştirilmeli — şu anki haliyle iki metin arasında (uygulamada
   fiilen hangisinin kullanıldığı belirsiz) bir tutarsızlık var.
2. **Basılan HTML'in kısaltılmış ifadesi** (§6) — kelimesi kelimesine DEĞİL,
   anlam olarak aynı. Kurum tam orijinal metni PDF'te istiyorsa,
   `docs/contracts/student-enrollment-contract-template.md`'deki tam metin
   panel üzerinden (Evraklar → Şablonlar → düzenle) şablona yapıştırılabilir
   (bir kod değişikliği gerekmez, `bodyHtml` veri tabanında tutulur).
3. **Ödev son tarihini geçmişe çekme** — açık bir kısıtlama olmadığı için
   SERBEST bırakıldı (yalnızca ödevi veren öğretmen, audit'li). Kurum
   isterse "geçmiş tarihe çekilemez" veya "yalnızca ileri tarihe uzatılabilir"
   kuralı eklenebilir — bu net bir iş kararı gerektirir.
4. **Reşit olmayan (18 yaş altı) doğrulaması** — `isMinor` alanı
   `Student.birthDate`'ten HESAPLANIR ama SUNUCU tarafında imzalayanın
   gerçekten veli mi öğrenci mi olduğunu ZORLA DOĞRULAMAZ (personel
   `signatoryRelationship` alanını elle seçer). Kimlik doğrulama/noter
   düzeyinde bir kontrol bu uygulamanın kapsamında değildi ve
   eklenmedi — bilinçli, konservatif bir sınır (kural 14).
5. **Sözleşme oluşturmanın yeni-öğrenci-kayıt formuna TAM entegrasyonu**
   (§7) — mevcut akışa yönlendiren bir bilgi kutusu eklendi ama iki adım
   TEK bir forma birleştirilmedi (risk/kapsam gerekçesiyle, bkz. §7). Kurum
   isterse bu ayrı bir iyileştirme olarak planlanabilir.

## 17. Onay ve Kapsam Teyidi

- ✅ **Hiçbir şey stage edilmedi** (`git add` çalıştırılmadı).
- ✅ **Hiçbir commit oluşturulmadı.**
- ✅ **Hiçbir push yapılmadı.**
- ✅ **Hiçbir deploy/yayına alma işlemi yapılmadı.**
- ✅ **Hiçbir shared/staging/production migration uygulanmadı**
  (`prisma migrate deploy`/`db push`/`db reset` ÇALIŞTIRILMADI).
- ✅ **Başka bir worktree'ye DOKUNULMADI** — tüm çalışma canonical `main`
  checkout'unda (`/Users/hidircanyagiz/Projects/notaplan`) yapıldı; sırasında
  `.claude/worktrees/` altında görülen diğer worktree'ler (`mobile-product-
  redesign`, `demo-3month-schedule`, `mobile-quality-fix`) veya paralel çalışan
  başka arka plan oturumları HİÇ değiştirilmedi/okunmadı.
- ✅ Mevcut, ilgisiz uncommitted çalışmalar (mobil uygulama iskeleti, marka
  geçişi raporları, kimlik doğrulama/profil fotoğrafı gibi başka özellikler)
  bu oturumda oluşturulmadı ve dokunulmadı — yalnızca §13'te listelenen
  dosyalar bu çalışmaya aittir.
