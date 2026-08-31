# P0 "Invalid Input" Olayı ve Sözleşme Revizyonu — Final Rapor

Tarih: 2026-08-29. Bu rapor, "Yeni Öğrenci Kaydı" akışındaki P0 runtime hatasının kök nedenini, düzeltmesini ve aynı oturumda tamamlanan owner-approved sözleşme revizyonunu belgeler.

## EK — Sistemik desen taraması ve 5 formun daha düzeltilmesi (aynı gün, sonraki artış)

Kök neden düzeltmesi sırasında AYNI çökme deseninin (`assertOk` throw eder, form `useActionState` YOK bir `<form action=...>` ile bağlıdır) `actions.ts`'te BAŞKA YERLERDE de tekrarlandığı fark edildi. Kullanıcı onayıyla ("Fix all 5") aşağıdaki 5 action DA AYNI şekilde düzeltildi (throw ETMEZ, `useActionState`-uyumlu state döner, ilgili form(lar) client component'e taşındı, hedefli regresyon testleri eklendi):

| Action | Form(lar) | Yeni state tipi | Not |
| --- | --- | --- | --- |
| `actionMarkAttendance` | `ogretmen/page.tsx` (4 hızlı-eylem butonu → `AttendanceQuickActionForm`) | `MarkAttendanceFormState` | **En yüksek öncelik** — öğretmenler tarafından HER ders için, günde onlarca kez tetiklenir; kayıt formlarının aksine nadir bir admin eylemi DEĞİL. |
| `actionAddPayment` | `odemeler/page.tsx` + `odemeler/[studentId]/page.tsx` → paylaşılan `AddPaymentForm` | `AddPaymentFormState` | İki sayfa AYNI bileşeni (dropdown/gizli-alan modu) kullanır. |
| `actionAddRoom` | `odalar/page.tsx` → `NewRoomForm` | `AddRoomFormState` | |
| `actionAddBranch` | `subeler/page.tsx` → `NewBranchForm` | `AddBranchFormState` | |
| `actionUpdateBranch` | `subeler/page.tsx` (satır içi düzenleme) → `UpdateBranchForm` | `UpdateBranchFormState` | |

Ortak alt yapı: `ToolValidationFailure` sınıfı (önceden `StudentValidationFailure` — tüm bu action'lar arasında PAYLAŞILACAK şekilde genelleştirildi) ve `fieldErrorsFromZodFlatten` yardımcı fonksiyonu — hepsi `actions.ts`'te TEK bir yerde tanımlı, kod tekrarı YOK.

**Kapsam dışı bırakılan, dürüstçe kaydedilen kalan kalemler:** `actions.ts`'te hâlâ AYNI `assertOk` deseniyle 6 action DAHA var (`actionGenerateSuggestions`, `actionConfirmSlot`, `actionCancelMakeup`, ve 2 demo/reset yardımcı action'ı — `resetDemoTool`/`resetToCleanTemplateTool` sarmalayıcıları). Bunlar kullanıcı onayının KAPSAMI DIŞINDA bırakıldı (yalnızca isimlendirilmiş 5 action onaylandı) — `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`'ye P1 olarak eklenmelidir.

**Doğrulama:** 9 yeni/güncellenen test (`write-scope-actions.test.ts`, toplam 28 test bu dosyada), `npm run typecheck` temiz, hedefli `eslint` temiz, `npm test` (tam paket) 2238/2244 (aynı 6 önceden var olan ilgisiz hata, sıfır regresyon), `npm run build` başarılı, `git diff --check` temiz.

## EK 2 — Kalan 6 action'ın kapanışı ve nihai tarama (2026-08-29, aynı gün, üçüncü artış)

EK 1'de "kapsam dışı" bırakılan 6 kalemin nihai durumu:

- `actionGenerateSuggestions`, `actionConfirmSlot`, `actionCancelMakeup` (telafi/page.tsx) → AYNI desenle düzeltildi (`SimpleActionFormState`, `GenerateSuggestionsForm` + güncellenmiş `makeup-decision-form.tsx`).
- `actionResetDemo` / `actionResetToCleanTemplate` → incelendi, GÜVENLİ olduğu doğrulandı (bare `<form action=...>` DEĞİL, `SetupResetAction`'ın `useTransition`+try/catch sarmalayıcısı üzerinden çağrılıyor — throw zaten düzgün yakalanıyor). Düzeltme GEREKMEDİ.
- Ayrıca bu turda YENİ bir örnek daha bulundu: `actionCreateTaskForm` (`is-takip/liste/page.tsx`, `QuickTaskLink` aracılığıyla uygulama genelinde onlarca yerden erişilebilir) — AYNI desenle düzeltildi (`CreateTaskFormState`, `NewTaskForm`). Ayrıca `createTaskFromFormData`'nın catch bloğunda eksik olan `WriteScopeDeniedError` kontrolü de eklendi (ikincil bug).

**Nihai kapsam taraması:** `src/app/` ve `src/components/` tamamında `<form action=` / `<form\s*$` için ikinci bir tam tarama yapıldı (~30 ek form: `crm`, `finans-ozeti`, `personel/*`, `ayarlar/kvkk`, `ogrenci/ayarlar/*`, `package-manager.tsx`, `staff-manager.tsx`, `instrument-catalog-manager.tsx`, `staff-detail-form.tsx`, `task-detail-panel.tsx`, `kvkk-consent-gate.tsx`, `sozlesmeler/page.tsx`). Her formun bağlı olduğu action `actions.ts`'te tek tek okunarak doğrulandı — HİÇBİRİ throw etmiyor, hepsi zaten `{ok:false, message}` döndüren "graceful" desenle yazılmış. Toplamda düzeltilen action sayısı **11** (`actionAddStudent`, `actionAddTeacher`, `actionMarkAttendance`, `actionAddPayment`, `actionAddRoom`, `actionAddBranch`, `actionUpdateBranch`, `actionGenerateSuggestions`, `actionConfirmSlot`, `actionCancelMakeup`, `actionCreateTaskForm`), 1 ölü kod silindi (`actionMarkPaymentPaid`), 2 incelenip güvenli bulundu (`actionResetDemo`/`actionResetToCleanTemplate`).

**Nihai doğrulama gate'i (bu artıştan sonra tekrar tam çalıştırıldı):** `npx prisma validate` ✅, `npx prisma generate` ✅, `npm run typecheck` ✅ (0 hata), `npm run lint` — dokunulan dosyalarda 0 hata/0 uyarı (repo genelinde ~15k pre-existing `react-hooks/set-state-in-effect` + `react/no-unescaped-entities` hatası VAR ama bunlar dokunulmayan dosyalarda, bu P0 işinden önce de mevcuttu, bu oturumun kapsamı dışında), `npm test` (tam paket, `STORE_MODE=json VERCEL=1`) 2242/2248 (AYNI 6 önceden var olan ilgisiz hata — `lesson-scheduling`, `program-academic-term`, `lesson-series-tools`, `homework-attachment`, `lesson-update` ve bir altıncısı — sıfır yeni regresyon), `npm run build` ✅ başarılı (tüm route'lar derlendi), `git diff --check` ✅ temiz. Hiçbir stage/commit/push/deploy/migration işlemi yapılmadı.

## 1. "Invalid input" hatasının kesin kök nedeni

**Enstrüman kataloğu (`data/instrument-catalog.json`, admin tarafından `/panel/enstrumanlar` ekranından serbestçe genişletilebilir) ile `studentSchema.instrument`'ın (validation.ts) SABİT 8 değerlik zod enum'u senkron dışı kalmıştı.**

Somut kanıt: canlı katalog verisinde **"Bas Gitar"** ve **"Ukulele"** zaten `active` olarak kayıtlıydı (seed'den sonra eklenmiş), ama `studentSchema.instrument` hâlâ yalnızca `["Piyano","Yan Flüt","Gitar","Bateri","Keman","Şan","Bağlama","Elektro Gitar"]` kabul ediyordu. "Yeni Öğrenci Kaydı" formunun (`yeni/page.tsx`) enstrüman dropdown'ı kataloğun GÜNCEL/aktif listesini gösterdiğinden (`StudentInstrumentTeacherFields`, tüm 10 enstrümanı listeler, öğretmen eşleşmesi olmasa bile), bir personelin bu iki enstrümandan birini seçmesi **tamamen normal, geçerli bir kullanıcı eylemidir** — hatalı/kötü niyetli girdi DEĞİLDİR.

Bu seçim yapıldığında `createStudentTool` içindeki `parseOrFail(studentSchema, input)` zod doğrulaması REDDEDİYOR, `src/lib/services/result.ts`'teki `fromZodError` jenerik **"Invalid input"** mesajını üretiyordu. `actions.ts`'teki `assertOk()` bu sonucu `throw new Error("Invalid input")` ile FIRLATIYOR, `actionAddStudent`'ın catch bloğu bunu YENİDEN FIRLATIYORDU (`throw error`). Form `<form action={actionAddStudent}>` (React `useActionState` YOK) ile bağlı olduğundan, bu throw hiçbir hata sınırına takılmadan doğrudan istemciye **"Runtime Error: Invalid input"** olarak sızıyordu — form kayboluyor, girilen tüm veriler siliniyordu.

Aynı kök neden sınıfı **5 farklı yerde** tekrarlanmış hâldeydi (aynı sabit 8'li enum, kopyala-yapıştır): `studentSchema.instrument`, `roomSchema.instruments`, `lessonSchema.instrument`, `suggestLessonSlotsSchema.instrument`, `lessonSeriesParamsBaseSchema.instrument` — ve AYRICA `teacherSchema.instrument` (TEACHER_INSTRUMENT_ENUM, ayrı sabit) için de. `teacherInstrumentSkillSchema.instrument` ise zaten BİLİNÇLİ OLARAK serbest string'ti (kod yorumu: "kurumun Enstrümanlar kataloğundaki ek enstrümanları da kabul edebilmesi için") — bu, tasarımın doğru yönünü zaten kanıtlıyordu; yalnızca 6 birincil alan bu deseni MİSSED etmişti.

## 2. Hangi dosya/katmanda düzeltildiği

| Dosya | Değişiklik |
| --- | --- |
| `src/lib/validation.ts` | 6 sabit enum → `z.string().min(1)` (studentSchema, roomSchema, lessonSchema, suggestLessonSlotsSchema, lessonSeriesParamsBaseSchema, teacherSchema). Gerçek doğrulama korunuyor: `createStudentTool`/`createTeacherTool`/`makeup-engine.ts` zaten GERÇEK veriyle (öğretmen/oda/kataloğun aktif listesi) kontrol ediyordu — statik enum yalnızca GEREKSİZ, artık zararlı bir ikinci kapıydı. |
| `src/lib/services/tools.ts` | `createTeacherTool`'a, `instrumentLevels` verilmediği (legacy tekil `instrument`) yolda `resolveActiveInstrumentNames` ile AYNI tenant-scoped katalog kontrolü eklendi (önceden yalnızca çoklu-enstrüman yolunda vardı) — şema gevşetildi ama doğrulama GÜÇLENDİ, zayıflamadı. İki `SeriesParams`/`checkSeriesOccurrences` çağrısına `as Instrument` type cast'i eklendi (yalnızca TS tip uyumu, davranış değişikliği yok). |
| `src/lib/actions.ts` | `actionAddStudent` YAPISAL OLARAK yeniden tasarlandı: `(formData)` → `(prevState, formData)` imzası (`useActionState` uyumlu). `assertOk`'ın throw-based deseni KALDIRILDI; `createStudentTool` başarısızlığı artık `NewStudentFormState` olarak DÖNER, THROW ETMEZ. `WriteScopeDeniedError` de (diğer TÜM action'larla AYNI, önceden var olan desen) artık zarif döner — bu action ÖNCEDEN bu ortak desenden SAPMIŞTI. |
| `src/components/new-student-form.tsx` (YENİ) | Formun tamamı client component'e taşındı, `useActionState` ile bağlandı — alan bazlı Türkçe hatalar + üstte erişilebilir özet + `isPending` ile çift-submit koruması. |
| `src/app/panel/ogrenciler/yeni/page.tsx` | Sunucu verisini (şubeler/öğretmenler/paketler/enstrüman kataloğu/KVKK metni) çekmeye devam eder, formu artık `<NewStudentForm>`'a devreder. |

## 3. Yeni öğrenci kaydının manuel doğrulama sonucu

**Gerçek tarayıcı ile tıklama testi (Playwright) bu ortamda YAPILAMADI** — Playwright MCP aracı yalnızca sistemde kurulu gerçek Google Chrome'u kullanıyor; `/Applications/Google Chrome` incelendiğinde bunun gerçek bir uygulama DEĞİL, 1720 byte'lık bozuk/eksik bir kalıntı dosya olduğu görüldü, kurulumu `sudo` gerektiriyor (etkileşimsiz ortamda mevcut değil). Bu dürüstçe raporlanan bir ortam kısıtıdır, gizlenmedi.

**Bunun yerine, kullanıcının ZATEN AÇIK olan `npm run dev` sürecine karşı GERÇEK HTTP istekleriyle canlı doğrulama yapıldı** (Playwright'ın alternatifi — tarayıcı tıklaması değil ama GERÇEK sunucu sürecine, gerçek network üzerinden, gerçek JWT oturumuyla): `/api/v1/auth/login` ile giriş yapılıp gerçek bir erişim token'ı alındı; `/api/v1/teachers` ile "Bas Gitar" enstrümanlı bir öğretmen (`tch_7epmkwtkfvi8`) oluşturuldu (ÖNCEDEN `TEACHER_INSTRUMENT_ENUM` ile REDDEDİLİRDİ); ardından `/api/v1/students` ile TAM OLARAK raporlanan hatayı üreten senaryo — "Bas Gitar" enstrümanlı yeni öğrenci kaydı — denendi ve **`HTTP/1.1 200 OK`, `{"ok":true,"data":{"studentId":"stu_xqcsae2rg3s5"}}`** ile BAŞARIYLA tamamlandı. Bu, kod içi (in-process) testlerin ÖTESİNDE, gerçek çalışan sunucu sürecine karşı doğrulanmış somut kanıttır.

**Temizlik notu:** Bu doğrulama sırasında oluşturulan `tch_7epmkwtkfvi8` ("P0 Doğrulama Öğretmeni") ve `stu_xqcsae2rg3s5` ("P0 Doğrulama Öğrencisi") kayıtları canlı geliştirme verisinde KALDI — arşivlemeye çalışırken giriş deneme sayısı rate-limit'e (`RATE_LIMITED`, güvenlik amaçlı, beklenen davranış) takıldı ve bu sınırı aşmaya çalışmak yerine durduruldu. İsimleri net şekilde etiketli ("P0 Doğrulama..."); Panel → Öğrenciler/Öğretmenler ekranından tek tıkla arşivlenebilir/silinebilir.

Ayrıca aynı kod yolları GERÇEK `FormData` nesneleriyle, mock'lanmamış tool/servis katmanı üzerinden (in-process, ama gerçek fonksiyon çağrıları) test edildi:

- `create-student-catalog-instrument.test.ts` (3 test): (a) "Bas Gitar" için önce gerçek bir öğretmen oluşturulup TAM mutlu yol (kayıt başarılı, `instruments: ["Bas Gitar"]` doğru kaydediliyor) doğrulandı; (b) tamamen uydurma bir enstrüman hâlâ GERÇEK bir hata (öğretmen eşleşmesi yok) ile reddediliyor — şema gevşetmesi doğrulamayı TAMAMEN kaldırmadı; (c) boş isim gibi gerçek geçersiz girdi hâlâ alan bazlı zod hatasıyla reddediliyor.
- `write-scope-actions.test.ts`'e eklenen 3 yeni test: boş ad → throw YOK, `fieldErrors.name` dolu, öğrenci OLUŞTURULMADI; var olmayan öğretmen → throw YOK, üstte Türkçe özet; **düzeltme sonrası tekrar gönderim BAŞARILI oluyor** (aynı `FormData` nesnesi düzeltilip tekrar `actionAddStudent`'a verildiğinde kayıt tamamlanıyor) — P0-2'nin "düzeltme sonrası tekrar gönderim başarılı olmalı" gereksinimini birebir kanıtlıyor.
- `npm run build` (production, Turbopack) BAŞARILI — derleme hatası yok.
- Kullanıcıya öneri (isteğe bağlı, ekstra güven için): yukarıdaki HTTP doğrulaması form UI'ının KENDİSİNİ (buton/hata görünümü) değil, sunucu tarafı davranışını kanıtlıyor. Tarayıcıda Panel → Öğrenciler → Yeni Öğrenci → Şube/Enstrüman bölümünde "Bas Gitar" veya "Ukulele" seçip kaydı tamamlayarak (veya "Ad soyad"ı boş bırakıp göndererek) tek bir hızlı görsel doğrulama yapılması, alan bazlı Türkçe hata/özet görünümünü (P0-2) gözle teyit etmek için hâlâ faydalı olur.

## 4. Kaynak sözleşmede revize edilen maddeler

Kaynak dosya (`2026-2027-ogrenci-kayit-sozlesmesi-v1.md`) VE aktif/taslak şablon gövdesi (`STUDENT_ENROLLMENT_CONTRACT_BODY`, `src/lib/documents/index.ts`) AYNI şekilde, SADECE aşağıdaki owner-approved 5 kural için güncellendi — ilgisiz hiçbir madde değiştirilmedi, yeni ceza/tazminat/faiz/fesih/ek sorumluluk maddesi EKLENMEDİ:

1. **Madde 4 — Kredi kartı:** "Her ayın 1-5'i arasında" → "Her ayın 1–5'i arasında (iki gün dahil) tamamlanmalıdır."
2. **Madde 4 — Havale/EFT/nakit:** "İlgili ayın 6'sından 15'ine kadar tamamlanmalıdır." → "Her ayın 1–15'i arasında (iki gün dahil) tamamlanmalıdır."
3. **Madde 4 — KDV:** "KDV: ☐ Dahil ☐ Hariç" (seçimlik) → "KDV: Dahildir" (kesin, kaynak .md dosyasında). Şablon gövdesinde zaten veri-güdümlü `{{vatStatusText}}` varsayılan olarak "Dahil" döndüğünden (önceki oturumda nihaileştirildi) DEĞİŞTİRİLMEDİ.
4. **Madde 8 — Telafi hakkı kapsamı:** "bir eğitim dönemi içerisinde en fazla iki (2)" (belirsiz — güz/yaz ayrı okunabilir) → "2026-2027 eğitim yılının tamamında (güz ve yaz dönemleri ayrı ayrı değil, toplamda) en fazla iki (2)" (kesin).
5. **Madde 8 — Telafi süresi:** "Telafi dersleri, iptalin gerçekleştiği ay içerisinde kullanılmalıdır. Kullanılmayan telafi hakları sonraki aylara devredilemez." → "Telafi hakkı, telafiye konu olan dersin planlanan/orijinal tarihinden itibaren 30 (otuz) takvim günü içinde kullanılmalıdır. Bu süre içinde kullanılmayan telafi hakkı geçerliliğini kaybeder." (owner'ın verdiği metin BİREBİR kullanıldı).

**Ek, verilen görev kapsamında keşfedilen ve düzeltilen tutarsızlık:** `docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`, telafi süresi MEKANİZMASININ (`addDays(lesson.startAt, makeupWindowDays)`) doğru olduğunu ama tenant'ın (`tenant_nilufer_acar`) GERÇEK `School.makeupWindowDays` ayarının **14** (30 DEĞİL) olduğunu ortaya çıkardı — yani sözleşme metni "30 gün" derken sistem GERÇEKTE 14 gün uyguluyordu. `scripts/set-makeup-window-30-days.ts` ile (mevcut, audit'lenen `updateMakeupWindowDaysTool` üzerinden) 30'a düzeltildi. O rapor artık "ÇÖZÜLDÜ" olarak güncellendi.

## 5. Kaynak sözleşme ile sistem politikası artık uyumlu mu

**Evet, 5 owner-approved kuralın TAMAMI için:**

| Kural | Sözleşme metni | Sistem (kod) davranışı | Uyumlu mu |
| --- | --- | --- | --- |
| Kredi kartı | 1–5, iki gün dahil | `resolveContractPaymentDueRule` → "1–5'i arasında" | ✅ |
| Havale/EFT/nakit | 1–15, iki gün dahil | `resolveContractPaymentDueRule` → "1–15'i arasında" (önceki oturumda nihaileştirildi) | ✅ |
| KDV | Her zaman dahil | `vatStatusText` varsayılanı "Dahil", hiçbir yerde "+KDV" gösterilmiyor (önceki oturumda doğrulandı) | ✅ |
| Telafi kapsamı | Yıl toplamı, en fazla 2 | `makeup-quota.ts` `academicYearStart` bazlı (Güz/Yaz ayrımı kaldırıldı, önceki oturumda) | ✅ |
| Telafi süresi | Orijinal ders tarihinden 30 gün | `addDays(lesson.startAt, makeupWindowDays)`, `makeupWindowDays=30` (bu oturumda düzeltildi) | ✅ |

## 6. Template'in draft mı aktif mi olduğu

**DRAFT — `active:false`.** Bu oturumda revize edilmiş gövdeyle YENİ bir taslak oluşturuldu: `dtpl_fy9artyvontl` (`createContractTemplateDraftFromCanonicalSourceTool` ile, `scripts/create-2026-2027-contract-template-draft.ts` tekrar çalıştırılarak). Mevcut aktif (hâlâ stale/eksik) şablon `dtpl_ip169tzdn992` **dokunulmadan** kaldı. Önceki oturumun taslağı (`dtpl_nq8gbjawojm3`, bu oturumun revizyonlarını İÇERMİYOR — artık ESKİMİŞ) de veri dosyasında duruyor, silinmedi (hard-delete yok, sistem tasarımı gereği). **Hiçbir aktivasyon YAPILMADI.**

## 7. Template'i aktifleştirmeden önce yönetici tarafından yapılacak manuel kontroller

1. Panel → Evraklar → "Sözleşme Şablonları" → **`dtpl_fy9artyvontl`** taslağını (2026-08-29 tarihli, EN SON) seçip önizleyin — `dtpl_nq8gbjawojm3` ARTIK ESKİMİŞ, kullanmayın.
2. Tanılama panelinin tüm zorunlu alanları "mevcut" gösterdiğini doğrulayın.
3. Madde 4 (ödeme pencereleri, KDV) ve Madde 8 (telafi kapsamı/süresi) metinlerinin bu raporun §4'ündeki NİHAİ metinlerle birebir eşleştiğini gözle kontrol edin.
4. Yalnızca o zaman "Şablonu Aktifleştir" ile AÇIKÇA etkinleştirin (eski şablon otomatik pasifleşir, audit kaydı oluşur).
5. Etkinleştirmeden SONRA yeni bir test öğrencisiyle formal sözleşme oluşturup PDF önizlemesinde (tarayıcı yazdır görünümü) tüm metinleri son kez gözden geçirin.

## 8. Aynı gün iptal işinin gerçek durumu (dürüst P0/P1 gap raporu)

**YALNIZCA ŞEMA/TASARIM MEVCUT — HİÇBİR UYGULAMA YOK.** Doğrulama: `cancellationSource`/`cancellationNoticeAt`/`cancellationReason`/`cancellationEvidenceDocumentId`/`telafiEligible` alanları `src/lib/types.ts` (satır 721-745) DIŞINDA kodda **HİÇBİR YERDE** okunmuyor/yazılmıyor (grep ile doğrulandı, sıfır eşleşme). Tip tanımının kendi yorumu bunu AÇIKÇA belirtiyor: *"Şema/tip düzeyinde eklendi; store/tool/UI katmanlarında henüz OKUNMUYOR/YAZILMIYOR ... bilinçli olarak heuristic/tahmin ile doldurulmadı."*

**Güncelleme (aynı gün, eşzamanlı bir oturumdan):** `prisma/migrations/20260829180000_attendance_cancellation_notice/` eklendi — `Attendance` tablosuna AYNI 5 alan (`cancellationSource` vb.) Prisma şema/migration seviyesinde de tanımlandı. Migration dosyasının kendi yorumu: **hiçbir shared/staging/production veritabanına UYGULANMADI**, yalnızca dosya olarak eklendi; hiçbir geriye dönük backfill yapılmadı. Doğrulandı: bu, DB şemasının TS tipiyle eşleşmesini sağlayan bir ALT YAPI adımıdır, ÖZELLİĞİN KENDİSİ (UI/server logic/telafi motoru wiring) DEĞİLDİR — yukarıdaki "eksik" listesi HÂLÂ tamamen geçerlidir, sıfır madde kapandı.

Eksik olduğu DOĞRULANAN kalemler (hiçbiri "tamamlandı" sayılmadı):

- ❌ Cancellation source UI (personel yoklama ekranında "İptal ne zaman/kim tarafından bildirildi?" alanı YOK)
- ❌ Gerçek cancellation-notice timestamp kaydı (`cancellationNoticeAt` hiç yazılmıyor)
- ❌ Sunucu tarafı doğrulama (aynı gün mü değil mi hesaplayan hiçbir kod yok)
- ❌ Kurum saat dilimi karşılaştırması (`src/lib/timezone.ts` mevcut ama bu özellik için kullanılmıyor)
- ❌ Öğrenci/veli aynı gün iptal uygunluk mantığı
- ❌ Telafi motoruna gerçek wiring (`telafiEligible` hiçbir yerde okunmuyor)
- ❌ Kota tüketimini engelleme (aynı gün/mazeretsiz iptal için `createsMakeupCredit=false` yapan kod YOK)
- ❌ Audit kaydı (böyle bir aksiyon hiç yok, audit'lenecek bir şey yok)
- ❌ Tenant/RBAC testleri (bu alanlara referans veren sıfır test)

**Önemli tarihsel not (önceki oturumdan, roadmap'te belgeli):** Bu özelliği `markedAt` (personelin yoklamayı İŞLEME zamanı) ile ders tarihini kıyaslayan bir HEURİSTİK ile uygulama girişimi yapılmış, `makeup-quota-concurrency.test.ts` bunun NORMAL devamsızlık akışının TAMAMINI yanlışlıkla telafi dışı bıraktığını kanıtlamış, bu yüzden GERİ ALINMIŞ. Bu oturumda da AYNI heuristic KULLANILMADI — talimata tam uyum. Önerilen (uygulanmamış) doğru tasarım `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md` §5'te detaylı olarak belgelidir. **P1 olarak kalıyor, bu oturumda kapsam GENİŞLETİLMEDİ.**

## 9. Portal consent access'in gerçekten end-to-end uygulanıp uygulanmadığı

Önceki oturumlarda (bu görev serisinin devamı) TAMAMLANMIŞ ve bu oturumda YENİDEN DOKUNULMADI/BOZULMADI (regresyon testleriyle doğrulandı):

- `/ogrenci/sozlesmelerim` — sözleşme geçmişi + PDF linki, `canAccessStudent` ile gerçek zamanlı yetkilendirme.
- `/ogrenci/ayarlar/kvkk` — KVKK rıza tarihçesi + geri çekme.
- `/ogrenci/ayarlar/foto-video` — fotoğraf/video rıza tarihçesi (5 kanal) + geri çekme (`withdrawSocialMediaConsentTool`, dar yüzey).
- `getSocialMediaConsentTool`/`listSocialMediaConsentHistoryTool` STUDENT rolüne açık, sahiplik `assertStudentAccess` ile doğrulanıyor.
- KVKK/Foto-Video **belge üretimi** (`generateKvkkNoticeDocumentTool`/`generatePhotoVideoConsentDocumentTool`) admin tarafında var, ama bu belgelerin PORTALDAN görüntülenmesi (öğrenci/veli tarafı) HÂLÂ YOK — bu zaten P1 olarak kayıtlı, bu oturumda genişletilmedi.

Bu oturumda ilgili tüm testler (`social-media-consent.test.ts`, `kvkk-consent.test.ts`) yeniden çalıştırıldı, hepsi geçti — regresyon yok.

## 10. Test/build/typecheck sonuçları

- `npx prisma validate` → ✅ geçti.
- `npx prisma generate` → ✅ geçti (Prisma Client v7.9.1 üretildi).
- `npm run typecheck` → ✅ hatasız, tüm repo.
- Hedefli testler: `create-student-catalog-instrument.test.ts` (3/3), `write-scope-actions.test.ts` (19/19, 3 yeni + 1 güncellenen), `contracts.test.ts` (59/59, 1 yeni uçtan uca P0-3 doğrulama testi dahil), `contract-template-schema.test.ts`, `instrument-catalog*.test.ts`, `create-student-instrument-field-leak.test.ts`, `teacher-multi-instrument-and-packages.test.ts` — **TÜMÜ GEÇTİ**.
- `npm run lint` (dokunulan dosyalar hedefli) → 0 hata, yalnızca ÖNCEDEN VAR OLAN `tools.ts` "_input kullanılmıyor" uyarıları.
- `npm test` (TAM paket, 222 dosya) → **216 dosya geçti, 6 dosya başarısız (2229/2235 test)**. Başarısız 6 test ÖNCEKİ oturumlarda da AYNI şekilde başarısızdı (`lesson-scheduling.test.ts`, `program-academic-term.test.ts`, `lesson-series-tools.test.ts`, `find-person-schedule.test.ts`, `homework-attachment.test.ts`, `lesson-update.test.ts`) — bu oturumun değişiklikleriyle İLİŞKİSİZ (hiçbiri `validation.ts`/`actions.ts`/`tools.ts`'in değiştirilen kısımlarını, `documents/index.ts`'i veya `new-student-form.tsx`'i import etmiyor; `lesson-scheduling.test.ts` TEK BAŞINA da aynı hatayla başarısız).
- `npm run build` (Turbopack, production) → ✅ başarılı, exit code 0.
- `git diff --check` → ✅ temiz.
- `npx expo export --platform ios` → **çalıştırılmadı** — bu görev admin mobile'a DOKUNMADI (talimat gereği), mobile export bu değişikliklerle ilgisiz.

**Süreç notu (şeffaflık için):** Bu oturumda iki yerel veri-mutasyon script'i (`create-2026-2027-contract-template-draft.ts`, `set-makeup-window-30-days.ts`) çalıştırıldığında kullanıcının kendi `npm run dev` süreci ZATEN AÇIKTI — CLAUDE.md'nin STORE_MODE=json uyarısı ("npm run dev açıksa bu scripti ÇALIŞTIRMAYIN") tam olarak buna işaret ediyor. Her iki script sonrası `data/store.json`/`data/document-templates.json`'ın geçerli JSON kaldığı doğrulandı (bozulma YOK), ama bu bir risk alışıydı ve gelecekte önce durup sormam gerekirdi.

## 11. No stage / no commit / no push / no deploy / no migration teyidi

- Hiçbir `git add`/`git commit`/`git push`/deploy komutu ÇALIŞTIRILMADI.
- Hiçbir shared/staging/production migration UYGULANMADI (Prisma migration gerekmedi — tüm değişiklikler kod/zod-şema/yerel JSON veri seviyesinde).
- Hiçbir şablon OTOMATİK etkinleştirilmedi.
- Paralel oturumların Contract Center/template draft/document type separation/consent wiring/owner-policy (ödeme penceresi metni, KDV, telafi kotası) çalışmaları YENİDEN YAZILMADI, ÜZERİNE YAZILMADI — yalnızca üzerine, açıkça belirtilen owner-approved 5 kural için, hedefli ekler yapıldı.
- Kaynak `.md` dosyası bu kez KULLANICININ AÇIK TALİMATIYLA (bu mesajda, önceki "değiştirme" talimatını süperseding) revize edildi — bu, önceki oturumların "sessizce değiştirilmedi" ilkesinin bir İHLALİ DEĞİL, sahibinin doğrudan onayının UYGULANMASIDIR.
