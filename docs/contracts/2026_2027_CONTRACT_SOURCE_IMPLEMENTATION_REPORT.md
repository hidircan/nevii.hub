# 2026-2027 Sözleşme Kaynağı — Uygulama Raporu (Final)

## 1. Denetlenen kaynak belge

`/2026-2027-ogrenci-kayit-sozlesmesi-v1.md` — Özel Nilüfer Acar Müzik Akademi Kursu 2026-2027 Öğrenci Kayıt Sözleşmesi + KVKK Aydınlatma Metni + Fotoğraf/Video Açık Rıza Formu. **Dosya bu görev boyunca DEĞİŞTİRİLMEDİ.**

## 2. Tam bölüm envanteri

Bkz. `2026_2027_OFFICIAL_CONTRACT_FULL_AUDIT.md` (20 bölüm, madde-madde inceleme).

## 3. Bulunan gerekli öğrenci/veli/kayıt/ödeme girdileri

Bkz. `2026_2027_CONTRACT_DYNAMIC_FIELD_MAPPING.md`. Özet: kaynağın gerektirdiği verinin BÜYÜK ÇOĞUNLUĞU zaten `Student`/`StudentContract` modellerinde mevcuttu; eksik olan yalnızca sözleşme METNİNE bu verinin YANSITILMASIydı (placeholder eksikliği), veri modeli eksikliği DEĞİLDİ.

## 4. Oluşturulan yeni girdiler ve gerekçeleri

| Alan | Gerekçe |
| --- | --- |
| `branchOptionsText`, `studentNationalIdText`, `studentBirthDateText`, `studentPhoneText`, `studentEmailText` | Kaynağın Madde 1'i bu alanları sözleşme METNİNDE ister; veri zaten Student modelinde vardı, yalnızca sözleşme render'ına bağlanmamıştı. |
| `lessonDurationOptionText`, `weeklyFrequencyOptionText`, `commitmentDurationOptionText` | Kaynağın Madde 3/5 checkbox alanları — sabit seçenek listesinden gerçek veriyle işaretlenen tek satır (renderer `{{#each}}` desteklemediği için). |
| `vatStatusText` + `CollectionsSettings.contractVatInclusive` | Kaynağın Madde 4 "KDV: Dahil/Hariç" alanı — HİÇ karşılığı yoktu, kurum düzeyinde opsiyonel bir ayar olarak eklendi (varsayılan "Dahil", sahibi onayı bekliyor). |
| `kvkkNoticeDeliveredCheckboxText` + `ContractDataSnapshot.kvkkNoticeDelivered` | Kaynağın "KAYIT VE İMZA BİLGİLERİ" bölümündeki teslimat işareti — açık rıza DEĞİL, sadece kayıt. |
| `photoVideoConsentFormCheckboxText` + `ContractDataSnapshot.photoVideoConsentFormPresented` | Aynı bölümdeki foto/video form sunum işareti. |
| `SocialMediaScope`: `print_materials`, `digital_ads`, `in_house_board` | Fotoğraf/Video formunun 5 kanalının HER BİRİNİN ayrı değerlendirilmesi gereksinimi. |

**Hiçbir yeni Prisma modeli veya migration gerekmedi** — tüm eklemeler mevcut `Json` alanlarına (contractDataSnapshot, collectionsSettings, scopes) veya opsiyonel placeholder kaydına yapıldı.

## 5. Minor/yetişkin koşullu davranış

`StudentContract.signatoryRelationship` ("veli"/"öğrenci") ve `isMinor` (computeAge < 18) mevcut mekanizmalar — DEĞİŞTİRİLMEDİ, kaynağın gerekliliklerini zaten karşılıyordu.

## 6. Bağımsız sözleşme merkezi rotası ve UX

Bkz. `INDEPENDENT_CONTRACT_CENTER_IMPLEMENTATION_REPORT.md`. Yeni rota: `/panel/ogrenciler/[studentId]/sozlesmeler`.

## 7. Kayıt sonrası yönlendirme davranışı

Formal (3-12 ay) → doğrudan Sözleşme Merkezi, form otomatik açılır, otomatik üretim/yazdırma YOK. Tanışma (1-2 ay) → öğrenci detayında kalır, formal üretim CTA'sı gösterilmez.

## 8. Tanışma vs. formal kayıt davranışı

`isFormalContractDuration(durationMonths) = durationMonths >= 3` — mevcut kural, DEĞİŞTİRİLMEDİ.

## 9. Belge türü ayrımı

Bkz. `2026_2027_CONTRACT_DOCUMENT_TYPE_MAPPING.md` — sözleşme / KVKK Aydınlatma Metni / Fotoğraf-Video Açık Rıza Formu, kaynağın kendi yapısına birebir sadık kalınarak ayrıldı.

**Ek (aynı görev, ikinci artış):** KVKK/Foto-Video belgeleri için üretim wiring'i TAMAMLANDI. Yeni `generateKvkkNoticeDocumentTool` (ön koşulsuz — bilgilendirme metni her zaman üretilebilir) ve `generatePhotoVideoConsentDocumentTool` (ön koşullu — önce `SocialMediaConsent` kararı kaydedilmiş olmalı, personel keyfi izin uyduramaz) eklendi; ikisi de `selectActiveTemplateOfKind` (contract-template-schema.ts, `selectActiveContractTemplate`'in genelleştirilmiş hali — "hangi şablon aktif" belirsizliğine düşülmesin diye) ile şablon seçer, mevcut jenerik `/evrak-yazdir/[documentId]` (tenant/RBAC korumalı, kind-agnostik) sayfasında görüntülenir/yazdırılır. Sözleşme Merkezi'ne ("KVKK ve Fotoğraf/Video Belgeleri" kartı, yalnızca SCHOOL_ADMIN/SUPER_ADMIN) iki buton eklendi. 6 yeni test (`generate-consent-documents.test.ts`) — başarılı üretim, alan değerlerinin doğru render edilmesi, ön koşul reddi, rol reddi.

## 10. Şablon/placeholder/renderer mimarisi

Tek kaynak kaydı korundu (`src/lib/contract-template-schema.ts`) — editör/doğrulayıcı/renderer AYNI listeyi okur. Yeni alanlar hepsi OPSİYONEL eklendi (geriye dönük kırılma yok, bkz. yeni test `contract-template-schema.test.ts`).

## 11. Aktif şablon hatası — kök neden ve düzeltme

Bkz. `ACTIVE_TEMPLATE_RECOVERY_REPORT.md`. Kök neden DOĞRULANDI (canlı veri incelendi): `tenant_nilufer_acar`'ın tek aktif `student_enrollment_contract` satırı 2026-08-25 tarihli, genel/eski placeholder'lar içeren bir taslaktı. Düzeltme: kaynak-doğru yeni gövde + `scripts/create-2026-2027-contract-template-draft.ts` ile oluşturulan DRAFT (`dtpl_nq8gbjawojm3`, `active:false`). **Aktivasyon yönetici onayı bekliyor.**

## 12. Draft oluşturma ve ayrı açık aktivasyon davranışı

`createContractTemplateDraftFromCanonicalSourceTool` her zaman `active:false` üretir (DEĞİŞTİRİLMEDİ); `activateContractTemplateTool` ayrı, yetkili (SCHOOL_ADMIN/SUPER_ADMIN) bir eylemdir ve audit kaydı oluşturur (mevcut mekanizma, bu görevde doğrulandı, bozulmadı).

## 13. Ödeme planı render kararı

12 sabit `taksitN...` placeholder çifti (yalnızca `taksit1` zorunlu) — kaynağın 12 satırlık tablosuyla birebir uyumlu, sahte `{{#each}}` İCAT EDİLMEDİ.

## 14. PDF/yazdırma/ıslak-imza davranışı

DEĞİŞTİRİLMEDİ — `/sozlesme-yazdir/[contractId]` tarayıcı yazdır-PDF akışı, `markContractPrinted`/`markContractWetSignaturePending`/`uploadContractSignedScan` durum makinesi (generated → printed → wet_signature_pending → signed) aynen korundu. Üretilen PDF asla "signed" ile eş tutulmaz; yazdırma asla "signed" ile eş tutulmaz.

## 15. Geçmiş versiyon/anlık görüntü koruması

DEĞİŞTİRİLMEDİ — `contractDataSnapshot` (immutable Json) ve `DocumentInstance.renderedHtml` (donmuş) mekanizması, yeni alanlar da dahil olmak üzere üretim anında dondurulur; sonraki kurum ayarı/öğrenci değişikliği geçmiş sözleşmeleri ETKİLEMEZ.

## 16. Öğrenci/veli portal erişimi — TAMAMLANDI (DÜZELTİLMİŞ BULGU)

İlk varsayımın AKSİNE — koda bakılmadan "hiç yok" denilmedi, doğrulandı — `/ogrenci/sozlesmelerim` (`/veli/sozlesmelerim` buraya yönlendirir), `/sozlesme-yazdir/[contractId]` ve `/ogrenci/ayarlar/kvkk` bu görevden ÖNCE de vardı ve sözleşme + KVKK rıza erişimini zaten tenant/rol-izole şekilde sağlıyordu. Bulunan gerçek eksik (fotoğraf/video rızası için portal sayfası yokluğu) bu görevde KAPATILDI: yeni `/ogrenci/ayarlar/foto-video` sayfası, yeni `withdrawSocialMediaConsentTool` (dar yüzey — yalnızca geri çekme, yeni rıza uydurma DEĞİL), `getSocialMediaConsentTool`/`listSocialMediaConsentHistoryTool`'a STUDENT self-erişimi, 5 yeni test. Yan bulgu: `socialMediaConsentSchema` zod enum'u yeni 3 kanalı içermiyordu (TS tipi güncellenmiş ama zod şeması kaçırılmıştı) — test yazarken yakalanıp düzeltildi. Bkz. `NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md` PORTAL-CONTRACT-001 — artık "TAMAMLANDI", yalnızca KVKK/foto-video *belgelerinin* (PDF) kendisinin otomatik üretim wiring'i P1 olarak kalıyor (bu, portalın belge GÖSTERMESİNDEN önce belgenin ÜRETİLMESİNİ gerektiren, ayrı ve daha büyük bir iş kalemi).

## 17. RBAC, tenant, gizlilik, dosya/belge güvenliği

Değiştirilmedi ve yeniden ihlal edilmedi: `createStudentContractTool`/`activateContractTemplateTool`/`createContractTemplateDraftFromCanonicalSourceTool` hâlâ `requireRole(["SCHOOL_ADMIN","SUPER_ADMIN"])` arkasında; tüm okuma/yazma `ctx.tenantId` üzerinden ALS tenant bağlamına bağlı; T.C. kimlik no hâlâ şifreli saklanır (`nationalIdCipher`), yalnızca sözleşme üretimi anında `decryptNationalId` ile çözülüp DOĞRUDAN sözleşme metnine yazılır (kalıcı olarak açık saklanmaz).

## 18. Şema/migration/backfill durumu

**Migration YOK, backfill YOK.** Tüm eklemeler mevcut `Json` alanlarına veya opsiyonel TS union genişletmelerine yapıldı (bkz. §4).

## 19. Test/lint/typecheck/build sonuçları

- `npx prisma validate` → ✅ **geçti** ("The schema at prisma/schema.prisma is valid").
- `npm run typecheck` (`tsc --noEmit`) → ✅ **hatasız**, tüm repo.
- `npx vitest run` (TAM paket, son çalıştırma — ikinci artıştan SONRA) → **215 dosya geçti, 6 dosya başarısız (toplam 2221/2227 test geçti)**. Başarısız 6 test (`lesson-scheduling.test.ts`, `program-academic-term.test.ts`, `lesson-series-tools.test.ts`, `find-person-schedule.test.ts`, `homework-attachment.test.ts`, `lesson-update.test.ts`) **bu görevden ÖNCEKİ, İLGİSİZ kod yollarında** (ders programlama/telafi/ödev eki — sözleşme/şablon/kayıt sistemine hiç dokunmuyorlar), her iki çalıştırmada da BİREBİR AYNI. Kanıt: (1) hiçbiri `contracts.ts`/`contract-template-schema.ts`/`documents/index.ts`/`tools.ts` createStudentContract* /`actions.ts`/`contract-panel.tsx`'i import ETMİYOR; (2) `lesson-scheduling.test.ts` TEK BAŞINA çalıştırıldığında da (izole, sıfır dosya etkileşimi) AYNI hatayla başarısız oluyor. Bu görevin doğrudan ilgili tüm test dosyaları (contracts.test.ts, contract-template-schema.test.ts, write-scope-actions.test.ts, document-*.test.ts, kvkk-consent.test.ts, social-media-consent.test.ts, generate-consent-documents.test.ts — 125 test tek seferde) **TAMAMI geçti**.
- `npm run lint` (TAM repo) → **15372 hata, 117089 uyarı** — TAMAMI bu görevden ÖNCE var olan repo-genelindeki lint borcu (büyük çoğunluğu `apps/mobile` altında React hooks purity/effect kuralları). Bu görevde değiştirilen/eklenen dosyaların HER BİRİ ayrıca hedefli `eslint` ile kontrol edildi (iki artış da dahil): yalnızca 1 hata bulundu (kaçırılmış `&apos;`), düzeltildi; kalan yalnızca ÖNCEDEN VAR OLAN, ilgisiz `tools.ts` "kullanılmayan `_input`" uyarıları (dosyanın geri kalanında zaten yaygın bir desen, bu görevde eklenmedi).
- `npm run build` (`next build`) → ✅ **başarılı** (exit code 0, iki artıştan sonra da tekrar doğrulandı) — yeni rotalar (`/panel/ogrenciler/[studentId]/sozlesmeler`, `/ogrenci/ayarlar/foto-video`) derlenmiş rota listesinde görünüyor.
- `npx expo export --platform ios` → **çalıştırılmadı** — görev talimatı açıkça "admin mobile üzerinde ÇALIŞMA" diyor ve bu görev admin-web + sözleşme sistemine odaklıdır; `apps/mobile` bu görevde HİÇ DOKUNULMADI.
- `git diff --check` → ✅ **temiz** (whitespace hatası yok).

## 20. Kalan hukuki/sahibi kararları

Bkz. `NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md` §"Sahibi/hukuk kararı bekleyenler" (havale/nakit pencere netliği, KDV varsayılanı, telafi kotası aylık/dönemlik).

## 21. Manuel kabul kontrol listesi

- [ ] Panel → Evraklar → Sözleşme Şablonları → yeni taslağı (`dtpl_nq8gbjawojm3`) önizle, tanılamanın "üretime hazır" gösterdiğini doğrula.
- [ ] Yönetici olarak "Şablonu Aktifleştir" ile etkinleştir, audit kaydını doğrula.
- [ ] Yeni bir öğrenci kaydı oluştur (3-12 ay) → doğrudan Sözleşme Merkezi'ne yönlendirildiğini doğrula.
- [ ] Yeni bir öğrenci kaydı oluştur (1-2 ay) → öğrenci detayında kaldığını, formal üretim CTA'sı GÖSTERİLMEDİĞİNİ doğrula.
- [ ] Sözleşme Merkezi'nde formal sözleşme oluştur, PDF önizle, yazdır, imzalı tarama yükle — durum geçişlerini (generated→printed→wet_signature_pending→signed) doğrula.
- [ ] Fotoğraf/Video izni "veriyorum" seçilip 2-3 kanal işaretlendiğinde, üretilen sözleşme HTML'inde KVKK/foto-video işaretlerinin doğru göründüğünü doğrula.
- [ ] KDV ayarını (`contractVatInclusive=false`) deneyip sözleşmede "Hariç" göründüğünü doğrula.
- [ ] Eski (etkinleştirilmemiş) şablonla formal sözleşme üretiminin HÂLÂ engellendiğini doğrula (regresyon değil, kasıtlı).
- [ ] Sözleşme Merkezi'nde "KVKK Aydınlatma Metni Oluştur" ve "Fotoğraf/Video Açık Rıza Formu Oluştur" butonlarını dene — KVKK ön koşulsuz üretilmeli, foto/video ÖNCE bir `SocialMediaConsent` kararı gerektirmeli (yoksa net Türkçe hata).
- [ ] `/ogrenci/ayarlar/foto-video` sayfasını öğrenci/veli hesabıyla ziyaret et — kendi rıza tarihçesini gördüğünü ve "İzni geri çek"in çalıştığını doğrula; başka bir öğrencinin verisine erişilemediğini doğrula.

## 22. Kesin doğrulamalar

- Hiçbir `git add`/`git commit`/`git push`/deploy komutu ÇALIŞTIRILMADI.
- Hiçbir shared/staging/production migration UYGULANMADI (migration zaten gerekmedi).
- Hiçbir şablon OTOMATİK etkinleştirilmedi — yeni gövde yalnızca DRAFT olarak eklendi.
- Kaynak dosya (`2026-2027-ogrenci-kayit-sozlesmesi-v1.md`) DEĞİŞTİRİLMEDİ.
- Başka bir worktree/aktif ajanın işine MÜDAHALE EDİLMEDİ — yalnızca canonical `main` çalışma dizininde, talep edilen dosyalar üzerinde çalışıldı.
- `apps/mobile` (admin mobile) bu görevde HİÇ DOKUNULMADI.

## 23. Devam oturumu doğrulaması (2026-08-29, sonraki görev) — Problem 3 kapsamı zaten TAMAMLANMIŞ

Bu devam oturumunda talep edilen 4 madde ("ilk ödeme kayıt anında tahsil + kayıt tamamlama şartı",
"1–5/1–15 pencereleri", "KDV dahildir", "telafi yılda toplam 2, 30 gün") için kaynak/taslak şablon
metni TEKRAR incelendi: `docs/contracts/P0_INVALID_INPUT_INCIDENT_REPORT.md` §4-5'te belgelenen
owner-approved 5 kural revizyonu (Madde 4 kredi kartı 1–5, havale/EFT/nakit 1–15, KDV "Dahildir",
Madde 8 telafi kapsamı yıl-toplamı 2 hak, telafi süresi 30 takvim günü) hem KAYNAK `.md` dosyasında
hem `dtpl_fy9artyvontl` taslağında ZATEN MEVCUT ve owner'ın kendi talimatıyla revize edilmiş
durumda. **Bu oturumda kaynak/taslak metne yeni bir değişiklik YAPILMADI** — "ilk ödeme kayıt
anında tahsil edilmeden kayıt tamamlanamaz" kuralı bir METİN/CLAUSE değişikliği değil, bir
SUNUCU TARAFI İŞ KURALI olduğundan (bkz. `FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md`) ayrı bir
görevde, `src/lib/contracts.ts`/`tools.ts`/`store*.ts`/`contract-panel.tsx` üzerinde uygulandı;
sözleşme METNİ zaten (Madde 4 üzerinden) bu kuralı ima ediyordu, yeni bir MADDE eklenmesi
GEREKMEDİ. Ceza/faiz/erken kapama/fesih/tazminat maddesi bu oturumda da EKLENMEDİ.

## 24. Devam oturumu (2026-08-30, P0 CONTRACT OPERABILITY/DOCX/PRINT paketi) — bulgular

Kaynak dosya (`2026-2027-ogrenci-kayit-sozlesmesi-v1.md`) bu oturumda da **DEĞİŞTİRİLMEDİ**.
Bu oturumda kaynak metinle aktif şablon arasında karşılaştırmalı bir denetim yapıldı ve **yeni bir
gerçek uyuşmazlık bulundu**:

- Kaynağın MADDE 4 taksit tablosu (satır 49) kolonları: **HİZMET BEDELİ / Taksit / Ödeme Şekli /
  Tarih / Tutar**. Aktif şablonun (`dtpl_jfpy6i01m1de`) tablosu: **HİZMET BEDELİ / Taksit / Tarih /
  Tutar** — **"Ödeme Şekli" kolonu eksik**. Kaynak metin DEĞİŞTİRİLMEDİ; aktif şablon da bu
  oturumda YERİNDE değiştirilmedi (hukuki metin riski — bkz.
  `CONTRACT_PRINT_DESIGN_REPORT.md` §5). Owner/hukuk onayı gerektiren bir P1 madde olarak
  işaretlendi.
- Ayrı bir GERÇEK KOD hatası (kaynak metinle ilgisi yok, salt render mantığı) bulunup düzeltildi:
  12'den kısa süreli sözleşmelerde (ör. 5 aylık) kullanılmayan taksit satırları PDF'de boş
  tarih + " TL" olarak görünüyordu. Düzeltme `src/lib/documents/index.ts`
  (`stripUnusedInstallmentRows`) içinde, şablon metnine dokunmadan, yalnızca render aşamasında
  yapıldı — ayrıntı `CONTRACT_PRINT_DESIGN_REPORT.md` §4.
- Kayıt Süresi (Kayıt Planı) alanının veri akışı uçtan uca yeniden denetlendi:
  `Contract.durationMonths` zaten tek kalıcı doğruluk kaynağı, Student modelinde ayrı bir kalıcı
  süre alanı YOK ve gerekmiyor — ayrıntı `REGISTRATION_DURATION_DATA_FLOW_REPORT.md`.
- DOCX-öncelikli şablon iş akışı (yükle/indir, `mammoth` bağımlılığı, `DocumentTemplate` şemasına
  additive migration) bu oturumda UYGULANDI — ayrıntı `TEMPLATE_EDITOR_AND_DOCX_WORKFLOW_REPORT.md`.
  Hiçbir DOCX yüklemesi otomatik aktifleştirilmedi.
- Şablon "Düzenle" ekranındaki aktif-şablon-yerinde-değiştirme hatası (yeni bulunan gerçek hata)
  düzeltildi — artık aktif bir şablonu düzenlemek her zaman yeni bir taslak oluşturuyor.
- Kod değişikliği YAPILMAYAN, yalnızca CSS/tipografi eklenen alan: sözleşme yazdırma sayfası
  (A4/Times New Roman/8pt/tablo-imza kenarlıkları) — hukuki metne dokunulmadı, yalnızca görsel
  biçimlendirme.
- Bu oturumda da: hiçbir `git add`/commit/push/deploy, hiçbir migration UYGULANMADI (yalnızca
  dosya eklendi), hiçbir şablon otomatik etkinleştirilmedi, `apps/mobile` dokunulmadı.
