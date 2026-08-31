# 2026-2027 Sözleşmesi — Belge Türü Ayrımı

Kaynak (`2026-2027-ogrenci-kayit-sozlesmesi-v1.md`) KENDİSİ üç belgeye ayrılmış durumda geldi. Bu görev bu ayrımı OLDUĞU GİBİ korudu — hiçbir madde başka bir belgeye taşınmadı veya birleştirilmedi.

| Belge türü (`DocumentTemplate.kind`) | Kaynaktaki karşılığı | Durum |
| --- | --- | --- |
| `student_enrollment_contract` | Öğrenci Kayıt Sözleşmesi (26 madde) | **Bu görevde tam olarak yeniden yazıldı** — bkz. `src/lib/documents/index.ts` `STUDENT_ENROLLMENT_CONTRACT_BODY`. Draft oluşturuldu (`dtpl_nq8gbjawojm3`), aktivasyon BEKLEMEDE (yönetici onayı gerekir). |
| `kvkk` | KVKK Aydınlatma Metni | Varsayılan gövde kaynak metne göre güncellendi (`KVKK_INFO_NOTICE_BODY`). **Otomatik üretim akışına henüz BAĞLANMADI** — P1 (bkz. aşağıda). |
| `parent_social_media_consent` | Fotoğraf/Video Açık Rıza Formu | Varsayılan gövde kaynak metne göre güncellendi (`PHOTO_VIDEO_CONSENT_BODY`), 5 kanal placeholder'ı destekler. **Otomatik üretim akışına henüz BAĞLANMADI** — P1. |

Kaynakta AYRI bir "ödeme planı eki" veya "iptal/telafi onay formu" belgesi YOKTUR — bu ikisi ana sözleşmenin (sırasıyla Madde 4 taksit tablosu ve Madde 7-8) birer parçasıdır. Bu nedenle Faz 3'ün "en az değerlendirilecek" listesindeki `payment_plan_annex` ve `cancellation_makeup_policy_acknowledgement` bu kaynak için AYRI belge türleri olarak MODELLENMEDİ — bunları ayrı belge yapmak, kaynağın kendi yapısını yanlış yansıtır.

## KVKK Aydınlatma Metni ile Açık Rıza ayrımı

Kaynak KVKK metninde AÇIK RIZA istemez — yalnızca "okudum, bilgilendirildim" beyanı alır (Madde 8: "Bu imza ... genel bir açık rıza beyanı DEĞİLDİR"). Bu nedenle:

- Sözleşmedeki "KVKK Aydınlatma Metni ayrıca teslim edilmiş/bilgilendirme yapılmıştır: Evet/Hayır" işareti → basit bir TESLİMAT kaydı (`ContractDataSnapshot.kvkkNoticeDelivered`), **KvkkConsent modeli üzerinden YÜRÜTÜLMEDİ** (o model versiyonlu HUKUKİ METNE onay için tasarlanmıştır, burada gereksiz ağırlık olurdu).
- Mevcut `KvkkConsent`/`ConsentTextVersion` modelleri DOKUNULMADAN kaldı — kurum ileride gerçek bir açık rıza toplaması gerekirse (ör. pazarlama) zaten hazır.

## Fotoğraf/Video Açık Rıza ayrımı

- Sözleşme içindeki Madde 19 yalnızca formun SUNULUP sunulmadığını işaretler (`photoVideoConsentFormPresented`).
- Asıl açık rıza (izin ver/verme + 5 kanal seçimi) `SocialMediaConsent` modeline yazılır — kayıt sırasında `contract-panel.tsx` formundan `scopes` (5 yeni değerle genişletilmiş `SocialMediaScope`) ile birlikte gönderilir.
- Reddetme KAYDI ENGELLEMİYOR — `photoConsent === "denied"` seçildiğinde form yine gönderilir, `granted:false` ile kaydedilir, `scopes: []`.

## P1 — otomatik üretim wiring'i (KAPSAM DIŞI bırakıldı, neden)

`kvkk` ve `parent_social_media_consent` belge türleri şu an YALNIZCA "Sözleşme Şablonları" yönetim ekranından manuel şablon düzenleme/önizleme ile erişilebilir — yeni öğrenci kaydı veya sözleşme oluşturma akışına OTOMATİK bağlı DEĞİLDİR (bu, görev başlamadan ÖNCE de böyleydi — hiçbir çağıran kod bu iki `kind` için `createDocumentInstance` çağırmıyordu, bkz. audit raporu §16). Bu wiring'i bu oturumda eklemek: (a) yeni bir "KVKK/Foto-Video belgesi oluştur ve yazdır" UI akışı, (b) Sözleşme Merkezi'ne üçüncü bir belge sekmesi, (c) ilgili testler gerektirir — kapsamı P0 (aktif şablon hatası) ve Bağımsız Sözleşme Merkezi'nin önüne geçirecek kadar büyük bağımsız bir özelliktir. `NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`'ye P1 olarak eklendi.
