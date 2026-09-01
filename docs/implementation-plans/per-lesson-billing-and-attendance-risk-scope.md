# Ders Başı Dönemsel Tahsilat + Yönetici Yoklama Raporu — Kapsam Eklentisi

Durum: **YAŞAYAN DOKÜMAN**, ilk sürüm — salt-okunur Faz 0 keşif. Kod değişikliği
YAPILMADI (talimat gereği); bu dosya yalnızca denetim bulgularını ve iki yeni
gereksinimin teknik spesifikasyonunu kayıt altına alır.

## 0. Not: "mevcut kapsam raporu" bulunamadı

Repo içinde bu iki gereksinimle eşleşen, önceden var olan bir "kapsam raporu"
dosyası ARANDI, BULUNAMADI (`docs/`, `docs/contracts/`, `docs/roadmap/`,
`docs/implementation-plans/` tarandı — en yakın aday
`docs/implementation-plans/notaplan-product-expansion.md`, ama o 2026-08-25
tarihli TAMAMEN FARKLI bir 14-fazlık talebi kapsıyor; bu iki yeni gereksinimi
oraya eklemek konuları karıştırırdı). Bu yüzden bu dosya **yeni, bağımsız bir
kapsam dokümanı** olarak oluşturuldu — kullanıcı elinde başka bir yerde
(repo dışı) tuttuğu bir kapsam raporu varsa, bu dosyanın içeriği oraya
taşınabilir/birleştirilebilir.

**Kritik ek bulgu**: çalışma ağacında ŞU AN commit edilmemiş, GEREKSİNİM 1 ile
doğrudan örtüşen kısmi bir uygulama VAR: `src/lib/period-lesson-billing.ts`
(+testi) ve `attendance-calendar-panel.tsx`/`tools.ts` üzerindeki bağlı
değişiklik. Bu, aşağıdaki §1.7'de ayrıntılı karşılaştırılıyor — **yönü
gereksinimden farklı** (aylık ücretten ders başı ücret TÜRETİYOR, tam tersi
değil) ve yalnız 1 ekranda kullanılıyor (istenen 4'ten biri de değil, ayrı
bir 5. bağlam). Aynı ağaçta bununla İLGİSİZ, başka özelliklere ait (fotoğraf/
video rıza kapsamı, sözleşme yenileme hatırlatmaları, kurum logosu) uncommitted
değişiklikler de var — bunlara bu görev kapsamında DOKUNULMADI.

---

## BÖLÜM A — GEREKSİNİM 1: Ders başı dönemsel tahsilat ve ilk ödeme düzeltmesi

### A.1 — Faz 0 keşif özeti

| Alt-konu | Durum | Kanıt |
|---|---|---|
| Ders başı NET ücretin birincil/taban ücret olması | ❌ Yok | `Student.monthlyFee` tek taban alan (`types.ts:206`); ders başı ücret YOK, yalnız `period-lesson-billing.ts`'te aylık ücretten TÜRETİLİYOR (`computePerLessonUnitFee = round(monthlyFee / typicalCount)`) — mimari YÖN TERS |
| Dönem tahsilatı = ücretlendirilebilir ders × ders başı ücret | 🟡 Kısmi | `summarizePeriodBilling`/`computePeriodCollectionAmount` bu çarpımı ZATEN yapıyor, ama tek ekranda (yoklama takvimi paneli, salt-okunur) |
| Ücretlendirilebilir ders — KESİN TANIM | ❌ Yok | `countPlannedLessonsInMonth` yalnız `status !== "cancelled"` filtreler — trial/telafi/kurum-kapalı/dondurma/ücretsiz hiç ayrılmıyor (bkz. A.2) |
| İlk tahsilat manuel düzeltme + audit | ❌ Yok | Bugünkü `createStudentTool` TAM TERSİNİ yapıyor: `firstPaymentCollected.amount` hesaplanan tutarla **birebir eşleşmezse REDDEDİYOR** (`docs/contracts/FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md` §4.2) — manuel farklı net tutar girme bugün YASAK |
| Aynı motor 4 yerde | ❌ Yok | Bugün pricing 3 AYRI, birbirinden bağımsız kod yolunda: (1) `createStudentTool` içi inline hesap (kayıt), (2) `buildInstallmentSchedule`/`createContract` (sözleşme+gerçek tahsilat — AYNI fonksiyon, bu ikisi zaten ortak), (3) `period-lesson-billing.ts` (yoklama takvimi, izole). Payment simülasyonu diye ayrı bir ekran/tool YOK |
| Eski aylık paketli kayıtların otomatik dönüştürülmemesi | ✅ Doğal olarak sağlanabilir | Proje genelinde yerleşik desen: additive nullable alan + "eski alan okunur, yeni akış yalnız yeni kayıtlarda" (`studentType`→`studentTypes` deseni, `monthlyFeeManualOverride` deseni) — AYNI desen burada da uygulanmalı |

### A.2 — "Ücretlendirilebilir ders" tanımı: mevcut sistemde KESİN bir tanım YOK

Kod tabanında `Lesson.status: "scheduled"|"in_progress"|"completed"|"cancelled"|"no_show"`
ve ayrıca birbirini dışlayan "ops bayrakları" (`lesson-ops.ts`: Geldi/İşlendi/
Telafi/Gelmedi/Mazeretli) var, ama **hiçbir yerde bu ikisini "faturalandırılır
mı" sorusuna çeviren tek bir fonksiyon yok**. `countPlannedLessonsInMonth`
(yeni, uncommitted) yalnız `status !== "cancelled"` kontrolü yapıyor — aşağıdaki
durumların HİÇBİRİNİ ayrı ele almıyor:

| Durum | Bugünkü kod davranışı | Gereksinim 1 için önerilen davranış |
|---|---|---|
| Deneme dersi (`type:"trial"`) | Sayılıyor (filtrelenmiyor) | Sayılmamalı — deneme dersleri zaten ayrı `TrialLesson` politikasıyla yönetiliyor (`2026_2027_CONTRACT_SOURCE_IMPLEMENTATION_REPORT.md` §7-8), dönem tahsilatına karışmamalı |
| Resmî tatil / kurum kapalı günü (`ClosedDay`, `opsClosedFlag`) | O gün zaten ders YOK sayılıyor (schedule seviyesinde) — ama var olan bir ders `opsClosedFlag` ile "Kapalı" işaretlenmişse yine de `status!=="cancelled"` olduğu için SAYILIYOR | Sayılmamalı — `opsClosedFlag===true` olan dersler hariç tutulmalı |
| İptal (`status:"cancelled"`) | Zaten hariç | Hariç kalmalı (değişiklik yok) — ama bkz. aşağıdaki aynı-gün iptal notu |
| Telafi (`opsMakeupFlag`, `type:"makeup"`) | Kaynak (kaçırılan) ders SAYILIYOR; üretilen telafi dersi de AYRI bir `Lesson` kaydı olarak yine SAYILIYOR → **iki kez sayılma riski** (kaynak + telafi) | Kaynak ders bir kez, telafi dersi ONUN YERİNE geçmeli — plan: `opsMakeupFlag` true olan kaynak ders hariç tutulur, `type:"makeup"` olan telafi dersi dahil edilir (net: bir kaçırılan ders → bir ücretlendirilebilir slot, ikisi değil) |
| Ücretsiz ders | **Kavram YOK** — kod tabanında `isFree`/`complimentary` gibi bir alan bulunamadı | Yeni gereksinim: `Lesson`'a (veya paket/öğrenci seviyesinde) açık bir "ücretsiz" bayrağı eklenmeden bu kural uygulanamaz — bu, GEREKSİNİM 1'in KENDİSİNİN gerektirdiği yeni bir alan |
| Dondurma | `Student.paymentPauseStatus?: "paused"` var (`types.ts:292`, `StudentPaymentPauseState`) ama `period-lesson-billing.ts` bu alana HİÇ bakmıyor | Dondurma penceresindeki planlı dersler ücretlendirilebilir sayımdan çıkarılmalı |
| Aynı-gün iptal (telafi hakkı doğurur mu) | `LESSONS_LEARNED.md` kural #1: bu ASLA `markedAt`/timestamp heuristiğinden türetilmemeli; ayrı bir "iptal-bildirim olayı" gerekir — şema var (migration `20260829180000_attendance_cancellation_notice`, UYGULANMAMIŞ), sunucu mantığı YOK | Ücretlendirilebilir-ders tanımı bu olaya bağlıysa (örn. "geç iptal yine ücretlendirilir") önce bu alt-sistemin bitmesi gerekir — **bağımlılık**, GEREKSİNİM 1'i bloklayabilir |

**Sonuç**: "ücretlendirilebilir ders" için önerilen TEK KAYNAK fonksiyon —
`isBillableLesson(lesson): boolean` — şu mantığı içermeli: `type !== "trial"`
VE `status !== "cancelled"` VE `!opsClosedFlag` VE `!opsMakeupFlag` (kaynak
ders, yerini telafi dersi alıyor) VE `!isFreeLesson` (yeni alan) VE ders tarihi
öğrencinin dondurma aralığı dışında. Bu fonksiyon `src/lib/period-lesson-billing.ts`
içine (veya ayrı `billable-lesson.ts`'e) konup HER DÖRT entegrasyon noktasından
da BİREBİR aynı şekilde çağrılmalı — mevcut `countPlannedLessonsInMonth`
YETERSİZ, genişletilmesi gerekiyor.

### A.3 — Tahsil edilmiş dönemlerin sessizce değişmesini engelleyen tasarım

Bugün proje genelinde geçerli olan ve buraya da uygulanması gereken desen
(`FINANCE_CONTRACTS.md`, `LESSONS_LEARNED.md`): **tahsil edilmiş/`paid`
`Payment` satırları asla geriye dönük yeniden hesaplanmaz.** Bir dönem
tahsilatı (`Payment`, `source:"period_lesson_billing"` gibi yeni bir kaynak
etiketiyle) `paid` olarak yazıldıktan SONRA o ay için ders eklenir/silinir/
iptal edilirse, geçmişte yazılan `Payment.amount` **DEĞİŞMEMELİ** — yalnız
GELECEK dönemlerin hesaplaması etkilenir. Bu, mevcut `TeacherPayout`
"snapshot felsefesi" (`notaplan-product-expansion.md` Faz 2 notu) ile aynı
ilke: hesaplama anında bir STATİK sonuç yazılır, sonradan girdi değişse bile
o sonuç sabit kalır — yeniden hesaplama istenirse AYRI bir "düzeltme" kaydı
(manuel-düzeltme audit alanları, bkz. A.4) ile yapılır, mevcut satır
üzerine YAZILMAZ.

### A.4 — İlk tahsilat manuel düzeltmesi: teknik tasarım

Bugün en yakın emsal `Student.monthlyFeeManualOverride?: boolean` +
`monthlyFeeOverrideReason?: string` (`types.ts:270-273`) — ama bu (a) AYLIK
ücret için, ilk dönem tahsilatı için değil, (b) yalnız boolean+neden taşıyor,
istenen "eski otomatik tutar / yeni net tutar / fark / kim / ne zaman" beşlisini
taşımıyor. Önerilen: `Payment`'a (veya ayrı bir `PaymentAdjustment` kaydına)
şu alanlar — `autoSuggestedAmount`, `manualNetAmount`, `adjustmentDelta`
(`manualNetAmount - autoSuggestedAmount`, türetilmiş/salt-okunur), `reason`,
`adjustedBy`, `adjustedAt`. Bu, mevcut `monthlyFeeManualOverride` deseninin
BİREBİR GENİŞLETİLMİŞ hali — yeni bir desen icat etmiyor.

**Serbest istisna alanını gizlememe kuralı**: bugün `firstPaymentExceptionReason`
alanı VAR ama TARİH istisnası içindir (ödeme tarihi kayıt tarihinden farklıysa),
TUTAR istisnası için değil (`FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md`
§4.3-4.4). Bu iki alanı KARIŞTIRMAMAK kritik — aynı adı/alanı ikinci bir amaç
için yeniden kullanmak, "otomatik hesaplamayı gizleme" riskini tam da
gereksinimin yasakladığı şekilde yaratır. Plan: TUTAR düzeltmesi için AYRI,
kendi audit alanlarını taşıyan yeni bir alan seti (yukarıdaki paragraf),
TARİH istisnası için mevcut `firstPaymentExceptionReason` DEĞİŞMEDEN kalır.

**İkinci kez yazılmama garantisi — ZATEN ÇÖZÜLMÜŞ**: kayıt anındaki ilk ödeme
ile sözleşme oluşturma anındaki ilk ödeme arasında çift `Payment` satırı
oluşmaması sorunu bu projede DAHA ÖNCE çözüldü ve regresyona karşı test edildi
(`docs/contracts/FIRST_PAYMENT_DUPLICATION_PREVENTION_REPORT.md`):
`source:"registration_first_payment"` doğal-anahtar idempotency +
`reuseFirstPaymentId` ile sözleşme/plan üretiminin AYNI satırı referans
alması. **Bu mekanizma per-lesson dönem tahsilatı için de DOĞRUDAN
yeniden kullanılmalı** — yeni bir idempotency şeması icat etmeye gerek yok.

### A.5 — Aynı motor 4 yerde: mevcut boşluk ve plan

| Entegrasyon noktası | Bugün | Gerekli değişiklik |
|---|---|---|
| 1. Yeni öğrenci kayıt önizlemesi | Hiçbir pricing-preview fonksiyonu/tool'u YOK (`new-student-form.tsx` grep'i doğruladı — yalnız ham `monthlyFee` değeri geçiyor) | Yeni `previewPeriodBillingTool` (veya mevcut inline hesaba entegre) — ortak motoru çağırır |
| 2. Ödeme simülasyonu | Ayrı bir ekran/tool YOK (talep edilen yeni bir yüzey) | Yeni ekran/bileşen, aşağıdaki A.6'daki satırları gösterir |
| 3. Sözleşme ödeme tablosu | `previewContractInstallmentPlanTool` (`tools.ts:8765`) + `buildInstallmentSchedule` (`contracts.ts:180`) — bugün AYLIK sabit taksit mantığı, ders-başı değil | Ortak motora bağlanmalı — mevcut `firstPaymentCollected`/`reuseFirstPaymentId` akışıyla ÇAKIŞMAMASI için A.4'teki ayrım şart |
| 4. Gerçek tahsilat planı | `addContractInstallments` (3 store modu) — yine aylık sabit | Aynı ortak motor |

Mimari öneri (Atlas seviyesi karar, uygulama bu görevin kapsamında değil):
tek bir `src/lib/period-lesson-billing.ts` (mevcut dosya GENİŞLETİLİR, yeni
bir dosya İCAT EDİLMEZ) içinde `isBillableLesson` + `computePeriodCollection`
saf fonksiyonları, bu 4 yüzeyin HER BİRİNDEN aynı import ile çağrılır — bugün
olduğu gibi yalnız yoklama takvimi panelinde tek seferlik kullanım YERİNE.

### A.6 — Ödeme simülasyonu zorunlu satırları → mevcut alan eşlemesi

| İstenen satır | Mevcut karşılık |
|---|---|
| Dönem tarihi | `classifyTermMonthPeriod`/`termPeriodLabel` zaten üretiyor |
| Planlanan ücretlendirilebilir ders sayısı | `countPlannedLessonsInMonth` var, A.2'deki tanıma göre GENİŞLETİLMELİ |
| Ders başı net ücret | Bugün TÜRETİLİYOR (`computePerLessonUnitFee`) — GEREKSİNİM 1 sonrası birincil, girilen bir alan olmalı |
| Otomatik dönem tutarı | `computePeriodCollectionAmount.suggestedAmount` |
| Manuel düzeltme (varsa) | YOK — A.4'teki yeni alanlar |
| Net dönem tahsilatı | `manualNetAmount ?? autoSuggestedAmount` |
| Ara toplam / net-dip toplam | YOK — yeni, dönemleri toplayan bir agregasyon katmanı gerekir |

### A.7 — Migration ve eski kayıt uyumluluğu

- Yeni "ders başı net ücret" alanı `Student`'a (veya pakete) **additive,
  nullable** eklenir (`perLessonNetFee Int?` gibi) — mevcut `monthlyFee`
  DOKUNULMADAN kalır, hiçbir backfill/otomatik dönüşüm ÇALIŞTIRILMAZ (aynen
  gereksinimin istediği gibi: "Eski aylık paketli kayıtların ücretleri
  otomatik dönüştürülmemeli"). Yeni kayıt formu bu alanı zorunlu ister; eski
  kayıtlar `perLessonNetFee IS NULL` kalır ve UI onlar için eski aylık akışı
  göstermeye devam eder.
- "Ücretsiz ders" bayrağı da additive/nullable yeni bir `Lesson` alanı olmalı.
- Manuel ilk ödeme düzeltmesi alanları additive, yalnız `Payment` (veya yeni
  bir ilişkili tablo) üzerinde — geçmiş `Payment` satırlarını ETKİLEMEZ.
- Tüm yeni alanlar için 3 store modu (json/db/memory) paritesi zorunlu —
  proje genelindeki hard invariant.

---

## BÖLÜM B — GEREKSİNİM 2: Yönetici Yoklama Raporu, Risk Bildirimi, Program Renkleri

### B.1 — Faz 0 keşif özeti

| Alt-konu | Durum | Kanıt |
|---|---|---|
| Tek statü altyapısı (Geldi/İşlendi/Telafi/Gelmedi/Mazeretli) | ✅ Zaten var, olgun | `src/lib/lesson-ops.ts` — `switchLessonOpsFlag`/`effectiveLessonOpsStatus`, birbirini dışlayan tek statü, mali sonuç YOK (Package B) |
| Admin Yoklama Raporu ekranı (filtreler + metrikler) | ❌ Yok | Grep'te `/panel/yoklama-raporu` veya benzeri bir route bulunamadı; en yakın emsal `attendance-calendar-panel.tsx` (öğrenci bazlı takvim, rapor/agregasyon değil) ve `/panel/odev-raporu` (farklı konu — ödev) |
| "İşlendi" için zorunlu gerekçe | ❌ Yok | `applyLessonOpsFlag(flag:"processed")` (`lesson-ops.ts:117-144`) hiçbir `reason`/`note` parametresi ALMIYOR |
| Telafi gerekçe akışı | 🟡 Var ama SAHTE | `switchLessonOpsFlag`→makeup dalı, `MakeupRequest.reason` alanını **hardcoded** `"Program/yoklama — Telafi işaretlendi"` ile dolduruyor (`lesson-ops.ts:210`) — kullanıcıdan gerçek bir gerekçe ALINMIYOR |
| Risk kuralı (aynı ay 3. işlenmiş ders → bildirim) | ❌ Yok | Kod tabanında "riskli öğrenci" kavramı hiç bulunamadı |
| Admin-only bildirim altyapısı | ✅ Zaten var, doğrudan yeniden kullanılabilir | `notifyAdmins()` (`manager-notifications.ts:28`) → `listAdminUserIdsForTenant()` (`auth/users.ts:572`) — `role IN (SCHOOL_ADMIN,SUPER_ADMIN) AND tenantId=X` ile ZATEN doğru izole |
| Aylık duplicate-önleme | 🟡 Kısmen uyumsuz | `notifyAdmins`'in mevcut `dedupeKey` mekanizması yalnız **24 saatlik** pencerede bakıyor (`since = Date.now() - 24h`, `manager-notifications.ts:41,56`) — "aynı ay" için YETERSİZ, ayrı bir idempotency kaydı gerekir |
| Program renkleri | 🟡 Var ama YANLIŞ eşleşiyor | `LessonOpsBadges` (`lesson-ops-actions.tsx:218-275`) zaten renkli rozet üretiyor AMA renk-anlam eşlemesi istenenle ÇAKIŞIYOR (bkz. B.4) |

### B.2 — "İşlendi" zorunlu gerekçe: plan

`lesson-ops.ts`'teki `applyLessonOpsFlag`/`switchLessonOpsFlag` imzasına
opsiyonel değil ZORUNLU bir `reason: string` parametresi eklenmeli (yalnız
`flag==="processed"` dalında zorunlu kılınabilir — diğer bayraklar
etkilenmez). Gerekçe `Lesson`'a yeni `lessonProcessedReason?: string` alanı
olarak (mevcut `lessonProcessedAt`/`lessonProcessedBy` üçlüsünün YANINA,
aynı isimlendirme deseniyle) yazılmalı — audit edilebilirlik zaten var olan
`*By`/`*At` alan çiftiyle doğal olarak sağlanır, ayrı bir audit tablosu
İCAT EDİLMESİNE gerek yok (mevcut `AuditLog`'a da `entityType:"lesson"` ile
yansıtılabilir, proje genelinde zaten kullanılan `audit()` yardımcı
fonksiyonuyla).

### B.3 — Telafi gerekçesi: mevcut akış YETERSİZ, iki seçenek

Talimat "mevcut gerekçe akışı varsa onu bul" diyor — **bulundu ve
yetersiz**: `MakeupRequest.reason` alanı şema seviyesinde zorunlu (`string`,
opsiyonel değil) ama `lesson-ops.ts` üzerinden tetiklenen telafi işaretlemesi
bu alanı sabit bir string ile dolduruyor, kullanıcıya SORMUYOR. (Ayrıca
`MakeupRequest` üzerinde `decisionNote` alanı var ama o KARAR anı — onay/ret
— içindir, İŞARETLEME anı için değil.) Plan: `switchLessonOpsFlag`'in
makeup dalına da B.2 ile aynı desende zorunlu bir `reason` parametresi
eklenmeli, bu değer `MakeupRequest.reason`'a gerçek girdi olarak yazılmalı
(hardcoded string kaldırılır).

### B.4 — Program renkleri: mevcut ↔ istenen çakışma tablosu

| Statü | Şu an (`lesson-ops-actions.tsx`) | İstenen (gereksinim) | Uyumlu mu? |
|---|---|---|---|
| Geldi | açık yeşil (`#e8f2ec`/`#1e4d36`) | yeşil | ✅ |
| İşlendi | açık **kırmızımsı/bordo** (`#f8ecec`/`#6b2424`) | **sarı** | ❌ ters — değiştirilmeli |
| Telafi | açık **sarı/amber** (`#fbf3d9`/`#5c4a12`) | **kırmızı** | ❌ ters — değiştirilmeli |
| Gelmedi | stone gri (`bg-stone-200`) | gri veya turuncu | ✅ (gri seçeneği zaten karşılanıyor) |
| Mazeretli | **turuncu** (`bg-orange-100`/`text-orange-800`) | mor veya nötr mavi | ❌ — değiştirilmeli |
| İptal (`status:"cancelled"`) | Bu bileşende HİÇ badge yok (ops-flag değil, temel `status`) | koyu gri | ❌ eksik — yeni eklenmeli |
| Kapalı (kurum kapalı günü) | siyah (`bg-black`) | (gereksinimde ayrı madde yok, en yakını "iptal" ile aynı aile) | — dokunulmaz, zaten en koyu renk |

**Olumlu bulgu**: renkler bugün de yalnız arka plan rengiyle değil, HER
ZAMAN bir metin etiketiyle ("Geldi", "İşlendi" vb.) birlikte gösteriliyor —
"yalnız renge güvenme" kuralı zaten karşılanıyor, ek bir ikon/badge sistemi
İCAT EDİLMESİNE gerek yok, sadece renk değerleri düzeltilmeli. Koyu tema
deseni de projede zaten var (`dark:text-emerald-400` gibi kullanımlar,
`attendance-calendar-panel.tsx:914,931`) — aynı `dark:` varyant deseni bu
bileşene de uygulanmalı (bugün `LessonOpsBadges`'te HİÇ `dark:` sınıfı yok —
bu, koyu tema desteğinin bu bileşende eksik olduğunu doğruluyor).

**Kapsam netliği**: "yalnız geçmiş derslerde durum rengi" kuralı — bu
bileşen zaten yalnız ops-flag'i SET EDİLMİŞ derslerde bir şey render ediyor
(gelecek/planlanmış bir derste hiçbir flag set edilmemiş olur, dolayısıyla
hiçbir badge basılmaz) — DOĞAL olarak "gelecek ders standart görünümünü
korur" kuralını karşılıyor, ekstra bir tarih kontrolü gerekmeyebilir. Ancak
bu, YALNIZCA badge bileşeni için doğrulandı; takvim/program IZGARASININ
KENDİSİNİN (`program-studio.tsx` hücre arka planı) geçmiş/gelecek ayrımı
yapıp yapmadığı bu taramada AYRICA DOĞRULANMADI — uygulama öncesi kontrol
edilmeli.

### B.5 — Risk kuralı: teknik tasarım

Önerilen yeni model, projenin KENDİ idempotency şablonunu (`TaskReminderLog`/
`LessonHomeworkReminderLog` — `@@unique([tenantId, ...])` deseni,
`notaplan-product-expansion.md` Faz 3C notu) birebir taklit eder:

```
StudentAttendanceRiskLog
  tenantId, studentId, calendarMonth (yyyy-MM), threshold (sabit: 2),
  triggeredAt, triggeredByLessonId
  @@unique([tenantId, studentId, calendarMonth])
```

Akış: bir ders `switchLessonOpsFlag(flag:"processed")` ile işaretlendiğinde,
o öğrencinin o takvim ayındaki (ders tarihine göre, işaretleme tarihine göre
DEĞİL — B.2/B.3'teki "heuristik türetme" hatasından kaçınmak için) toplam
"işlendi" sayısı hesaplanır; sayı TAM 3'e ulaştığı anda (2'yi "geçtiği" ilk
an) ve bu `(tenantId, studentId, calendarMonth)` için henüz bir
`StudentAttendanceRiskLog` YOKSA → `notifyAdmins(tenantId, "student_attendance_risk", {...})`
çağrılır VE aynı işlemde log satırı yazılır (aynı transaction/lock —
`makeup-quota.ts`'teki `pg_advisory_xact_lock` deseniyle aynı concurrency
disiplini, DB modda çifte-tetikleme riskine karşı). Yeni ay başladığında
`calendarMonth` değiştiği için sayaç doğal olarak sıfırlanır — ayrı bir reset
işine gerek yok.

Yeni bildirim kategorisi `student_attendance_risk` (`notification-categories.ts`,
`roles: ["SCHOOL_ADMIN","SUPER_ADMIN"]`, `group:"students"`) — mevcut kategori
kataloğu deseniyle birebir aynı şekilde eklenir; `implemented:true` çünkü
gerçek bir event producer olacak.

### B.6 — Yoklama Raporu ekranı: mevcut ekranlarla ilişkisi

Talep edilen filtre/metrik seti (bugün/hafta/ay/özel aralık, öğrenci,
öğretmen, şube, enstrüman/oda/durum + toplam planlanan/geldi/gelmedi/
mazeretli/işlendi/telafi/iptal/riskli-öğrenci-sayısı) için **doğrudan
kullanılabilecek bir ekran YOK** — `attendance-calendar-panel.tsx` tek
öğrenci + tek ay odaklı (agregasyon/çoklu-öğrenci filtresi yok),
`/panel/odev-raporu/detay`'ın GET-query-param filtre deseni (URL'de
paylaşılabilir link) ise doğrudan kopyalanabilir bir şablon (`notaplan-
product-expansion.md` Faz 3D notu, "aynı GET-form deseni"). Plan: yeni
`/panel/yoklama-raporu` route'u, aynı filtre deseni + `effectiveLessonOpsStatus`
üzerinden tek-geçişte agregasyon.

### B.7 — Etkilenen dosyalar (B genelinde, tahmini)

`src/lib/lesson-ops.ts` (reason parametreleri), `src/lib/types.ts`
(`lessonProcessedReason`, yeni `StudentAttendanceRiskLog` — 3 store dosyası),
`src/lib/notification-categories.ts` (yeni kategori), `src/lib/manager-notifications.ts`
veya yeni `src/lib/attendance-risk.ts` (risk hesaplama+log), `src/components/lesson-ops-actions.tsx`
(zorunlu gerekçe input'u + renk düzeltmesi + `dark:` varyantları), yeni
`/panel/yoklama-raporu/page.tsx` + destekleyici tool (`getAttendanceReportTool`
gibi).

---

## Genel riskler / owner kararı gereken noktalar

1. **GEREKSİNİM 1, aynı-gün iptal alt-sistemine (§A.2 son satır) bağımlı
   olabilir** — o alt-sistem şema var/sunucu mantığı yok durumunda; owner bu
   bağımlılığı kabul mü ediyor yoksa v1'de "her iptal hariç tutulur, geç/erken
   ayrımı yok" mu basitleştiriliyor, netleştirilmeli.
2. **"Ücretsiz ders" ve "ders başı net ücret (birincil alan)" ikisi de
   YENİ kavramlar** — DECISIONS.md'de FINAL bir politika olarak henüz
   kayıtlı değil; bu görev yalnız denetim/spec ürettiği için, uygulamaya
   geçmeden owner onayı (CEO kararı, AGENTS.md §4.1 Orion lane) gerekir.
3. **Uncommitted `period-lesson-billing.ts` ile çakışma**: bu dosya
   GEREKSİNİM 1'in ters yönünü (aylıktan türetme) zaten uyguluyor ve tek
   ekranda kullanılıyor — ileride bu iş ele alınırken bu dosya SİLİNMEZ,
   YÖNÜ DEĞİŞTİRİLEREK genişletilir (§A.5 önerisi), aksi halde iki paralel
   "ders başı ücret" kavramı ortaya çıkar.
4. **Risk bildirimi eşiği (`threshold: 2`) şu an sabit kod** — gereksinimin
   kendi notu da bunu istiyor ("gelecekte kurum ayarına taşınabilir ama şu
   an gereksiz kapsam ekleme") — bu görevde de aynı disiplin korunmalı,
   ayarlanabilir hale GETİRİLMEMELİ.

Bu doküman salt-okunur denetim + spesifikasyon aşamasıdır — hiçbir kod
değişikliği, migration, commit, push veya stash işlemi YAPILMADI.
