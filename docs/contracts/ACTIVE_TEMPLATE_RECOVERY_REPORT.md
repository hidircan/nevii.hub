# Aktif Şablon Kurtarma Raporu — 2026-2027 Sözleşme Kaynağı

## Hata

Formal sözleşme üretimi şu placeholder'ların eksik olduğunu bildiren `ContractTemplateIncompleteError` ile engelleniyordu:

```
{{titleMain}} {{paymentDueRuleText}} {{totalContractAmountText}}
{{signatoryFullName}} {{enrollmentStartDateText}} {{taksit1Tarih}} {{taksit1Tutar}}
```

## Kök neden — DOĞRULANDI (kod değil, veri durumu)

`data/document-templates.json` içinde `tenant_nilufer_acar` için `student_enrollment_contract` türünde **tek bir satır** vardı:

```json
{
  "id": "dtpl_ip169tzdn992",
  "bodyHtml": "<h1>Öğrenci Kayıt Sözleşmesi</h1>\n<p>Referans: {{reference}}</p>\n<p>Öğrenci: {{studentName}} · Şube: {{branchName}} · Tarih: {{date}}</p>\n<p>Metod: {{educationMethod}} · Kayıt: {{enrollmentDate}}</p>\n<p>Ödeme: {{paymentPlan}}</p>\n<p>{{freeText}}</p>",
  "active": true,
  "updatedAt": "2026-08-25T17:22:19.670Z"
}
```

Bu satır 2026-08-25 tarihli, GENERİK/eski placeholder'lar (`{{studentName}}`, `{{branchName}}`, `{{freeText}}` vb.) içeriyor — mevcut `contract-template-schema.ts` zorunlu alanlarının **hiçbirini** içermiyor. `active:true` olduğundan ve TEK aktif satır olduğundan `selectActiveContractTemplate` bunu seçiyor, `validateContractTemplateBody` de haklı olarak reddediyordu.

**Bu; öğrenci/veli verisinin eksik girilmesiyle İLGİLİ DEĞİLDİR** — sözleşme şablonu hatasıdır, doğrulayıcının kendi tasarım amacı tam olarak bunu ayırt etmektir (bkz. `ContractTemplateIncompleteError` mesajı).

## Uygulanan düzeltme (bu görev)

1. `src/lib/documents/index.ts` `STUDENT_ENROLLMENT_CONTRACT_BODY` (kurumsal kaynak gövdesi) **2026-2027-ogrenci-kayit-sozlesmesi-v1.md** kaynağını birebir yansıtacak şekilde tamamen yeniden yazıldı — tüm zorunlu placeholder'lar (`titleMain`, `paymentDueRuleText`, `totalContractAmountText`, `signatoryFullName`, `enrollmentStartDateText`, `taksit1Tarih`, `taksit1Tutar`) mevcut.
2. `scripts/create-2026-2027-contract-template-draft.ts` çalıştırılarak (`npx tsx scripts/create-2026-2027-contract-template-draft.ts`) `createContractTemplateDraftFromCanonicalSource` çağrıldı → yeni **DRAFT** satır oluşturuldu:

   ```
   id=dtpl_nq8gbjawojm3 active=false tenantId=tenant_nilufer_acar
   ```

3. **Eski aktif satır (`dtpl_ip169tzdn992`) DOKUNULMADAN bırakıldı** — hâlâ `active:true`. Formal sözleşme üretimi HÂLÂ bu eski şablonla denenirse hâlâ `ContractTemplateIncompleteError` ile reddedilir (kasıtlı — otomatik aktivasyon YAPILMADI).

## Kalan manuel adım (yönetici onayı gerekir)

Panel → Evraklar → "Sözleşme Şablonları" ekranından:

1. Yeni taslağı (`dtpl_nq8gbjawojm3`, "Öğrenci Kayıt Sözleşmesi (kurumsal kaynaktan taslak — 29.08.2026)") önizleyin, tanılama panelinin "üretime hazır" gösterdiğini doğrulayın.
2. "Şablonu Aktifleştir" ile AÇIKÇA etkinleştirin — bu işlem eski şablonu otomatik pasifleştirir (`activateTemplateExclusive`, tek-aktif garantisi) ve audit kaydı oluşturur.
3. Etkinleştirmeden ÖNCE üretilmiş hiçbir sözleşme (yok, çünkü üretim zaten engelleniyordu) etkilenmez; etkinleştirmeden SONRA üretilecek TÜM yeni sözleşmeler yeni şablonu kullanır.

## Neden otomatik aktivasyon yapılmadı

Görev talimatı açıkça yasaklıyor: "Do NOT ... automatically activate a new or modified legal template." Yeni gövde hukuki içerik açısından doğru olsa bile, hukuki bir belgenin canlıya alınması kurumun bilinçli, kayıtlı bir kararı olmalıdır — bu yüzden draft/activate ayrımı (önceki oturumda inşa edilen mekanizma) burada TAM OLARAK amacına uygun kullanıldı.

## Güncel durum tablosu — bu oturumda YENİDEN DOĞRULANDI (2026-08-29, devam oturumu)

`data/document-templates.json` içindeki `student_enrollment_contract` türü satırları TEKRAR
okundu — durum önceki oturumlardan bu yana DEĞİŞMEDİ (bu oturumda yalnızca Problem 2 — ilk ödeme
zorunluluğu — üzerinde çalışıldı, hiçbir şablon satırı dokunulmadı/aktifleştirilmedi):

| Template ID | Başlık | Tür | Aktif mi? | Güncellenme | Zorunlu alanlar mevcut mu? | İlk kayıtta seçilir mi? | Yenilemede seçilir mi? | Güvenli aksiyon |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dtpl_ip169tzdn992` | Öğrenci Kayıt Sözleşmesi (eski/generik) | student_enrollment_contract | **true** | 2026-08-25 | **HAYIR** — `{{titleMain}}` vb. 7 zorunlu alanın hiçbiri yok | Evet (tek aktif satır, `selectActiveContractTemplate` bunu seçiyor) — üretim REDDEDİLİR | Evet (aynı seçim mantığı) — üretim REDDEDİLİR | DOKUNMA — bilerek "engelleyici" bırakıldı |
| `dtpl_nq8gbjawojm3` | Öğrenci Kayıt Sözleşmesi (kurumsal kaynaktan taslak — 29.08.2026, İLK sürüm) | student_enrollment_contract | false | 2026-08-29 (erken) | Evet ama Madde 4/8 metni ESKİ (owner-approved 5 kural revizyonundan ÖNCE) | Hayır (draft) | Hayır (draft) | KULLANMA — `dtpl_fy9artyvontl` ile SÜPERSEDE edildi |
| **`dtpl_fy9artyvontl`** | Öğrenci Kayıt Sözleşmesi (kurumsal kaynaktan taslak — 29.08.2026, REVİZE) | student_enrollment_contract | **false** | 2026-08-29 (en son) | **Evet** — 7 zorunlu alan + owner-approved Madde 4 (1–5/1–15, "iki gün dahil")/Madde 8 (yıl-toplamı 2 hak, 30 gün) nihai metni | Hayır (draft, aktivasyon bekliyor) | Hayır (draft) | **ÖNCELİKLİ ADAY — manuel incele + aktifleştir** |

Bu oturumda EKLENEN yeni `firstPaymentCollected` zorunluluğu (bkz.
`FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md`) şablon SEÇİMİNİ/doğrulamasını ETKİLEMEZ —
tamamen bağımsız bir sunucu tarafı kontroldür (`createContract` içinde, şablon render'ından ÖNCE
çalışır). Yani: eski aktif şablon (`dtpl_ip169tzdn992`) HÂLÂ placeholder eksikliğinden formal
üretimi engeller; YENİ olarak, formal bir initial/renewal kaydı artık AYRICA `firstPaymentCollected`
olmadan da reddedilir — iki kontrol birbirinden bağımsız, ikisi de geçmeli.

## Güncelleme (2026-08-30) — `dtpl_fy9artyvontl` aktifleştirildi, seçim fonksiyonu sertleştirildi

Bu tablonun yazıldığı andan bu yana, sahip **`dtpl_fy9artyvontl`**'i yukarıda önerildiği gibi
manuel olarak etkinleştirdi. Store'daki güncel gerçek durum (`data/document-templates.json`,
doğrudan okundu):

| Template ID | active | updatedAt |
| --- | --- | --- |
| `dtpl_ip169tzdn992` (eski/generik) | false | 2026-08-25 |
| `dtpl_nq8gbjawojm3` (taslak, ilk sürüm) | false | 2026-08-30T06:03:54Z |
| `dtpl_fy9artyvontl` (taslak, revize — bu raporun "ÖNCELİKLİ ADAY" dediği satır) | false | 2026-08-30T11:47:09Z |
| **`dtpl_jfpy6i01m1de`** (yeni satır — `dtpl_fy9artyvontl`'in aktivasyonu SIRASINDA/SONRASINDA oluşturulmuş, içerik BAYT BAYT AYNI) | **true** | 2026-08-30T11:47:04Z |

Not: `dtpl_jfpy6i01m1de`'nin `dtpl_fy9artyvontl` ile birebir aynı `bodyHtml`'e (19272 karakter,
`===` eşit) sahip olması ve `dtpl_fy9artyvontl`'den 4 saniye ÖNCE `updatedAt` taşıması, muhtemelen
aktivasyon akışı sırasında (`createContractTemplateDraftFromCanonicalSourceTool` tekrar
çalıştırılmış veya benzeri bir adım) oluşan bir DUPLİKASYONDUR — hukuki içerik SAPMASI değildir.
Bu görevde bu satırlara DOKUNULMADI (mutasyon yasağı), yalnızca okunup doğrulandı.

**P0 seçim güvenliği incelemesi** (bkz. `ACTIVE_TEMPLATE_SELECTION_P0_INCIDENT_REPORT.md`) bu
durumu esas alarak yürütüldü: `dtpl_jfpy6i01m1de` (active:true) her zaman doğru seçiliyordu,
çünkü `createContract` zaten `listTemplates(tenantId)` (yalnızca `active:true` döner) üzerinden
besleniyordu. Yine de `selectActiveTemplateOfKind` fonksiyonunun KENDİSİ `active` filtrelemiyordu
— bu MİMARİ kırılganlık merkezi olarak kapatıldı (`active===true` artık fonksiyonun kendisi
tarafından da zorunlu filtrelenir; yeni `selectEligibleActiveTemplateForContract` tek, tipli giriş
noktası eklendi). **Bu güncellemede hiçbir şablon verisi mutasyona uğratılmadı** — yalnızca
`src/lib/contract-template-schema.ts` ve `src/lib/contracts.ts`'teki seçim KODU sertleştirildi.
