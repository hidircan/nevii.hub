# İlk Ödeme — Kayıt Anında Zorunlu Tahsilat Politikası (Uygulama Raporu)

Tarih: 2026-08-29, **güncelleme: 2026-08-30**. Sahibi politikası: **"İlk ödeme her zaman kayıt
esnasında alınacaktır. İlk ödeme alınmadan kayıt tamamlanmayacaktır."** Bu rapor, sunucu tarafı
uygulamayı, kapsamını, kalan UI/iş kalemlerini ve test/derleme sonuçlarını belgeler.

## 0. GÜNCELLEME (2026-08-30) — ASIL kayıt tamamlanma sınırına taşındı

**Kök neden, doğrulandı:** 2026-08-29 oturumunda eklenen zorunluluk yalnızca `createContract`'ta
(FORMAL, ≥3 ay sözleşme oluşturma anında) uygulanıyordu — ama gerçek "Yeni Öğrenci Kaydı" akışı
(`createStudentTool`, `src/lib/services/tools.ts`) öğrenci kaydını sözleşmeden TAMAMEN BAĞIMSIZ,
hiçbir ödeme kontrolü olmadan tamamlıyordu. Bir yönetici öğrenciyi oluşturup hiç sözleşme
oluşturmayabilir veya sözleşmeyi haftalar sonra oluşturabilir — bu süre boyunca öğrenci hiçbir
ödeme tahsil edilmeden "kayıtlı" (schedule/portal-eligible) kalıyordu. Bu, görevin "registration
cannot finalize without it" gereksinimini İHLAL ediyordu.

**Bu oturumda uygulanan düzeltme — ASIL sınır:**

- `createStudentTool` (`src/lib/services/tools.ts`, pricing hesaplandıktan hemen sonra, öğrenci
  yaratılmadan ÖNCE) artık `firstPaymentCollected` yoksa `"İlk ödeme kayıt sırasında tahsil
  edilmeden kayıt tamamlanamaz."` ile REDDEDER — FORMAL/trial ayrımı YOK, süre/paket fark etmeksizin
  HER kayıt için zorunlu (görevin "ANY registration date... registration event itself" ifadesiyle
  birebir uyumlu — `createContract`'taki formal-only kapsam kararından BİLİNÇLİ OLARAK farklı).
- Tutar, hesaplanan `pricing.monthlyFee` (paket/indirim/override sonrası NİHAİ değer) ile birebir
  eşleşmeli — sahte/az tutarla kayıt kapatma engellenir.
- Gün-of-ay (1-5/1-15 ödeme penceresi) burada HİÇ kontrol edilmez — ilk ödeme ANY registration date
  (1-31) için zaten kayıt anının kendisidir. `firstPaymentExceptionReason` yalnızca tahsilat tarihi
  `enrollmentStartDate`'ten FARKLIYSA (gerçekten istisnai/gecikmeli tahsilat) istenir — normal
  akışta hiç görünmez/tetiklenmez.
- Öğrenci yaratılır yaratılmaz `addRegistrationFirstPayment` (yeni, `store.ts`/`store-json.ts`/
  `store-db.ts`/`store-memory.ts` — üç mod paritesi korundu) `paid` bir `Payment` satırı yazar:
  `source:"registration_first_payment"`, `receivedByUserId:ctx.userId` (yetkili personel),
  `paymentNote` (dekont/not), `method`, `paidAt`. `student.first_payment_collected` audit olayı
  eklenir (`Payment` entity'sine, `studentId` meta'sında).
- **İdempotency:** (a) `addRegistrationFirstPayment` aynı `studentId` için `source:
  "registration_first_payment"` satırı zaten varsa YENİ satır YARATMAZ, mevcut olanı döner
  (çift ödeme imkansız). (b) `createStudentTool` içinde, aynı personel aynı doğal anahtarla
  (ad+telefon+veli telefonu+öğretmen+şube+tutar) 60sn içinde tekrar çağrılırsa (çift
  tıklama/ağ retry) İKİNCİ bir öğrenci de YARATILMAZ — ilk oluşturulan `studentId` döner.
  `ponytail:` bu doğal-anahtar + zaman penceresi yaklaşımı yeni bir alan/migration gerektirmiyor;
  ölçek/çakışma sorun olursa açık bir `idempotencyKey` alanına geçilebilir.
- **Bilinen, ÇÖZÜLMEMİŞ etkileşim (takip gerektirir):** `createContract` hâlâ KENDİ
  `firstPaymentCollected` zorunluluğunu taşıyor (FORMAL initial/renewal için). Artık kayıt anında
  BİR ilk ödeme zaten tahsil edilmiş olacağından, sözleşme oluşturma adımı aynı parayı İKİNCİ KEZ
  tahsil edilmiş gibi isteyebilir (gerçek çift tahsilat DEĞİL — iki ayrı `Payment` satırı, ama
  aynı gerçek-dünya parasını temsil ediyor olabilir). Bu oturumda `createContract`'ın kendi
  gate'i BİLİNÇLİ OLARAK DEĞİŞTİRİLMEDİ (kapsam: yalnızca `createStudentTool` sınırı) — reconciliation
  (sözleşme oluştururken kayıt anında zaten tahsil edilen ödemeyi tanıyıp tekrar İSTEMEMESİ) ayrı
  bir takip kalemi, `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`'ye eklendi.
- UI: `src/components/new-student-form.tsx`'e "İlk Ödeme / Kayıt Anı Tahsilatı" bölümü eklendi
  (yöntem, tutar — native number spinner YOK, `inputMode="numeric"` metin girişi —, tarih, dekont/
  referans, not, istisna gerekçesi). `src/lib/actions.ts` `actionAddStudent` bu alanları
  `createStudentTool`'a taşır.
- Testler: `src/lib/__tests__/registration-first-payment-boundary.test.ts` (yeni, 8 senaryo: eksik
  ödeme reddi, gün-1/gün-31 istisnasız kabul, tarih-farkı istisna gerekçesi, tutar-uyuşmazlığı
  reddi, çift-gönderim/retry idempotency, RBAC). Ayrıca `createStudentTool` çağıran 17 mevcut test
  dosyası (35+ çağrı yeri) yeni zorunlu alanla güncellendi (aksi halde hepsi kırılırdı) — bkz. git
  diff, `firstPaymentCollected` eklenen dosyalar listesi.

## 1. Bulgu — bu politika ÖNCEDEN hiç uygulanmıyordu (2026-08-29 durumu, tarihsel)

## 1. Bulgu — bu politika ÖNCEDEN hiç uygulanmıyordu

Kod tabanı taraması (grep, `createContract`/`addContractInstallments`/`createStudentContractSchema`)
doğruladı: `data/document-templates.json` ve `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`
zaten ödeme PENCERESİ metnini (kart 1–5, diğer 1–15) ve KDV dahil varsayılanını NİHAİLEŞTİRMİŞTİ,
ama "kayıt anında GERÇEKTEN bir ödeme tahsil edildi mi" sorusuna dair **hiçbir** kod/veri kontrolü
yoktu: `addContractInstallments` (`src/lib/store-json.ts`/`store-db.ts`/`store-memory.ts`) TÜM
taksitleri — 1. taksit dahil — her zaman `status:"pending"`, `paidAmount:0` olarak yaratıyordu.
Bu, sahibinin talimatının bu görevden ÖNCE karşılanmadığının kesin kanıtıdır.

## 2. Kapsam kararı (bu oturumda alınan tasarım kararı, gerekçeli)

Zorunluluk **FORMAL sözleşmelere** (`isFormalContractDuration`, süre ≥ 3 ay) ve **initial/renewal**
sözleşme türlerine uygulanır; **amendment** (mevcut bir taahhüdün düzenlenmesi, yeni bir tahsilat
anı yaratmaz) ve **tanışma/trial kaydı** (1-2 ay, zaten formal sözleşme/PDF üretmiyor — bkz.
`2026_2027_CONTRACT_SOURCE_IMPLEMENTATION_REPORT.md` §7-8) kapsam DIŞI bırakıldı. Gerekçe: görev
talimatının kendisi "formal/paid enrollment" ve "formal contract generation" ifadelerini kullanıyor;
trial kayıtların zaten ayrı, bilinçli olarak daha hafif bir iş kuralı var (`status:"recorded"`,
sözleşme belgesi yok) — bu ayrımı BOZMADAN üzerine inşa edildi. Bu bir sahiplik/karar noktasıdır:
**owner isterse trial kayıtlar için de zorunlu kılınabilir** — `src/lib/contracts.ts` içindeki
`requiresFirstPaymentAtRegistration` tek satırlık koşulu (`contractType !== "amendment" &&
isFormalContractDuration(durationMonths)`) değiştirilerek.

## 3. Yeni/değişen alanlar

### Sunucu (`src/lib/contracts.ts`, `src/lib/services/tools.ts`, `src/lib/store*.ts`)

- `CreateContractInput.firstPaymentCollected?: { method, amount, collectedAt, reference?, note? }` —
  yeni, opsiyonel-ama-formal-için-zorunlu alan.
- `createStudentContractSchema` (tools.ts, zod) — aynı şekli `firstPaymentCollected` adıyla dışa açar
  (`method: string`, `amount: number.int().positive()`, `collectedAt: string`, `reference?`, `note?`).
- `addContractInstallments` (üç store modu: json/db/memory — **mode parity korundu**) artık
  `firstPaymentCollected` alırsa 1. taksit `Payment` satırını doğrudan `status:"paid"`,
  `paidAmount:amount`, `paidAt:collectedAt`, `method:firstPaymentCollected.method` olarak yaratır;
  açıklamaya "— Kayıt anında tahsil edildi" + varsa referans/not eklenir. **Diğer tüm taksitler
  DEĞİŞMEDEN `pending`.**
- Yeni audit olayı: `contract.first_payment_collected` (method, amount, collectedAt, reference,
  varsa exceptionReason) — `StudentContract` entity'sine bağlı, `audit()` ortak altyapısıyla.

### İstemci (`src/components/contract-panel.tsx`)

Yeni **"İlk Ödeme / Kayıt Anı Tahsilatı"** `<fieldset>` — yalnızca formal (≥3 ay) sözleşmelerde
görünür: ödeme yöntemi, tahsil edilen tutar, ödeme tarihi (varsayılan: kayıt başlangıç tarihi),
opsiyonel referans/işlem no, opsiyonel personel notu. Erişilebilirlik: her alan `<Label>` + alan
bazlı `<FieldError role="alert">`; `aria-invalid`; klavye ile tamamen kullanılabilir (native
`<input>`/`<select>`); sunucu hatası ham `Error` metni olarak DEĞİL, `ServiceResult.fail(...)`
mesajı olarak (Türkçe) gösterilir — mevcut `postJson`/`formError` deseni korunuraktan.

## 4. Sunucu tarafı doğrulama davranışı (kod, `createContract`)

1. **Eksikse**: formal initial/renewal için `firstPaymentCollected` yoksa →
   `VALIDATION_ERROR`, mesaj tam olarak **"İlk ödeme kayıt sırasında tahsil edilmeden kayıt
   tamamlanamaz."** (`FIRST_PAYMENT_REQUIRED_MESSAGE`, dışa aktarılan sabit).
2. **Tutar uyuşmazlığı**: `firstPaymentCollected.amount`, gerçek hesaplanan 1. taksit tutarıyla
   (`buildInstallmentSchedule` — mevcut, KDV dahil, kuruş/float hatasız tam sayı aritmetiği)
   **birebir eşleşmeli**; eşleşmezse reddedilir — "sahte/kısmi ödeme kaydı" olasılığını KAPATIR
   (görev talimatı: "Never silently invent it").
3. **Tarih varsayılanı**: `collectedAt`, `enrollmentStartDate` ile AYNI güne (UTC gün karşılaştırması,
   saat dilimi kaymasına karşı `toISOString().slice(0,10)`) denk gelmelidir. Farklıysa
   **mevcut** `firstPaymentExceptionReason` alanı (zaten var olan, yetkili personel gerekçesi)
   zorunlu hale gelir — reddedilirse ayrı, net bir mesajla ("kayıt/kurulum tarihinden farklı...").
4. **Bilinçli olarak AYRI tutulan iki kontrol**: (a) yukarıdaki "ödeme kayıt günü mü" kontrolü,
   (b) ÖNCEDEN VAR OLAN "1. taksit vadesi (`firstDueDate`) kurumun ödeme PENCERESİ (kart 1–5,
   diğer 1–15) içinde mi" kontrolü. İkisi FARKLI olgular — görev talimatı açıkça bunun
   karıştırılmamasını istiyor ("do not show it merely because registration date falls after day
   5/15"). Kod bunu YAPISAL olarak ayırıyor: pencere kontrolü `firstDueDate`'e, kayıt-günü
   kontrolü `firstPaymentCollected.collectedAt`'a bakar — aynı `firstPaymentExceptionReason`
   alanını PAYLAŞIRLAR (ikisi de "yetkili personel gerekçesi" anlamına geldiği için), ama
   TETİKLENME KOŞULLARI birbirinden bağımsızdır (bkz. test: "sadece ayın 5/15'inden sonraki bir
   firstDueDate TEK BAŞINA ilk ödeme istisnası GEREKTİRMEZ").
5. **Taslak vs. Tamamlanmış Kayıt**: Mevcut veri modelinde ayrı bir "Taslak Kayıt" durumu
   YOK — `StudentContract` doğrudan `draft` yerine ilk oluşturmada zaten nihai (`generated`/
   `recorded`) statüde yaratılıyor (bkz. `contracts.ts` `toPublic`/status ataması). **Bu görevde
   yeni bir taslak kavramı İCAT EDİLMEDİ** (talimata uygun) — bunun yerine zorunluluk
   `createContract`'ın GİRİŞİNDE uygulanarak, kayıt hiç yaratılmadan reddedilir (yarım/taslak bir
   `StudentContract` satırı asla oluşmaz). Trial (1-2 ay) kayıtların zaten var olan `status:"recorded"`
   ayrımı (belge yok ama kayıt var) DOKUNULMADI.

## 5. Ödeme planı / sözleşme snapshot ayrımı

`ContractInstallmentView[]` (`installments[0]` = ilk taksit) artık `status:"paid"`,
`paidAmount = amount` olarak döner; UI'da (mevcut `previewContractInstallmentPlanTool`/taksit
listeleri) "1/N — paid" olarak ayrıca gösterilir — ayrı bir yeni bileşen İCAT EDİLMEDİ, mevcut
taksit tablosu zaten `status` alanını render ediyordu (ponytail: var olanı kullan). Toplam
sözleşme tutarı (`totalContractAmount = durationMonths * monthlyAmount`) **DEĞİŞMEDİ** — ilk
ödeme, taksit planının BİR PARÇASI olarak (ayrı bir yeni tutar kalemi icat edilmeden) sayılır;
test (`sumOfInstallments === totalContractAmount`) çift sayım OLMADIĞINI kanıtlar.

**KDV**: `vatInclusive` davranışı ve "Tüm eğitim ücretleri KDV dahildir." metni ÖNCEKİ oturumda
zaten nihaileşmişti (bkz. `NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md` §Sahibi kararı 2) —
bu oturumda DOKUNULMADI, yeni `firstPaymentCollected.amount` da AYNI KDV-dahil taksit tutarından
türetildiği için ayrıca KDV hesabı YAPILMADI (zaten dahil).

**PDF/sözleşme metni**: Kaynak/aktif şablon HÂLÂ `{{taksit1Tutar}}`/`{{taksit1Tarih}}`
placeholder'larını kullanıyor — bunlar zaten `installments[0]` üzerinden doldurulduğundan (mevcut
kod, DEĞİŞTİRİLMEDİ), yeni "kayıt anında tahsil edildi" bilgisi bu iki placeholder'a OTOMATİK
yansır (tutar/tarih artık gerçekten tahsil edilenle birebir). **Şablon gövdesine "ödeme yöntemi/
referans" için ayrı yeni bir placeholder EKLENMEDİ** — bu, kalan bir iş kalemi (bkz. §8).

## 6. Yenileme (renewal) davranışı

Aynı `createContract` yolu kullanıldığından, **yenilemeler için de** (formal, initial hariç aynı
kapsam) firstPaymentCollected zorunludur — görev talimatındaki "a new paid renewal commitment must
not finalize unless its first new-period payment is recorded" birebir karşılanır. Mevcut
önceki-dönem-borç kapısı (`computeOutstandingContractBalance`/`RenewalDebtBlockedError`,
`renewalDebtOverrideReason`) **DEĞİŞTİRİLMEDİ** — iki kontrol bağımsız ve İKİSİ DE geçmeli:
(a) önceki dönem borcu yok VEYA yetkili override var, (b) yeni dönemin ilk ödemesi tahsil edilmiş.
Test (`önceki dönemden ödenmemiş taksit varken yenileme CONFLICT ile reddedilir`) ve iki debt-gate
testi bu davranışla tutarlı olacak şekilde GÜNCELLENDİ (bkz. §7 — "ilk taksit artık kayıt anında
zaten tahsil edilmiş" gerçeğini yansıtacak beklenen tutarlar).

## 7. Testler (`src/lib/__tests__/contracts.test.ts`)

Yeni `describe("Owner policy (2026-08-29) — İlk ödeme her zaman kayıt esnasında alınacaktır")`
bloğu (7 yeni test):

- FORMAL kayıt `firstPaymentCollected` olmadan REDDEDİLİR, tam blocking mesajı doğrulanır.
- Geçerli `firstPaymentCollected` ile kayıt tamamlanır; 1. taksit `paid`, 2./3. `pending`;
  toplam taksit tutarı `totalContractAmount`'a eşit (çift sayım yok).
- Tahsil edilen tutar 1. taksit tutarıyla eşleşmezse reddedilir.
- TRIAL (<3 ay) kayıtta `firstPaymentCollected` ZORUNLU DEĞİL (kapsam dışı, kasıtlı).
- Ödeme tarihi kayıt tarihinden farklı + gerekçe YOK → reddedilir.
- Ödeme tarihi farklı + gerekçe VAR → kabul edilir (istisnai/gecikmeli kayıt).
- Yalnızca taksit vade PENCERESİ dışı olması (mevcut, ayrı kontrol) TEK BAŞINA bu yeni istisnayı
  TETİKLEMEZ — iki kontrolün bağımsızlığını kanıtlar.

Ayrıca **var olan** 5 test, bu davranış değişikliğini (1. taksit artık kayıt anında otomatik
"paid") yansıtacak şekilde GÜNCELLENDİ — hepsi doğrudan bu görevin kapsamındaki dosyaları test
ediyordu, hiçbiri ilgisiz/dokunulmaması gereken bir test DEĞİLDİ:
- `initialInput()` test yardımcı fonksiyonu artık gerçek `buildInstallmentSchedule` ile hesaplanan
  1. taksit tutarını içeren bir `firstPaymentCollected` varsayılanı üretir (overrides ile
  installmentCount/monthlyAmount değişse bile tutar HER ZAMAN doğru hesaplanır).
- İki "yenileme borç kapısı" testi: beklenen `outstandingAmount` artık `totalContractAmount -
  firstInstallmentAmount` (önceden `totalContractAmount` idi — artık gerçekçi değildi, çünkü 1.
  taksit zaten tahsil edilmiş sayılıyor).
- Bir "branchOptionsText/..." testi `createContract`'ı DOĞRUDAN çağırıyordu (tools.ts katmanını
  atlıyor) — `firstPaymentCollected` eklendi.

## 8. Kalan iş kalemleri / owner kararı gereken noktalar

- **Payment modelinde `reference`/`note` alanı YOK** (Prisma şeması + `Payment` tipi) — bu
  oturumda YENİ bir DB kolonu/migration EKLENMEDİ (talimat: prod/staging migration onayı
  gerektirir, bu görevin kapsamında değildi). Referans/not şu an yalnızca (a) `Payment.description`
  metnine ek olarak, (b) `contract.first_payment_collected` audit kaydında saklanıyor — TAM
  yapılandırılmış bir alan değil. Owner isterse ayrı bir P1 migration ile `Payment.reference`/
  `Payment.collectorNote` eklenebilir.
- **PDF şablonuna "ilk ödeme yöntemi/referansı" için ayrı placeholder eklenmedi** — mevcut
  `{{taksit1Tutar}}`/`{{taksit1Tarih}}` zaten doğru veriyi taşıyor ama "nakit mi kart mı,
  referans no" sözleşme METNİNDE görünmüyor. Bu, taslak şablonun (dtpl_fy9artyvontl) YENİ bir
  revizyonu gerektirir — henüz YAPILMADI, aktivasyon kararı zaten owner'da (bkz.
  `ACTIVE_TEMPLATE_RECOVERY_REPORT.md`).
- **Mobil app (`apps/mobile`) DOKUNULMADI** — bu görev yalnızca web admin panelini kapsıyor.
- **Trial (1-2 ay) kayıtların da zorunlu kılınması** — owner kararı bekleyen bir kapsam genişletme
  seçeneği (bkz. §2).

## 9. Doğrulama (bu oturumda çalıştırıldı)

- `npx prisma validate` → ✅ geçti.
- `npx prisma generate` → ✅ geçti (Prisma Client v7.9.1).
- `npx vitest run src/lib/__tests__/contracts.test.ts src/lib/__tests__/contract-template-schema.test.ts src/lib/__tests__/contract-list-helpers.test.ts` → ✅ **79/79 geçti**.
- `npm run typecheck` (`npx tsc --noEmit`) → ✅ temiz, hatasız.
- `npm run lint` (TAM repo) → çalıştı, exit 0; **132463 problem (15372 hata, 117091 uyarı)** —
  bu, bu görevden BAĞIMSIZ, repo genelinde ÖNCEDEN VAR OLAN bir taban çizgisi (ör.
  `student-attendance-picker.tsx`'te `react-hooks/set-state-in-effect`, `react/no-unescaped-entities`
  gibi bu görevin DOKUNMADIĞI dosyalarda). Bu görevin dokunduğu dosyalara ODAKLI
  `npx eslint src/lib/contracts.ts src/lib/store.ts src/lib/store-json.ts src/lib/store-db.ts
  src/lib/store-memory.ts src/lib/services/tools.ts src/components/contract-panel.tsx
  src/lib/__tests__/contracts.test.ts` → **0 hata**, yalnızca kodun kendi ÖNCEDEN VAR OLAN
  `_input`/`_ignored*` kuralına uyan 2 yeni uyarı (`_omit`, testte kasıtlı destructure-and-discard).
- `npm test` (TAM paket, senkron, `npm test > /tmp/npmtest3.log 2>&1`) → **214/222 dosya, 2246/2255
  test GEÇTİ**. 9 başarısız test, 8 dosya — TÜMÜ bu görevle İLİŞKİSİZ:
  - 6'sı önceki oturumlarda da AYNI şekilde belgelenmiş, ÖNCEDEN VAR OLAN başarısızlıklar
    (`lesson-scheduling.test.ts`, `program-academic-term.test.ts`, `lesson-series-tools.test.ts`,
    `find-person-schedule.test.ts`, `homework-attachment.test.ts`, `lesson-update.test.ts`) —
    hiçbiri `contracts.ts`/`tools.ts`'in değiştirilen kısımlarını, `store*.ts`'i veya
    `contract-panel.tsx`'i import etmiyor.
  - `branch-crud.test.ts` (2 test) — `contracts.ts`/`tools.ts`'in DEĞİŞTİRİLEN kısımlarıyla
    hiçbir bağlantısı yok (`createBranchTool`/`createTeacherTool`/`createRoomTool` çağırıyor);
    İZOLE çalıştırıldığında da (`npx vitest run src/lib/__tests__/branch-crud.test.ts`) AYNI
    şekilde başarısız — enstrüman kataloğu/seed verisiyle ilgili ÖNCEDEN VAR OLAN, bu görevden
    BAĞIMSIZ bir sorun.
  - `teacher-contract-reminder-tick.test.ts` ("31 gün kala üretmez") — tarih-bağımlı bir test;
    bu test paketinin çalıştığı anda (23:59:49 → gece yarısını geçti) sistem tarihi
    2026-08-29'dan 2026-08-30'a döndü, testin `ymdDaysFromNow(31)` hesaplaması ile tick motorunun
    kendi "bugün" hesaplaması arasında ANLIK bir gün kayması oluştu — saat/tarih flake'i,
    `contracts.ts`/`tools.ts`/`store*.ts` ile HİÇBİR import ilişkisi yok.
- `npm run build` (Turbopack, production) → **✅ başarılı, exit code 0** — `/panel/ogrenciler/[studentId]/sozlesmeler`, `/sozlesme-yazdir/[contractId]`, `/veli/sozlesmelerim` dahil tüm rotalar derlendi.
- `git diff --check` → temiz (exit 0).

## 10. Onay — hiçbir stage/commit/push/deploy/migration/aktivasyon yapılmadı

Bu görev boyunca hiçbir `git add`/`git commit`/`git push`/deploy komutu çalıştırılmadı; hiçbir
shared/staging/production migration uygulanmadı (yalnızca yerel `prisma generate`/`validate`);
hiçbir sözleşme şablonu otomatik etkinleştirilmedi; hiçbir tarihsel sözleşme/ödeme kaydı/PDF
değiştirilmedi; bu görev dışındaki dirty dosyalara dokunulmadı; hiçbir ek git worktree
oluşturulmadı.
