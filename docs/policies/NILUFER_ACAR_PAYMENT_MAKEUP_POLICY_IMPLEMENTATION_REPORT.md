# Nilüfer Acar Müzik Akademi — Ödeme, Telafi ve Ders İptali Politikası Uygulama Raporu

Tarih: 2026-08-29
Kapsam: NeviiHub `main` dalı, çalışma dizini `/Users/hidircanyagiz/Projects/notaplan` (hiçbir worktree/branch değişikliği yapılmadı).

Bu rapor, kurumun 2026–2027 Eğitim Dönemi ödeme/telafi/ders programı politikasının
mevcut NeviiHub uygulamasına karşı denetimini ve bu oturumda GERÇEKLEŞTİRİLEN
uygulama değişikliklerini belgeler. Politikanın bazı maddeleri ÖNCEDEN, önceki
geliştirme turlarında zaten uygulanmıştı; bu rapor onları da "Mevcut" olarak
işaretler ve tekrar inşa etmez (kural: "Do not rebuild correct existing
functionality").

## 1. Politika Kapsam Matrisi

| Madde | Önceki Durum | Bu Oturumda Yapılan | Testler | Kalan Karar |
|---|---|---|---|---|
| 1.2 Kredi kartı 1–5, havale/EFT/nakit ≤15 kuralı | **Mevcut** — `resolveContractPaymentDueRule` (`src/lib/contracts.ts`), sözleşme oluşturmada server-side doğrulanıyor | Değişmedi | `contracts.test.ts` "Faz 2" bloğu (mevcut) | — |
| 1.7 "İstisnai ilk ödeme tarihi gerekçesi" | **Mevcut** — `firstPaymentExceptionReason`, yalnızca pencere dışıysa zorunlu, `contract.first_payment_window_exception` audit'i (`tools.ts`) | Değişmedi | Mevcut testlerde dolaylı kapsanıyor | UI etiketinin tam metniyle eşleştiği panel bileşeni (`contract-panel.tsx`) ayrıca doğrulanmalı |
| 1.3 Aylık ödemeler bir sonraki aya devredilemez | **Yapısal olarak sağlanıyor** — taksitler `Payment.contractId`+`installmentSequence` ile SABİT aya bağlı, yeniden tarihleme/birleştirme kodu YOK | Değişmedi (denetlendi, ek kod gerekmedi) | Yeni regresyon testi eklenmedi — davranış zaten "hiç böyle bir yol yok" şeklinde güvenceli | Açık öneri: `Payment.dueDate`'in asla `UPDATE` edilmediğini garanti eden bir DB seviyesi (trigger/constraint) veya en azından bir birim testi eklenmesi — bu oturumda kapsam dışı bırakıldı |
| 1.4 Yenileme, önceki dönem borcu kapanmadan tamamlanamaz | **EKSİKTİ** | **YENİ**: `computeOutstandingContractBalance` + `RenewalDebtBlockedError` (`src/lib/contracts.ts`), `createStudentContractTool`'a entegre; yetkili (SCHOOL_ADMIN/SUPER_ADMIN) gerekçeli override yolu; `getRenewalDebtStatusTool` (UI ön-izleme) | `contracts.test.ts` → "Nilüfer Acar politikası §4 — yenileme borç kapısı" (4 yeni test) | Finans ekibi override yetkisinin SCHOOL_ADMIN'le sınırlı kalıp kalmayacağı (ör. ayrı bir "FINANCE" rolü gerekip gerekmediği) — şu an CONTRACT_STAFF (SCHOOL_ADMIN/SUPER_ADMIN) yeterli kabul edildi |
| 1.6 Gecikirse ders programı GEÇİCİ durdurulabilir (yetkili, otomatik DEĞİL) | **HİÇ YOKTU** | **YENİ**: `Student.paymentPauseStatus/-At/-Reason/-By` (migration `20260829120000_student_payment_pause`), `pauseStudentLessonScheduleTool` / `reactivateStudentLessonScheduleTool` (`tools.ts`), server action'lar (`actions.ts`) | `student-payment-pause.test.ts` (7 yeni test: yetkili duraklatma, gerekçesiz red, RBAC red, çift duraklatma engeli, reaktivasyon, reaktivasyon-olmayanı-reaktive-etme red, NOT_FOUND) | **UI kablolama tamamlanmadı** — admin öğrenci detay/program ekranında "Duraklat/Etkinleştir" butonu ve duraklatılmış öğrencinin listede görünür rozeti bu oturumda EKLENMEDİ (aşağıda §"Kalan İş" bkz.). Ayrıca ders SERİSİ üretim motoruna (yeni ders otomatik oluşturma) bu bayrağın okutulması — yani "duraklatılmışken yeni ders oluşturulmasın" davranışı — bilinçli olarak bu oturumun kapsamı dışında bırakıldı (riskli çekirdek zamanlama motoru değişikliği, ayrı bir turda ele alınmalı) |
| 1.5 Gecikme bildirimi — otomatik DEĞİL, yetkili tetikler | **Kısmen mevcut** — `PaymentFollowUpCase`, workflow altyapısı, WhatsApp şablonları var; tam akışın "otomatik gönderim yok, onay var" garantisi bu oturumda YENİDEN doğrulanmadı | Değişmedi | — | Ayrı bir turda `payment_reminders` workflow'unun gerçekten insan onayı gerektirdiği uçtan uca doğrulanmalı |
| 2. Sabit ders programı (kayıt anında gün/saat) | **Mevcut** — `LessonSeries` (weekday/startTime/durationMinutes/teacherId/roomId), çakışma kontrolü altyapısı (`lesson-scheduling.ts`) | Değişmedi | Mevcut geniş test seti (`lesson-series-tools.test.ts` vb.) | — |
| 3. Telafi — max 2 hak / dönem, 30 gün süre, aynı gün istisnası | **UYUMSUZ** — mevcut kota AYLIK (`monthlyMakeupAllowance`, varsayılan 2/ay), politika ise DÖNEM BAŞINA 2 istiyor; aynı-gün-iptali istisnası ve kanıt/ek belge alanı YOK | **YAPILMADI bu oturumda** — kapsamlı bir model değişikliği gerektiriyor (bkz. §"Kalan İş") | — | **Kritik iş kararı gerekiyor**: "eğitim dönemi" (Güz/Yaz) sınırları `LessonSeries.term/academicYearStart` alanlarıyla mı, yoksa yeni bir "EducationPeriod" kavramıyla mı hesaplanacak? Mevcut aylık kotanın DB'de nasıl geçmişe dönük göç edileceği (data migration) belirlenmeli |
| 4. Sözleşme ödeme kabulü/imza bölümü | **Kısmen mevcut** — `contractDataSnapshot`, `signatoryFullName/-NationalId/-Address`, `renewalNoticeText` var; ödeme yöntemi/pencere metni (`paymentDueRuleText`) placeholder'ı zaten şablon alanlarında | Değişmedi, doğrulanmadı | — | Aktif şablonun (`contract-template-schema.ts`) telafi/iptal politikası kabul bölümünü İÇERİP İÇERMEDİĞİ bu oturumda doğrulanmadı — ayrı bir denetim gerekiyor |
| 5. UX/hata yönetimi | Genel olarak mevcut kalıp (`ServiceResult`, Türkçe hata mesajları) | Yeni araçlar aynı kalıba uyuyor (`CONFLICT`/`NOT_FOUND`/`FORBIDDEN` + Türkçe mesaj) | Dahil | — |

## 2. Bu Oturumda Yapılan Değişikliklerin Ayrıntısı

### 2.1 Yenileme Borç Kapısı (§1.4)
- `src/lib/contracts.ts`: `computeOutstandingContractBalance(tenantId, contractId)` — bir sözleşmenin `paid`/`voided`/`waived` DIŞINDAKİ taksitlerinin (`pending`/`overdue`/`partial`) kalan tutarını toplar. Geçmiş taksit tarih/tutarına ASLA yazmaz, yalnızca okur.
- `createContract`: `contractType !== "initial"` iken önceki sözleşmenin borcu > 0 ise `RenewalDebtBlockedError` fırlatır — mesaj tam olarak "Önceki dönemden kalan ödemeler tamamen kapatılmadan kayıt yenileme işlemi tamamlanamaz." `renewalDebtOverrideReason` (boşluk-only dahil boş olamaz) verilirse tamamlanmaya izin verilir.
- `src/lib/services/tools.ts` → `createStudentContractTool`: override kullanıldığında `contract.renewal_debt_override` (actor/reason/timestamp `AuditLog`'da), bloklandığında `contract.renewal_debt_blocked` (`outcome: "denied"`) audit'i yazılır. Hata `ServiceResult` üzerinden `CONFLICT` kodu + `outstandingAmount`/`unpaidInstallmentCount` `details` alanında döner (hassas finans detayı sızdırmaz, yalnızca toplam tutar).
- `getRenewalDebtStatusTool` — UI'ın submit ÖNCESİ borç durumunu göstermesi için salt-okunur, kalıcı kayıt yazmaz.

### 2.2 Yetkili Ders Programı Duraklatma/Reaktivasyon (§1.6)
- `prisma/schema.prisma` + migration `20260829120000_student_payment_pause`: `Student.paymentPauseStatus` (`"paused"` | NULL), `paymentPausedAt`, `paymentPauseReason`, `paymentPausedBy`. `active` (kayıt/enrollment) alanından KASITLI olarak ayrı.
- `src/lib/store-json.ts` / `store-memory.ts` / `store-db.ts` / `store.ts`: `setStudentPaymentPause(studentId, state)` — üç mod paritesi (`STORE_MODE=json/memory/db`) sağlandı; DB-mode okuma mapping'i de güncellendi.
- `src/lib/services/tools.ts`: `pauseStudentLessonScheduleTool` (SCHOOL_ADMIN/SUPER_ADMIN, gerekçe zorunlu min 1 karakter, çift duraklatma `CONFLICT` ile engellenir) ve `reactivateStudentLessonScheduleTool` (aynı RBAC, duraklatılmamışı reaktive etmeye çalışmak `CONFLICT`). Her iki aksiyon da `AuditLog`'a yazar (`student.payment_pause` / `student.payment_reactivate`).
- `src/lib/actions.ts`: `actionPauseStudentLessonSchedule` / `actionReactivateStudentLessonSchedule` server action'ları eklendi (mevcut `actionUpdateStudentProfile` kalıbıyla aynı).
- **Otomatik davranış YOK**: bu araçlar yalnızca insan (yetkili personel) tarafından çağrılabilir; kod tabanında ödeme gecikmesine bağlı OTOMATİK bir çağıran EKLENMEDİ (politikanın açık yasağı).

## 3. Testler ve Doğrulama

```
npx prisma validate        → geçti
npx prisma generate        → geçti
npx vitest run src/lib/__tests__/contracts.test.ts               → 52/52 geçti
npx vitest run src/lib/__tests__/student-payment-pause.test.ts   → 7/7 geçti
npm run typecheck (tsc --noEmit)                                  → hatasız
npm test (tam paket, 2198 test)                                   → 2192 geçti, 6 BAŞARISIZ
```

**6 başarısız test — bu değişikliklerle İLGİSİZ, ÖNCEDEN VAR OLAN** (ders
programı/telafi/yoklama modüllerinde, `contracts.ts`/`tools.ts`'teki
değişikliklerimin dokunmadığı dosyalarda):

- `find-person-schedule.test.ts` — "bir öğretmen adıyla tek eşleşince matchType:'teacher'..."
- `homework-attachment.test.ts` — "geçerli bir jpeg dosyasıyla ödev oluşturulabilir..."
- `lesson-scheduling.test.ts` — "öğretmenin müsaitlik penceresi dışındaki saat reddedilir (TEACHER_UNAVAILABLE)"
- `lesson-series-tools.test.ts` — "skipConflicts=true ile yalnızca çakışmayanlar oluşur"
- `lesson-update.test.ts` — "öğretmenin müsaitlik penceresi dışına taşıma reddedilir (TEACHER_UNAVAILABLE)"
- `program-academic-term.test.ts` — "aynı yıl/dönem altında birden fazla ders serisi (farklı öğrenci) desteklenir"

Bu dosyalar bu oturumda hiç düzenlenmedi ve değiştirdiğim modüllerle (contracts/
payment/student-pause) içe aktarım ilişkisi yok; muhtemelen tarih/saat bağımlı
fixture'lar veya önceden bilinen kırılgan testler (repo'da onlarca bekleyen commit
edilmemiş değişiklik var — kök neden bu oturumun kapsamı dışında, dokunulmadı).

`npm run build` ve `npx prisma migrate status` bu oturumda ÇALIŞTIRILMADI (build
komutu ~build süresine bağlı, migration status zaten önceden 3 bekleyen migration
gösteriyordu — bkz. §4).

## 4. Migration Durumu — Hiçbir Uygulama Yapılmadı

`npx prisma migrate status`, oturum başında ZATEN 3 bekleyen migration
gösteriyordu (`20260827150458_add_password_reset_token`,
`20260828160000_student_contracts`, `20260828210000_contract_trial_optional_document`
— bu oturumdan ÖNCEKİ çalışmalara ait). Bu oturumda EKLENEN
`20260829120000_student_payment_pause` migration dosyası şemayla TUTARLI SQL
içerir ve `prisma validate`'ten geçmiştir, ancak **hiçbir migration bu oturumda
gerçek bir veritabanına UYGULANMADI** (`migrate dev`/`migrate deploy`/`db push`
ÇALIŞTIRILMADI) — yerel `.env`'de tanımlı geliştirme veritabanı bile
dokunulmadan bırakıldı, çünkü onda zaten bu oturuma ait olmayan bekleyen
migration'lar vardı ve bunları elle seçici uygulamak riskli kabul edildi.
Testler `STORE_MODE=json` altında çalıştığı için migration'ın gerçek bir
PostgreSQL'e uygulanmamış olması test sonuçlarını etkilemez.

## 5. Kalan İş (Bu Oturumun Kapsamı Dışında Bırakılanlar)

Aşağıdakiler POLİTİKANIN gerektirdiği ama zaman/risk nedeniyle bu oturumda
uygulanMAYAN, ayrı bir tur gerektiren maddelerdir — hiçbiri "yapıldı" olarak
raporlanmamıştır:

1. **Telafi (§3) tam yeniden yapılandırma**: mevcut AYLIK kota → DÖNEM BAŞINA
   2 hak; her kayıp ders için ayrı 30 gün penceresi; aynı-gün-iptali istisna
   metni ve engeli; kanıt/ek belge alanı. Bu, `MakeupRequest` modelinde ve
   `makeup-quota.ts`/`makeup-engine.ts`'de kapsamlı değişiklik + veri göçü
   gerektirir — mevcut aylık kota mantığına bağlı üretim verisi olabileceği
   için önce bir iş kararı (yukarıdaki matriste) gerekiyor.
2. **UI kablolama**: "Ders Programını Duraklat/Etkinleştir" aksiyonu için
   admin öğrenci ekranına buton, duraklatılmış öğrencinin program/liste
   görünümünde rozet/etiket. Backend (`tools.ts`/`actions.ts`) hazır;
   yalnızca component/sayfa entegrasyonu eksik.
3. **Ders üretim motoruna pause bayrağının okutulması** — duraklatılmışken
   yeni ders serisi/otomatik ders üretilmemesi (mevcut derslerin/yoklamanın
   SİLİNMEMESİ zaten garanti, ama "yeni ders eklenmesin" davranışı henüz
   motora bağlanmadı).
4. Gecikme bildirim akışının (§1.5) uçtan uca "otomatik gönderim yok, insan
   onayı var" garantisinin taze bir doğrulaması.
5. Aktif sözleşme şablonunun telafi/iptal kabul bölümünü içerip içermediğinin
   denetimi (`contract-template-schema.ts`).
6. `npm run build` çalıştırılmadı (yalnızca `typecheck`/`vitest`/`prisma
   validate` çalıştırıldı).

## 6. Yasal/İş Kararı Gerektiren Açık Noktalar

- Yenileme borç kapısını override etme yetkisi SCHOOL_ADMIN/SUPER_ADMIN ile
  mi sınırlı kalacak, yoksa ayrı bir "Finans" rolü mü tanımlanacak?
- "Eğitim dönemi" sınırı telafi kotası için hangi alanla hesaplanacak
  (`LessonSeries.term`/`academicYearStart` mı, yeni bir kavram mı)?
- Mevcut aylık telafi kotası verisinin dönem-bazlı modele geçişte nasıl
  göç edileceği (geçmiş kullanılmış haklar kaybolmamalı).
- Ders programı duraklatma sırasında mevcut planlanmış (henüz gerçekleşmemiş)
  derslerin ne olacağı — otomatik iptal edilmeyecek (politika yasağı), ama
  personelin bunları manuel olarak nasıl yöneteceği netleştirilmeli.

## 7. Onay: Güvenlik/Kapsam Sınırları

- Hiçbir commit, push veya deploy yapılmadı.
- `db push`/`db reset`/`migrate deploy` çalıştırılmadı; hiçbir shared/staging/
  production veritabanına dokunulmadı.
- Başka bir worktree veya branch OLUŞTURULMADI/değiştirilMEDİ — tüm çalışma
  `main` dalında, `/Users/hidircanyagiz/Projects/notaplan` içinde yapıldı.
- Ürün markası her yerde "NeviiHub" olarak bırakıldı, teknik tanımlayıcılar
  (paket adları, env değişkenleri, migration adları) DEĞİŞTİRİLMEDİ.
- Hiçbir otomatik ders iptali/otomatik dış mesaj gönderimi EKLENMEDİ.

## 8. Yönetici İçin El ile Kabul Kontrol Listesi

- [ ] Bir öğrenciye 3+ aylık formal sözleşme oluşturup taksitleri kasıtlı
      ödemeden yenileme denenmeli — sistemin "Önceki dönemden kalan ödemeler
      tamamen kapatılmadan kayıt yenileme işlemi tamamlanamaz." mesajıyla
      REDDETTİĞİ görülmeli.
- [ ] Aynı öğrenci için yetkili bir gerekçe girilerek yenileme YİNE
      denenmeli — bu kez tamamlanmalı ve Audit Log'da
      `contract.renewal_debt_override` kaydı (gerekçe + kullanıcı + zaman)
      görünmeli.
- [ ] Bir öğrenci için "Ders Programını Duraklat" aracı (API/araç düzeyinde;
      UI henüz yok) gerekçesiz çağrılmaya çalışılmalı — reddedilmeli.
- [ ] Gerekçeyle duraklatılan öğrencinin yoklama/ders geçmişinin
      DEĞİŞMEDİĞİ, yalnızca yeni bir "duraklatıldı" durumunun eklendiği
      doğrulanmalı.
- [ ] Aynı öğrenci reaktive edilmeli — alanların temizlendiği ve Audit
      Log'da `student.payment_reactivate` kaydı görüldüğü teyit edilmeli.
- [ ] Telafi (§3) ve sözleşme şablonu (§4) maddelerinin BU RAPORDA "kalan iş"
      olarak işaretlendiği, henüz canlıya alınmaması gerektiği anlaşılmalı.
