---
title: "Admin Web — Kayıt, Ödeme Planı, Sözleşme, Yenileme, Davet ve Ödev Paketi — Teslim Raporu"
date: "2026-08-29"
branch: "main"
worktree: "canonical (worktree KULLANILMADI)"
---

# Admin Web — Kayıt / Ödeme Planı / Sözleşme / Yenileme / Davet / Ödev Paketi

Bu rapor `main` dalında (canonical checkout, `/Users/hidircanyagiz/Projects/notaplan`) yapılan
işi belgeler. Görev talebi, **aynı gün önceki iki oturumda zaten büyük ölçüde tamamlanmış** bir
paket (versiyonlu sözleşme + yenileme zinciri, trial/formal eşiği, hesap daveti, ödev ses eki/son
tarih güncelleme, üretim hazırlığı dokümanı — bkz. `docs/contracts/CONTRACT_RENEWAL_AND_HOMEWORK_FEATURE_REPORT.md`
ve `docs/contracts/CONTRACT_RENEWAL_INVITATION_AND_HOMEWORK_REPORT.md`) üzerine, çok daha
ayrıntılı yeni bir şartname (kesin ödeme penceresi kuralları, "metadata-only PDF" hata iddiası,
başlık/dosya adı biçimi, hızlı sözleşme CTA'sı, şablon yönetimi görünürlüğü, çakışma UX hatası, tam
form denetimi) istedi. **Bu oturum önce bir Faz 0 boşluk analizi yaptı, sonra yalnızca gerçek
boşlukları kapattı** — zaten doğru çalışan hiçbir şey yeniden yazılmadı.

---

## 1. Yeni öğrenci kaydı formu denetimi ve iyileştirmeler

`src/app/panel/ogrenciler/yeni/page.tsx` uçtan uca okundu ve şartnamenin A–G bölümlerine karşı
denetlendi:

| Bölüm | Durum | Not |
|---|---|---|
| A. Öğrenci kimliği | ✅ Vardı | Ad-soyad, T.C. (şifreli), doğum tarihi/yeri, iletişim, adres. |
| B. Veli/ebeveyn | ✅ Vardı | Anne/baba adı, veli adı/telefon — 18 yaş altı zorunluluğu backend'de (`isMinor`) ayrıca uygulanıyor. |
| C. Program/eğitim | ✅ Vardı | Şube, enstrüman, öğretmen, haftalık ders sayısı, ders süresi. |
| D. Kayıt | Kısmen | Başlangıç tarihi var; **süre (ay)/bitiş tarihi bu ekranda YOK** — bilinçli tasarım kararı (bkz. §7), süre yalnızca sözleşme oluştururken seçilir. |
| E. Ödeme ve sözleşme | Kısmen | Paket/aylık ücret/ödeme yöntemi/ödeme günü var; **sözleşme alanları (imzalayan, taksit sayısı, ilk vade) yok** — kasıtlı, bkz. §7. |
| F. Hesap/erişim | **Eksikti → eklendi** | Gerçek e-posta daveti akışı (önceki oturumda kuruldu) bu formdan hiç kullanılamıyordu. Bu oturumda "Portal erişimi (opsiyonel)" bölümü eklendi: işaretlenirse kayıt tamamlanır tamamlanmaz `inviteStudentPortalAccessTool` best-effort çağrılır (düz metin şifre YOK, işaretlenmezse davranış AYNI kalır). |
| G. Son özet/onay | **Eksikti → kısmen karşılandı** | Kayıttan ÖNCE tek bir "özet ekranı" eklenmedi (bkz. §7, kapsam kararı) — bunun yerine kayıttan HEMEN SONRA (§4) bir özet+CTA banner'ı eklendi, aynı ürün amacına (kaydı gözden geçirip hızlıca ilerlemek) daha az riskli bir yoldan ulaşır. |

Yalnızca gerçek bir boşluk olan **F**'ye (davet checkbox'ı) ve **G**'nin pratik karşılığına (§4
CTA'sı) dokunuldu; D/E'yi de bu forma taşımak ~330 satırlık `actionAddStudent`'ı ve formu köklü
biçimde yeniden tasarlamayı gerektirirdi — önceki oturumun bilinçli kararı (bkz. §7) bu oturumda da
korundu, gereksiz kapsam genişletmesi yapılmadı.

## 2. Ödeme politikası uygulaması (Faz 2)

**Boşluk analizi doğruladı: bu kural daha önce YOKTU.** `buildInstallmentSchedule` yalnızca
kullanıcının girdiği ilk vade tarihine ay ekliyordu; `paymentMethod` taksit satırlarında ATIL bir
metadata alanıydı, vadeyi hiç etkilemiyordu. Kurumun genel gecikmiş-tahsilat motorunda
(`src/lib/collections-due.ts`) benzer ama FARKLI bir kural zaten vardı (kart 1–5, nakit/havale
"en geç 20") — bu, sözleşmeler için değil, süregelen aylık faturalama için ayrı bir özellik; bu
oturum onu DEĞİŞTİRMEDİ, yalnızca sözleşmeye özgü YENİ bir kural ekledi.

`src/lib/contracts.ts`:

- `resolveContractPaymentDueRule(paymentMethod, policy?)` — `credit_card` → pencere 1–5,
  metin **"Kredi kartı ödemeleri her ayın 1–5'i arasında yapılmalıdır."**; aksi halde (nakit/
  havale/tanımsız) → son gün 15, metin **"Havale/EFT/nakit ödemeleri her ayın en geç 15'ine kadar
  yapılmalıdır."** — şartnamedeki iki cümle BİREBİR.
- `buildInstallmentSchedule`: ilk taksit personelin girdiği tarihtir (istisna gerekçesiyle pencere
  dışı olabilir); **2. ve sonraki taksitler artık kurala göre normalize edilir** (kart → her ayın
  5'i, nakit/havale → her ayın 15'i, ay sonu taşması son güne kenetlenir) — sessizce geçersiz bir
  vade asla üretilmez.
- `createContract`: ilk taksit tarihi pencere DIŞINDAYSA ve `firstPaymentExceptionReason`
  verilmediyse `VALIDATION_ERROR` ile reddedilir ("kayıt normal pencereden sonra yapıldıysa" akışı
  — şartname §2 "first installment date may require explicit staff confirmation"). Gerekçe
  verilirse kabul edilir, hem `contractDataSnapshot`'a hem audit log'a (`contract.first_payment_window_exception`) yazılır.
- Kural metni + pencere günleri **immutable snapshot**'a yazılır (`paymentDueRuleText`,
  `paymentDueWindowStartDay/EndDay`) — kurum politikası sonradan değişse bile ESKİ sözleşmeler asla
  geriye dönük etkilenmez (şartname §2 "old generated contracts keep their old payment-rule
  snapshot forever").
- **Kurum-yapılandırılabilir politika (yalnız GELECEK sözleşmeler):** yeni bir tablo/migration
  AÇILMADI — mevcut `School.collectionsSettings` JSON alanı (zaten SCHOOL_ADMIN/SUPER_ADMIN
  RBAC'lı, zaten audit'li, zaten `/panel/kurulum` üzerinden düzenlenebilir) iki opsiyonel alanla
  genişletildi: `contractCardWindowEndDay`, `contractBankCashDueDay`. `updateCollectionsSettingsTool`
  zaten var olan audit çağrısı bu iki alanı da otomatik kapsar (aynı obje audit'leniyor). Varsayılan
  (`undefined`) → tam olarak istenen 1–5 / 15.
- Sözleşme HTML'i (Madde 7) artık `{{paymentDueRuleText}}` içeriyor; önizleme API'si
  (`previewContractInstallmentPlanTool`) ve admin UI (`contract-panel.tsx`) kural metnini VE
  "ilk taksit pencere dışı" uyarısını (gerekçe alanıyla) canlı gösteriyor.

**Test:** `src/lib/__tests__/contracts.test.ts` — 11 yeni test (kural metni kart/nakit-havale,
taksit normalizasyonu her iki yön, pencere-dışı red, pencere-dışı+gerekçe kabul+snapshot, HTML'de
kural metni, preview tool alanları). Bkz. §16.

## 3. Trial vs formal sözleşme kuralı

Değişmedi — önceki oturumun işi (`isFormalContractDuration`, 1–2 ay = trial/`recorded`, 3–12 ay =
formal). Bu oturum yalnızca yeni ödeme kuralının HER İKİ dalda da doğru çalıştığını doğruladı
(taksit planı trial kayıtlarda da gerçek `Payment` satırları olarak üretiliyor, aynı vade
normalizasyonuyla).

## 4. Hızlı kayıt → sözleşme oluştur/yazdır akışı (Faz 4)

**Boşluk analizi doğruladı: bu akış hiç YOKTU** — `actionAddStudent` bir React 19 server action'ı
(`<form action={...}>`) olduğundan dönüş değeri UI'ya hiç ulaşmıyordu; başarı sonrası admin BOŞ
forma dönüyordu, ne özet ne de sözleşmeye giden bir yol vardı.

- `src/lib/actions.ts` `actionAddStudent`: başarılı kayıt sonrası artık
  `redirect(/panel/ogrenciler/{id}?yeniKayit=1#sozlesme)` — `withAuthContext`/`revalidateAll()`
  TAMAMLANDIKTAN SONRA, try/catch DIŞINDA çağrılır (hata yolu değişmedi, `UNAUTHENTICATED` hâlâ
  `/login`'e yönlendiriyor).
- `src/app/panel/ogrenciler/[studentId]/page.tsx`: `?yeniKayit=1` algılanırsa yeşil bir başarı
  kartı gösterir — öğrenci adı, paket/aylık ücret/ödeme yöntemi özeti, ve üç aksiyon: **birincil
  "Sözleşme Oluştur ve Yazdır"** (`#sozlesme`'ye kayar), "Öğrenci Detayına Git", "Yeni Kayıt
  Oluştur".
- `ContractPanel`/`ContractForm` yeni `autoOpenInitial`/`prefill` prop'ları aldı: banner varken
  sözleşme formu OTOMATİK açık başlar ve program/aylık ücret/ödeme yöntemi/başlangıç tarihi
  öğrenci kaydından ÖN DOLDURULUR (admin yalnızca süreyi seçip taksit sayısını/imzalayanı girer).
- Trial (1–2 ay) mı formal (3–12 ay) mı, **kayıt anında henüz bilinemez** (süre yalnızca sözleşme
  formunda seçiliyor — bkz. §1/§7) — bu yüzden banner tek, birleşik bir CTA sunar; süre seçilince
  ContractForm'un mevcut canlı "Tanışma Paketi / Resmi Sözleşme Gerekli" rozeti devreye girer.

**Test:** `write-scope-actions.test.ts`'teki 3 mevcut test artık `redirect()`'in TASARIM GEREĞİ
fırlattığı `NEXT_REDIRECT` hatasını bekleyecek şekilde güncellendi (mutasyonun yine de
gerçekleştiği ayrıca doğrulanıyor) — regresyon değil, yeni davranışın doğru test edilmesi.

## 5. "Metadata-only" sözleşme önizleme/PDF — kök neden ve düzeltme

**Boşluk analizi, iddianın kısmen doğru olduğunu ortaya çıkardı:** `STUDENT_ENROLLMENT_CONTRACT_BODY`
(`src/lib/documents/index.ts`) zaten tam 26 maddelik hukuki metin + 12 satırlık taksit tablosu
içeriyor ve `ensureDefaultTemplates` her tenant için sıfır şablonu varsa bunu otomatik tohumluyor —
**yeni/varsayılan bir tenant için "metadata-only" iddiası YANLIŞ.** Gerçek risk: `mine.length === 0`
kontrolü yüzünden, bu düzeltmeden ÖNCE (veya herhangi bir gelecekteki değişiklikten önce) bir
şablon satırı zaten oluşmuş bir tenant **asla otomatik yükseltilmiyor** — o tenant sonsuza kadar
eski/eksik şablonda kalabilirdi, sessizce.

**Kök neden düzeltmesi (silent rewrite YOK, "block generation with clear errors" — şartname §5):**

- `contracts.ts` `validateContractTemplateBody(bodyHtml)` — formal bir sözleşme oluşturulmadan
  HEMEN ÖNCE, aktif şablonun gerekli tüm alanları içerdiğini doğrular: taksit tablosu
  (`{{taksit1Tarih}}`/`{{taksit1Tutar}}`), toplam tutar, imzalayan, başlangıç tarihi, **ve bu
  oturumda eklenen** `{{titleMain}}`/`{{paymentDueRuleText}}`. Eksikse `ContractTemplateIncompleteError`
  fırlatılır — net Türkçe hata, PDF **üretilmez** ("hukuki metin YENİDEN YAZILMAZ, yalnızca
  varlığı kontrol edilir").
- Bu, eski/özel bir şablonu OLDUĞU GİBİ BIRAKIR (asla otomatik/sessizce değiştirmez) — admin,
  §9'da AÇILAN "Sözleşme Şablonları" bölümünden şablonu güncellemeye YÖNLENDİRİLİR.
- `getContractHtmlTool`/`/sozlesme-yazdir/[contractId]` zaten `renderedHtml`'i olduğu gibi
  gösteriyordu (`dangerouslySetInnerHTML`) — burada bir "fallback renderer" veya ayrı bir
  metadata-only yol YOKTU; risk tamamen "şablon güncellenmemişse" senaryosundaydı, artık o senaryo
  ENGELLENIYOR (yanıltıcı çıktı yerine hata).

## 6. Başlık, dosya adı, geçmiş ve çakışma UX (Faz 6)

- **Başlık:** ana başlık artık jenerik "ÖĞRENCİ KAYIT SÖZLEŞMESİ" değil —
  `contractTitleFields()` (`src/lib/contracts.ts`) şartnamedeki BİREBİR biçimi üretir: İlk kayıt
  için `"Öğrenci Kayıt Sözleşmesi — {ad soyad}"` + alt satır `"{akademik yıl} Eğitim Dönemi ·
  {süre} Aylık Kayıt · Sürüm {versiyon}"`; yenilemede `"Sözleşme Yenileme — ..."`. Teknik
  metadata (Sözleşme No, versiyon, tür, önceki sözleşme, şablon versiyonu) İKİNCİL bir kutuya
  taşındı, artık ana başlık DEĞİL.
  - Akademik yıl Türk eğitim takvimine göre hesaplanır (Eylül başlangıç; Ocak–Ağustos kaydı önceki
    Eylül'ün dönemine ait).
- **Dosya adı:** `ogrenci-kayit-sozlesmesi-{studentSlug}-{academicYear}-v{versionNumber}.pdf` —
  Türkçe karakterler ASCII'ye çevrilir, kontrol karakteri/yol ayırıcı üretmez.
- `/sozlesme-yazdir/[contractId]/page.tsx` artık `generateMetadata()` ile sekme başlığını
  (`titleMain`) ayarlıyor — tarayıcının "PDF olarak kaydet" varsayılan dosya adı artık jenerik site
  başlığı DEĞİL, öğrenci/dönem/versiyon içeren isim.
- **Geçmiş:** "Sözleşmeler ve Ödeme Planları" bölümü (önceki oturum, `contract-panel.tsx`) zaten
  versiyon zinciri/durum/önizle-yazdır/imzalı-yükle/yenileme aksiyonlarını gösteriyordu — bu
  oturum ek bir değişiklik yapmadı, yalnızca başlık gösterimini düzeltti.
- **Çakışma UX hatası (doğrulanan bug, düzeltildi):** `contract-panel.tsx`'te tek bir paylaşılan
  `error` state'i vardı, yalnızca bir SONRAKİ submit'te temizleniyordu — tarih düzeltilince eski
  hata mesajı EKRANDA KALIYORDU. Düzeltme: çakışma artık her render'da YENİDEN HESAPLANAN türetilmiş
  bir değer (`hasOverlap = enrollmentStartDate < previousContract.enrollmentEndDate`) — state
  DEĞİL, bu yüzden "eski/stale" olması YAPISAL OLARAK İMKANSIZ. Çakışma varsa canlı bir uyarı
  kutusu + "Kasıtlı örtüşmeye izin ver" onayı gösterilir; tarih düzeltilince uyarı OTOMATİK
  kaybolur. Genel `error` state'i (sunucu/diğer validasyon hataları) bundan TAMAMEN ayrı tutuldu —
  "ilgisiz hatalar kalmalı" kuralı, iki state'in birbirine hiç dokunmamasıyla sağlandı. Sunucu
  tarafı doğrulama (asıl otorite) DEĞİŞMEDİ.

## 7. Yenileme / fiyat garantisi / ödeme planı davranışı

Değişmedi — önceki oturumların işi (`versionNumber`, `previousContractId`, `superseded`, immutable
`contractDataSnapshot`, aynı eşik yeni sürenin kendisine uygulanıyor). Bu oturum yalnızca yeni
ödeme kuralının yenilemelerde de doğru snapshot'landığını doğruladı (§2 testleri initial+renewal
her ikisini de kapsıyor, mevcut renewal describe bloğu regresyonsuz geçti).

**Bilinçli kapsam kararı (§1'den taşındı, gerekçesiyle):** Yeni öğrenci kaydı formunu (süre/taksit/
imzalayan alanları eklenerek) sözleşme oluşturmayla TEK bir akışa birleştirmek bu oturumda
YAPILMADI. Gerekçe: (a) önceki oturumun zaten belgelenmiş, kasıtlı kararı (~330 satırlık
`actionAddStudent`'a dokunmama riski); (b) süre/duration kavramı YALNIZCA sözleşme düzeyinde var —
öğrenci kaydında yok, bunu forma taşımak veri modelini değiştirir; (c) §4'teki hızlı-CTA + ön-dolum
akışı, formları birleştirmeden AYNI ürün amacına (kayıttan sözleşmeye hızlı geçiş) ulaşıyor, daha
düşük riskle. Kurum bunu ayrı bir iş kalemi olarak isterse gerçek bir tasarım/veri modeli kararı
gerektirir.

## 8. Şablon yönetimi ve ödeme politikası yapılandırması (Faz 7)

**Boşluk analizi bulgusu:** genel şablon yönetim UI'ı (`DocumentTemplateManager`) zaten
KODDA vardı (oluştur/düzenle/versiyon/arşivle/geri aç, sunucu tarafı sanitize) ama
`src/app/panel/evraklar/page.tsx`'teki `SHOW_TEMPLATE_SECTIONS = false` bayrağı ("Kullanıcı
isteğiyle şimdilik kapatıldı" — önceki bir oturumda kullanıcının kendisi kapatmış) yüzünden hiç
GÖRÜNMÜYORDU.

**Karar: bu genel bayrağı GERİ AÇMADIM** (kullanıcının belgelenmiş kararına saygı) — bunun yerine
**yalnızca sözleşme şablonları için AYRI, her zaman görünür yeni bir bölüm** eklendi:

- `DocumentTemplateManager`'a yeni `lockKind` prop'u: verilirse "Belge türü" seçici gizlenir,
  yeni şablonlar hep o türde oluşturulur.
- `/panel/evraklar` sayfasına, `SHOW_TEMPLATE_SECTIONS` bayrağının DIŞINDA, her zaman görünen
  **"Sözleşme Şablonları"** kartı eklendi — `lockKind="student_enrollment_contract"`, yalnızca bu
  türdeki şablonları listeler/oluşturur/arşivler. Mevcut RBAC (`SCHOOL_ADMIN`/`SUPER_ADMIN`),
  tenant izolasyonu, sunucu tarafı HTML sanitize (`sanitizeTemplateHtml`), versiyon artışı
  (`updateTemplate` her düzenlemede `version+1`), audit (mevcut tool'larda zaten vardı) — hiçbiri
  yeniden yazılmadı, hepsi zaten doğru çalışıyordu.
- **Ödeme politikası yapılandırması** — bkz. §2 (mevcut "Ayarlar" ekranındaki tahsilat ayarları
  bölümüne 2 yeni alan olarak eklendi, ayrı bir sayfa AÇILMADI — mevcut deseni yeniden kullanma).

**Bilinçli olarak eklenmedi (kapsam dışı bırakıldı):** "draft" durumunun "active/inactive"tan ayrı
bir üçüncü durum olması, tenant/tür başına TEK aktif şablon zorlaması. Mevcut model zaten
"aktif/arşivlenmiş" ikilisini destekliyor ve formal sözleşme üretimi zaten her zaman "aktif" olanı
kullanıyor (`listTemplates` yalnız aktifleri döner) — pratikte aynı sonucu veriyor, ek bir durum
makinesi şu an gerekli değil.

## 9. Öğrenci/veli erişimi

Değişmedi — önceki oturum (`/ogrenci/sozlesmelerim`, `/veli/sozlesmelerim`, `canAccessStudent`
tabanlı yetkilendirme, trial kayıtlarda açıklayıcı not). Bu oturum başlık gösterimini düzeltti
(§6), erişim mantığına dokunmadı.

## 10. Davet / hoş geldin e-postası / auth akışı

Değişmedi (önceki oturum: `src/lib/email/*`, `src/lib/auth/invitation.ts`,
`/api/v1/auth/accept-invitation`, `/hesap-aktivasyon`, mevcut şifre-sıfırlama token altyapısının
yeniden kullanımı, SMTP yoksa `blocked:true`). **Bu oturumda ilk kez kullanılabilir hale
getirildiği yer:** §1'deki yeni kayıt formu "Portal erişimi" checkbox'ı — akış/güvenlik modeli
DEĞİŞMEDİ, yalnızca yeni bir GİRİŞ NOKTASI eklendi.

## 11. Ödev ses eki ve son tarih güncelleme

Bu oturumda dokunulmadı — önceki oturumda tamamlandı ve test edildi (bkz. §16 regresyon sonuçları,
`homework-audio-attachment.test.ts` ve `homework-due-date-update.test.ts` yine tam geçti).

## 12. RBAC / tenant / dosya / belge güvenliği

- Yeni ödeme politikası ayarları: `updateCollectionsSettingsTool` zaten `SCHOOL_ADMIN`/
  `SUPER_ADMIN` ile sınırlı ve audit'li — yeni alanlar bu korumaya otomatik dahil oldu (yeni bir
  RBAC noktası açılmadı).
- Şablon yönetimi (§8): mevcut tenant-scoped, role-scoped, sanitize edilen akış yeniden kullanıldı.
- Sözleşme oluşturma: `CONTRACT_STAFF = ["SCHOOL_ADMIN", "SUPER_ADMIN"]` değişmedi; öğretmen/veli/
  öğrenci hâlâ oluşturamaz (mevcut testler regresyonsuz geçti).
- Yeni istisna audit kaydı (`contract.first_payment_window_exception`) yalnızca gerçek bir
  istisna kullanıldığında, kimin/ne zaman/hangi gerekçeyle olduğu bilgisiyle yazılır.
- Şablon eksikse (§5) PDF üretimi ENGELLENİR — yanıltıcı/eksik bir belge asla öğrenci/veliye
  gösterilmez.

## 13. Şema / migration durumu

**Bu oturum HİÇBİR yeni migration eklemedi.** Ödeme politikası ayarları mevcut
`School.collectionsSettings` JSON kolonuna (zaten var, zaten migrate edilmiş) iki yeni opsiyonel
alan olarak eklendi — şema değişikliği YOK.

```
$ npx prisma migrate status
Following migrations have not yet been applied:
20260827150458_add_password_reset_token
20260828160000_student_contracts
20260828210000_contract_trial_optional_document
```

Bu üçü önceki oturumlardan kalan, HİÇBİR hedefe uygulanmamış migration'lar — bu oturum bunları
DEĞİŞTİRMEDİ, yalnızca durumu yeniden doğruladı. `npx prisma validate` → **geçti**
("The schema at prisma/schema.prisma is valid 🚀").

## 14. Üretim hazırlığı engelleri

`docs/launch/ADMIN_WEB_PRODUCTION_READINESS.md`'ye yeni bir **§15 Addendum** eklendi (önceki
içerik DEĞİŞTİRİLMEDİ, yalnızca eklendi). Özet:

1. §13'teki üç bekleyen migration hâlâ TEK şema engeli — bu oturum yeni bir engel eklemedi.
2. **Yeni operasyonel risk (ve azaltımı):** bu düzeltmeden önce oluşturulmuş, hiç güncellenmemiş
   bir tenant şablonu, bir sonraki formal sözleşme denemesinde §5'in yeni doğrulamasına takılıp
   net bir hatayla reddedilecektir — çözüm tek tıkla: §8'de her zaman görünür hale gelen "Sözleşme
   Şablonları" bölümünden şablonu yeniden kaydetmek (versiyon otomatik artar).
3. **Hukuki metin notu (yeni, önemli):** §5'te doğrulanan gerçek kod (`STUDENT_ENROLLMENT_CONTRACT_BODY`)
   ile sahibin sağladığı kanonik kök şablon (`student-enrollment-contract-template.md` §5), birkaç
   maddede (özellikle Madde 4, 7, 18, 20, 23) **kelimesi kelimesine AYNI DEĞİL** — bazı farklar
   yalnızca ifade biçimi, bazıları ise gerçek KURAL farkı (örn. Madde 23'te kod "15 gün + iki
   taksit ödenmezse muacceliyet" gibi kök şablonda OLMAYAN somut hükümler içeriyor; Madde 4'te kod,
   kök şablonda olmayan bir görüntü-hakları/kopyalama-hakkı devri içeriyor). **Bu oturum hiçbir
   hukuki metni SESSİZCE değiştirmedi** — mevcut kod metni AYNEN bırakıldı, fark burada ve
   `docs/launch/...`'ta AÇIKÇA raporlandı. **Kurumun hukuk danışmanının, ilk gerçek sözleşme
   imzalanmadan önce hangi metnin (kök şablon mu, mevcut kod metni mi) esas alınacağına karar
   vermesi gerekiyor** — tam madde-madde karşılaştırma için bkz. bu raporun ekindeki analiz
   (aşağıda özetlendi, tam tablo oturum log'unda mevcuttur).

   Kısa özet — kod metninde kök şablonda OLMAYAN maddeler/hükümler:
   - **Madde 4:** kurs lehine görüntü saklama/yeniden kullanma/kopyalama hakkı + öğrencinin hak
     iddia etmeyeceği beyanı (kök şablonda yok).
   - **Madde 7:** "aylık ücret her ayın **ilk dersinde**" somut ödeme zamanlaması (kök şablon
     ödeme planına bırakıyor, somut gün belirtmiyor) — bu oturumda eklenen 1–5/15 pencere kuralı
     bu cümleyle AYNI maddede yan yana duruyor, kurumun bunu netleştirmesi gerekir.
   - **Madde 18:** "yazılı bildirim yapmayanlar hakkında yasal işlem yürütülür" (kök şablonda yok,
     kök şablon yalnızca "gerekçe kurum tarafından incelenir" diyor).
   - **Madde 20:** "2 hafta sonra yapılabilir" + "kanuni oranda tazminat ödenir" (kök şablonda
     süre/tazminat hükmü yok).
   - **Madde 23:** "15 gün" somut süre + "üst üste iki taksit ödenmezse muacceliyet kazanır"
     (kök şablonda gün sayısı/muacceliyet hükmü yok).
4. Diğer tüm mevcut engeller (SMTP yok, `APP_BASE_URL` ayarlanmamış, restore hiç denenmemiş)
   değişmedi — bkz. `docs/launch/ADMIN_WEB_PRODUCTION_READINESS.md` §2.

## 15. Kanonik şablon senkronizasyonu

`docs/contracts/student-enrollment-contract-template.md`, kök `student-enrollment-contract-template.md`
ile artık **birebir aynı** (önceki bir oturumun kendi dönüştürme/frontmatter biçimiyle oluşturduğu
sürüm YERİNE, sahibin belirttiği TEK otoriter kaynaktan doğrudan kopyalandı). Kök dosya
DEĞİŞTİRİLMEDİ.

## 16. Test / typecheck / lint / build sonuçları

- `npx prisma validate` → **geçti.**
- `npm run typecheck` (kök) → **0 hata** (her değişiklikten sonra tekrar tekrar doğrulandı).
- `npm --prefix apps/mobile run typecheck` → **0 hata** (mobil koda dokunulmadı, regresyon yok).
- Bu oturumda dokunulan dosyalara scoped `npx eslint` → **0 hata**, yalnızca 13 ÖNCEDEN VAR OLAN
  uyarı (`no-unused-vars`, dokunulmayan satırlarda) — hiçbiri bu oturumun eklediği kodda değil.
- Odaklı testler (`contracts.test.ts`, `write-scope-actions.test.ts`, `account-invitation.test.ts`,
  `document-instances.test.ts`, `homework-audio-attachment.test.ts`, `homework-due-date-update.test.ts`,
  `password-reset.test.ts`, `change-password-route.test.ts`) → **126/126 geçti** (44 sözleşme testi
  dahil: 33 önceki + 11 bu oturumda eklenen ödeme-politikası/başlık testi).
- `npm run build` (kök) → **başarılı** (çıkış kodu 0) — `/panel/ogrenciler/yeni`,
  `/panel/ogrenciler/[studentId]`, `/panel/evraklar`, `/sozlesme-yazdir/[contractId]` dahil tüm
  rotalar hatasız derlendi.
- `npm test` (kök, tam paket, 216 dosya) → **2166/2172 test geçti (210/216 dosya), 6 başarısız.**
  TAMAMI ÖNCEDEN VAR OLAN, İLGİSİZ — doğrulama:
  1. 6 başarısız dosyanın (`find-person-schedule`, `homework-attachment`, `lesson-scheduling`,
     `lesson-series-tools`, `lesson-update`, `program-academic-term`) HER BİRİ `git status --short`
     çıktısında BOŞ — yani bu oturumda da, aynı günkü önceki iki oturumda da HİÇ değiştirilmemiş,
     HEAD ile birebir aynı dosyalar.
  2. Tamamı önceki iki oturumun raporunda ZATEN "önceden var olan, ilgisiz" olarak belgelenmiş,
     BİREBİR AYNI liste (bkz. `docs/contracts/CONTRACT_RENEWAL_INVITATION_AND_HOMEWORK_REPORT.md` §18.3).
  3. Hiçbiri sözleşme/ödeme-politikası/kayıt-formu/davet/şablon koduna bağımlı DEĞİL — ders
     programlama, öğretmen müsaitliği, akademik dönem ve ödev-eki (görsel dosya, ses eki DEĞİL)
     alanlarında, bu görevin kapsamı DIŞINDA.
  - Bu oturumun kapsamındaki tüm odaklı testler (§16'nın üstündeki 126) tam paketin İÇİNDE de
    aynı şekilde geçti — ayrı bir regresyon yaratmadı.

**Sonuç:** bu oturumdaki tüm yeni/güncellenmiş testler (11 yeni ödeme-politikası/başlık testi +
126 odaklı regresyon seti) geçti; tam paketteki 6 başarısız test kapsam dışı, önceden var olan ve
bu oturumda düzeltilmedi (kapsam: ders programlama/akademik dönem/görsel ödev eki — bu görevin
kapsamı olan sözleşme/ödeme/kayıt/davet/ödev-SES-eki'ni etkilemez) — release'e alınmasını
engellememelidir.

## 17. Admin web kabul kontrol listesi (bu oturum kapsamı)

- [x] Kredi kartı ödemesi sözleşmede "1–5'i arasında" metniyle görünüyor.
- [x] Havale/EFT/nakit sözleşmede "en geç 15'ine kadar" metniyle görünüyor.
- [x] Ödeme kuralı önizleme ekranında VE üretilen PDF'te aynı anda görünüyor.
- [x] İlk taksit pencere dışıysa gerekçesiz reddediliyor, gerekçeyle kabul ediliyor ve audit'leniyor.
- [x] Eski sözleşmelerin ödeme kuralı snapshot'ı, politika değişse bile sabit kalıyor.
- [x] Formal sözleşme PDF'i tam hukuki metin + taksit tablosu içeriyor; eksik şablon PDF ÜRETMEK
      YERİNE net bir hatayla engelleniyor.
- [x] Başlık öğrenci adı/dönem/süre/versiyon içeriyor, jenerik referans kodu DEĞİL.
- [x] Dosya adı biçimi şartnameyle birebir eşleşiyor.
- [x] Çakışma uyarısı, tarih düzeltilince otomatik kayboluyor; ilgisiz hatalar etkilenmiyor.
- [x] "Sözleşme Şablonları" bölümü admin için her zaman görünür ve erişilebilir.
- [x] Yeni kayıttan sonra admin boş forma değil, özet+"Sözleşme Oluştur ve Yazdır" CTA'sına düşüyor.
- [x] Kayıt formundan (opsiyonel) gerçek e-posta daveti gönderilebiliyor, düz metin şifre YOK.
- [ ] Hukuki metin (kök şablon vs. kod metni) kurumun hukuk danışmanı tarafından ONAYLANMADI —
      bkz. §14 madde 3, bu görevin kapsamında ÇÖZÜLEMEZ, iş kararı gerektirir.
- [ ] Üç bekleyen migration hiçbir hedefe uygulanmadı (bilinçli — bkz. §13).
- [ ] SMTP hâlâ yapılandırılmamış (önceki oturumdan kalan, değişmedi).

## 18. Onay ve kapsam teyidi

- ✅ **Hiçbir şey stage edilmedi** (`git add` çalıştırılmadı).
- ✅ **Hiçbir commit oluşturulmadı.**
- ✅ **Hiçbir push yapılmadı.**
- ✅ **Hiçbir deploy/yayına alma işlemi yapılmadı.**
- ✅ **Hiçbir shared/staging/production migration uygulanmadı** (`prisma migrate deploy`/
  `db push`/`db reset` ÇALIŞTIRILMADI — yalnızca `validate`/`generate`/`status`, salt-okunur).
- ✅ **Başka bir worktree'ye DOKUNULMADI** — tüm çalışma canonical `main` checkout'unda yapıldı.
- ✅ Hiçbir hukuki metin sessizce yeniden yazılmadı — bulunan çelişki AÇIKÇA raporlandı (§14).
- ✅ Bu oturumdan önce zaten mevcut olan, ilgisiz uncommitted çalışmalar (mobil uygulama iskeleti,
  marka geçişi, ders programlama/akademik dönem gibi başka alanlar) bu oturumda oluşturulmadı,
  değiştirilmedi, incelenmedi — yalnızca yukarıda listelenen dosyalar bu çalışmaya aittir.

## 19. Addendum — düzeltici paket (sonraki aynı gün oturumu)

Bu teslimattan sonra gerçek admin testinde 6 spesifik hata bildirildi (ders günü/saat UX'i,
"Gerekçe" alanı kafa karışıklığı/stale görünürlük, yetersiz kayıt onayı, kayıttan sözleşmeye
ani geçiş, yenilemede şablon hatası, iptal edilmiş sözleşme yenilemesinde konsol çökmesi). Kök
neden izleme + düzeltmeler + regresyon testleri: `docs/contracts/ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX_REPORT.md`.
Öne çıkanlar: bu raporun §5'inde "yeni/varsayılan tenant için YANLIŞ" denen metadata-only PDF
iddiası, GERÇEKTEN `tenant_nilufer_acar` için hâlâ aktif, 2026-08-25 tarihli bir şablon satırında
doğrulandı ve düzeltildi (tek-kaynak placeholder kaydı + "en son güncellenen kazanır" şablon
seçimi + yıkıcı olmayan kurtarma akışı); §6'daki çakışma-uyarısı düzeltmesiyle AYNI desende yeni
bir "iptal edilmiş sözleşmeden yenileme" client-side uygunluk hatası bulunup düzeltildi
(sunucudaki mevcut politika DEĞİŞMEDİ, yalnızca istemci artık onu doğru yansıtıyor).
