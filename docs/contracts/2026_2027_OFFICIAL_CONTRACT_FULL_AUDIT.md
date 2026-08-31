# 2026-2027 Resmî Sözleşme Kaynağı — Tam Denetim Raporu

**1. Kaynak dosya:** `/2026-2027-ogrenci-kayit-sozlesmesi-v1.md` (27K, kurumun 2026-2027 eğitim dönemi için önerdiği resmî öğrenci kayıt sözleşmesi kaynağı — Özel Nilüfer Acar Müzik Akademi Kursu).

**2. İnceleme tarihi:** 2026-08-29.

Kaynak dosya **tek bir metin dosyasında ÜÇ AYRI belge** barındırıyor:

1. **Öğrenci Kayıt Sözleşmesi** — 26 madde + "Kayıt ve İmza Bilgileri" bölümü.
2. **KVKK Aydınlatma Metni** — sözleşmeden bilinçli olarak AYRI (Madde 20: "ayrıca KVKK Aydınlatma Metni sunulur").
3. **Fotoğraf/Video Açık Rıza Formu** — KVKK metninden VE sözleşmeden AYRI, 5 kanallı (web/Instagram/basılı/dijital reklam/kurum içi pano) açık rıza formu.

Bu üçlü ayrım, Faz 3 (Belge Türü Ayrımı) kararlarının temelini oluşturur — bkz. `2026_2027_CONTRACT_DOCUMENT_TYPE_MAPPING.md`.

## 3. Bölüm bölüm envanter (Öğrenci Kayıt Sözleşmesi)

| Madde | Konu | Sınıflandırma |
| --- | --- | --- |
| 1 | Taraflar (kurum adresi, öğrenci/veli kimlik-iletişim) | C (öğrenci/veli dinamik), K (checkbox: şube) |
| 2 | Sözleşmenin konusu | A (sabit) |
| 3 | Branş ve eğitim programı (ders süresi, haftalık sıklık, gün/saat) | D/E (dinamik), K (checkbox: 30/40/50 dk, 1/2 ders) |
| 4 | Eğitim ücreti ve ödeme (KDV, toplam bedel, ödeme kuralı, taksit tablosu) | F (ödeme planı dinamik), K (checkbox: KDV), L (bkz. §5 aşağıda) |
| 5 | Sabit Fiyat Garantisi ve devam koşulu (taahhüt süresi) | A (sabit metin) + K (checkbox: 3-12 ay) |
| 6-10 | Derslerin planlanması, devamsızlık, telafi, resmî tatiller, öğretmen kaynaklı iptaller | A (sabit politika metni) |
| 11 | Eğitim dönemi ve kayıt süresi | D (başlangıç/bitiş tarihi) |
| 12-18 | Kayıt iptali, ödeme gecikmesi, kayıt dondurma, iletişim, kurum dışı özel ders, kurum eşyası, konser/etkinlik | A (sabit) |
| 19 | Fotoğraf/video çekimleri | G (zorunlu: form sunuldu mu işareti) — asıl rıza AYRI formda |
| 20 | Kişisel veriler | G (zorunlu: KVKK metni teslim edildi mi işareti) — asıl aydınlatma AYRI metinde |
| 21-26 | Eğitim materyalleri, kurumun/velinin yükümlülükleri, tebligat, uyuşmazlık, yürürlük | A (sabit) |
| Kayıt ve İmza | Başvuru tarihi, kimlik/iletişim tekrarı, KVKK/foto-video işaretleri, imza tablosu | C/G/M |

## 4. Sözleşme başlığı envanteri

26 madde + "Kayıt ve İmza Bilgileri" başlığı. Kaynak, kurumun ÖNCEKİ kanonik gövdesinden (2022, `nacar sözleşme.docx` kökenli — bkz. `src/lib/documents/index.ts` eski `STUDENT_ENROLLMENT_CONTRACT_BODY`) tamamen farklı madde numaralandırması ve içeriği taşır. Özellikle:

- **YENİ:** Madde 5 "Sabit Fiyat Garantisi" — eski gövdede hiç YOKTU.
- **YENİ:** Madde 3'te ders süresi (30/40/50 dk) ve haftalık sıklık (1/2 ders) seçim alanları.
- **DEĞİŞTİ:** Telafi kuralı (Madde 8) — eski gövde "4 haftalık dönem" derken yeni kaynak "bir eğitim dönemi içerisinde en fazla iki (2) telafi hakkı" der (bkz. §18 "Legal/business ambiguity").
- **DEĞİŞTİ:** KVKK/foto-video yaklaşımı — eski gövde tek bir inline izin işaretiyle (Madde 4) her ikisini karıştırıyordu; yeni kaynak KVKK'yı (Madde 20) ve foto/video rızasını (Madde 19) birbirinden VE sözleşmeden ayırıyor.

## 5. Ödeme politikası envanteri

Kaynak Madde 4: "Kredi kartı ile yapılan ödemeler: Her ayın 1-5'i arasında" / "Nakit/Havale/EFT ile yapılan ödemeler: İlgili ayın 6'sından 15'ine kadar tamamlanmalıdır."

Görev talimatının (bölüm 7) zorunlu kıldığı BİREBİR metin: "Kredi kartı ödemeleri her ayın 1–5'i arasında yapılmalıdır." / "Havale/EFT/nakit ödemeleri her ayın en geç 15'ine kadar yapılmalıdır." — bu metin `src/lib/contracts.ts` `resolveContractPaymentDueRule`'da ZATEN birebir uygulanmış durumdaydı (önceki oturumlarda). **Uyumsuzluk:** kaynağın "6'sından 15'ine kadar" ifadesi (kart penceresi dışında ayrı bir başlangıç günü ima eder) ile kodun "en geç 15'ine kadar" ifadesi (1-15 arası, başlangıç kısıtı yok) TAM olarak aynı kural değildir. **Karar gerektirir (L):** kurum sahibi/hukuk danışmanı, havale/nakit ödemenin ayın 1'inden mi yoksa 6'sından mı itibaren kabul edildiğini netleştirmelidir — bu görevde GÖREV TALİMATININ verdiği bire bir metin esas alınmıştır (değiştirilmedi), fark ayrıca işaretlenmiştir.

## 6. Ödeme takvimi/tablo envanteri

12 satırlık taksit tablosu (HİZMET BEDELİ/Taksit/Ödeme Şekli/Tarih/Tutar) — mevcut renderer'ın 12 sabit `taksitN...` alan çifti (yalnızca `taksit1` zorunlu) modeliyle BİREBİR uyumludur; `{{#each}}` gerektirmez.

## 7. Ders programı envanteri

Madde 3: branş (serbest metin), ders süresi (30/40/50 dk checkbox), haftalık sıklık (1/2 ders checkbox), ders günü/saati (serbest metin). Tümü mevcut `Student.lessonDurationMinutes`/`Student.weeklyLessonCount`/ders programı alanlarıyla karşılanabiliyor — yeni şema alanı GEREKMEDİ.

## 8. İptal/telafi politikası envanteri

Madde 7 (devamsızlık) ve Madde 8 (telafi): "Her öğrenci için bir eğitim dönemi içerisinde en fazla iki (2) telafi hakkı." **Mevcut motor** (`src/lib/makeup-quota.ts`, bkz. `NILUFER_ACAR_PAYMENT_MAKEUP_POLICY_IMPLEMENTATION_REPORT.md` §"bilinen eksik") AYLIK tavan uyguluyor, DÖNEMLİK değil — bu kaynak bu farkı netleştirir ama telafi kotası motorunun "eğitim dönemi" sınırının nasıl tanımlanacağı (Eylül-Haziran mı, sözleşme süresi mi) hâlâ bir **iş kararı (L)** gerektirir. Bu görev kapsamında telafi kotası motoru DEĞİŞTİRİLMEDİ (kapsam dışı — ayrı, bağımsız bir motor değişikliği; kaynağın metin/belge tarafı bu görevin odağıdır). Bkz. `NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`.

## 9. KVKK bilgilendirme (Aydınlatma Metni) bölümleri

8 madde: veri sorumlusu, veri kategorileri, işlenme amaçları, hukuki sebepler, aktarım, saklama süresi, ilgili kişi hakları, aydınlatma beyanı. **Açıkça belirtilir:** "Aydınlatma metninin okunması, açık rıza verilmesi anlamına gelmez." Mevcut `KvkkConsent`/`ConsentTextVersion` modelleri (versiyonlu, geri çekilebilir) bu ayrımı zaten destekliyor; sözleşmedeki "teslim edildi mi" işareti ise AÇIK RIZA değil, yalnızca bir TESLİMAT kaydıdır (bkz. §14 aşağıda).

## 10. KVKK açık rıza bölümleri

Kaynakta KVKK Aydınlatma Metni içinde AYRICA bir açık rıza istenmiyor (yalnızca "bilgilendirildim" beyanı) — asıl açık rıza YALNIZCA fotoğraf/video için, AYRI formda isteniyor. Bu nedenle bu görevde yeni bir "KVKK explicit consent" UI akışı İNŞA EDİLMEDİ — mevcut `KvkkConsent` modeli, kurum ileride farklı bir açık rıza toplamak isterse (ör. pazarlama iletişimi) zaten hazır.

## 11. Sosyal medya/fotoğraf/video rıza bölümleri

Fotoğraf/Video Açık Rıza Formu, 5 kanaldan HER BİRİNİN ayrı değerlendirildiğini açıkça belirtir. `SocialMediaScope` tipi (`src/lib/types.ts`) bu görevde `print_materials`/`digital_ads`/`in_house_board` ile genişletildi (website/instagram zaten vardı) — `SocialMediaConsent.scopes` (Json) alanı bu 5 değeri saklamak için yeterlidir, **migration gerekmedi**.

## 12. İmza/tarih/onay alanları

Ana sözleşmede: Başvuru Tarihi, Öğrenci/Veli Ad Soyad + T.C. + Adres, KVKK/Foto-Video "ayrıca sunulmuştur" işaretleri (Evet/Hayır), Kurum/Kursiyer-Veli imza tablosu (Yetkili, Kaşe/İmza, Tarih). Fotoğraf/Video formunda: 18 yaş altı için veli/vasi imza şartı AYRICA belirtilir (`signatoryRelationship` alanı bunu zaten karşılıyor).

## 13. Dinamik öğrenci/veli/ödeme alanları — tam liste

Öğrenci: ad soyad, T.C. kimlik no, doğum tarihi, telefon, e-posta, adres, branş, ders süresi, haftalık sıklık, ders günü/saati.
Veli/İmzalayan: ad soyad, T.C. kimlik no, adres, ilişki (veli/öğrenci).
Kayıt: şube, eğitim başlangıç/bitiş tarihi, taahhüt süresi (3-12 ay).
Ödeme: aylık ücret, KDV durumu, toplam bedel, ödeme yöntemi, 12 taksit satırı.

## 14. Eksik alan analizi (gerçekten YENİ gerekenler)

| Alan | Önceden var mıydı? | Bu görevde eklenen |
| --- | --- | --- |
| Öğrencinin kendi T.C./doğum tarihi/telefon/e-posta sözleşmede | Veri VARDI (`Student.nationalIdCipher`, `birthDate`, `phone`, `email`) ama sözleşme placeholder'ı YOKTU | `studentNationalIdText`, `studentBirthDateText`, `studentPhoneText`, `studentEmailText` |
| Şube adresi checkbox | `Branch.name/address` VARDI, sözleşmede kullanılmıyordu | `branchOptionsText` (tools.ts'te TÜM şubelerden gerçek veriyle üretilir) |
| Ders süresi/haftalık sıklık checkbox | `Student.lessonDurationMinutes`/`weeklyLessonCount` VARDI | `lessonDurationOptionText`, `weeklyFrequencyOptionText` |
| Taahhüt süresi checkbox | `StudentContract.durationMonths` VARDI | `commitmentDurationOptionText` |
| KDV Dahil/Hariç | **HİÇ YOKTU** | `CollectionsSettings.contractVatInclusive` (opsiyonel, varsayılan "Dahil" — bkz. §18 sahibi kararı) + `vatStatusText` |
| KVKK teslim işareti | **HİÇ YOKTU** (KvkkConsent modeli VAR ama bu basit ikili işaret için AŞIRI ağır) | `ContractDataSnapshot.kvkkNoticeDelivered` (boolean, sözleşme anlık görüntüsünde) + `kvkkNoticeDeliveredCheckboxText` |
| Foto/video form sunum işareti | **HİÇ YOKTU** | `ContractDataSnapshot.photoVideoConsentFormPresented` + `photoVideoConsentFormCheckboxText` |
| Foto/video 5 kanal | `SocialMediaConsent.scopes` (Json) VARDI ama yalnızca 4 genel değer (`photo/video/website/instagram`) | `SocialMediaScope` tipi 3 yeni değerle genişletildi: `print_materials`, `digital_ads`, `in_house_board` |

**Hiçbir yeni Prisma modeli/migration gerekmedi** — tüm eklemeler ya mevcut Json alanlarına (scopes, contractDataSnapshot, collectionsSettings) ya da mevcut şablon placeholder kaydına (`contract-template-schema.ts`, tamamı OPSİYONEL, geriye dönük kırılma YOK) eklendi.

## 15. Gerekli UI değişiklikleri

1. Fotoğraf/Video Açık Rıza formunda 5 kanal seçim kutucuğu (sözleşme oluşturma formuna eklendi — bkz. `contract-panel.tsx`).
2. KVKK Aydınlatma Metni teslim edildi mi işareti (checkbox, aynı forma eklendi).
3. Bağımsız "Sözleşme Merkezi" rotası (bkz. `INDEPENDENT_CONTRACT_CENTER_IMPLEMENTATION_REPORT.md`).

## 16. Gerekli belge/şablon/PDF değişiklikleri

`STUDENT_ENROLLMENT_CONTRACT_BODY` (`src/lib/documents/index.ts`) kaynak metne göre TAMAMEN yeniden yazıldı (26 madde, hukuki metin BİREBİR aktarıldı, yalnızca noktalı boşluk/checkbox alanları placeholder'landı). `kvkk` ve `parent_social_media_consent` varsayılan gövdeleri de gerçek kaynak metnine göre güncellendi (bkz. `2026_2027_CONTRACT_DOCUMENT_TYPE_MAPPING.md` — bu ikisinin otomatik üretim akışına BAĞLANMASI ayrı bir P1 kalemidir).

## 17. Kaynağın zaten karşıladığı mevcut işlevsellik

Ödeme kuralı metni, taksit hesaplama (tam integer, float hatası yok), sözleşme versiyon zinciri, immutable snapshot, draft/aktif şablon ayrımı, tek-aktif-şablon garantisi, yenileme borç kapısı, ıslak imza/imzalı-tarama yükleme akışı — TAMAMI önceki oturumlarda inşa edilmiş ve doğrulanmıştı; bu görev bunları BOZMADAN üzerine inşa etti (bkz. yukarıdaki test sonuçları).

## 18. Sahibi/hukuk onayı gereken kararlar

1. **Havale/nakit ödeme penceresi:** "ayın 6'sından 15'ine" mi yoksa "en geç 15'ine" mi (şu an kod ikincisini uyguluyor, görev talimatı da bunu istedi — ama kaynağın kendi metni birincisini yazıyor).
2. **KDV varsayılanı:** `contractVatInclusive` ayarlanmazsa şablon "Dahil" gösterir — kurumun güncel vergi uygulamasıyla teyit edilmeli.
3. **Telafi kotası — aylık mı dönemlik mi:** kaynak "bir eğitim dönemi içinde en fazla 2" diyor, mevcut motor aylık kısıtlı; "eğitim dönemi" sınırının netleştirilmesi gerekiyor (motor değişikliği bu görevin kapsamı DIŞINDA bırakıldı).

## 19. Gizlilik/hassas veri taraması sonucu

Bu rapor hiçbir gerçek öğrenci/veli/ödeme/imza verisi İÇERMEMEKTEDİR — yalnızca alan adları ve kaynak belge madde numaraları referans alınmıştır.

## 20. Mevcut/eski (aktif) şablonla karşılaştırma

`data/document-templates.json` içindeki tek `student_enrollment_contract` satırı (`dtpl_ip169tzdn992`, 2026-08-25, `active:true`) **hiçbir güncel zorunlu placeholder içermiyordu** (`{{studentName}}`, `{{branchName}}`, `{{freeText}}` gibi eski/genel alanlar) — bu, görevin P0 hatasının GERÇEK ve DOĞRULANMIŞ kök nedenidir (bkz. `ACTIVE_TEMPLATE_RECOVERY_REPORT.md`). Bu eski satır DOKUNULMADAN bırakıldı; kurumsal kaynaktan yeni bir DRAFT (`dtpl_nq8gbjawojm3`, `active:false`) oluşturuldu.
