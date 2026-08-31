# P0 — Aktif Şablon Seçimi Olay Raporu (2026-08-30)

## Özet — sonuç

**Doğrulanmış bulgu: canlı/gerçek çağrı yollarının HİÇBİRİNDE, incelenen tarihte, bir taslak
şablonun formal sözleşme üretiminde kullanıldığı GÖZLEMLENMEDİ.** Ancak seçim fonksiyonunun
kendisi (`selectActiveTemplateOfKind`) `active` alanını hiç kontrol etmiyordu — yalnızca
çağıranın kendisini önceden `active:true` olacak şekilde filtrelemesine GÜVENİYORDU. Bu, gerçek
bir P0 veri bütünlüğü olayı değil, **kırılgan bir sözleşme (fragile contract)** idi: bugün
hiçbir çağıran bunu istismar etmese de, ileride eklenecek TEK bir yeni çağıran (ör.
`listAllTemplates()` sonucunu besleyen bir kod yolu) sessizce yanlış şablonu seçebilirdi. Bu
rapor hem BUGÜNKÜ gerçek durumu kanıtlarla belgeler hem de UYGULANAN merkezi sertleştirme
düzeltmesini açıklar.

## Kök neden

`src/lib/contract-template-schema.ts` içindeki `selectActiveTemplateOfKind`:

```ts
// DÜZELTME ÖNCESİ
export function selectActiveTemplateOfKind<T extends { kind: string; updatedAt: string }>(templates: T[], kind: string): T | undefined {
  return templates.filter((t) => t.kind === kind).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
```

Yalnızca `kind` filtreler, `active` alanına HİÇ bakmaz. "En son güncellenen kazanır" kuralı —
tasarım gereği doğru bir kural (bkz. `ACTIVE_TEMPLATE_RECOVERY_REPORT.md`, "birden fazla aktif
şablon" senaryosu) — ama yalnızca AKTİF adaylar arasında uygulanmalıydı; kodda bu ön koşul YOKTU.

## Kanıtlı doğrulama — gerçek çağrı yolları (Faz 0 audit)

`grep -rn "selectActiveTemplateOfKind\|selectActiveContractTemplate"` ile TÜM kullanım yerleri
tarandı:

| Çağıran | Dosya:satır | Şablon listesi nereden geliyor? | `active` önceden filtreleniyor mu? |
| --- | --- | --- | --- |
| `createContract` (initial/renewal formal sözleşme üretimi) | `src/lib/contracts.ts:536` | `listTemplates(tenantId)` | **Evet** — `documents/index.ts:1033-1042`, json modda `all.filter(t => t.tenantId===tenantId && t.active)`, db modda Prisma `where:{tenantId, active:true}` |
| `getContractTemplateDiagnostics` (tanılama paneli, "Sözleşme Şablonları" ekranı) | `src/lib/documents/index.ts:551` | `listTemplates(tenantId)` (aynı fonksiyon) | **Evet** — yukarıdakiyle AYNI |
| `generateKvkkNoticeDocumentTool` | `src/lib/services/tools.ts:3380` | `listTemplates(ctx.tenantId)` | **Evet** |
| `generatePhotoVideoConsentDocumentTool` | `src/lib/services/tools.ts:3430` | `listTemplates(ctx.tenantId)` | **Evet** |

**Print/PDF/portal görüntüleme yolu** (`getContractHtmlTool`, `/sozlesme-yazdir/[contractId]`,
`printStudentContractTool`) şablonu YENİDEN SEÇMEZ — sözleşme oluşturulduğu anda ÜRETİLİP
`DocumentInstance.renderedHtml` olarak DONDURULMUŞ HTML'i döner (`getDocumentInstance`,
`contract.documentInstanceId` üzerinden). Yani bu yollarda İKİNCİ bir seçim riski YOKTUR.

`listAllTemplates()` (yönetim ekranı — arşivlenmiş DAHİL tüm şablonları listeler) HİÇBİR seçim
fonksiyonuna beslenmiyor — yalnızca `listAllDocumentTemplatesTool` üzerinden ham liste UI'a döner.

**Sonuç:** Denetlenen tarihte seçim güvenliği, seçim fonksiyonunun kendisi değil, HER çağıranın
aynı ön-filtrelenmiş `listTemplates()` yardımcı fonksiyonunu kullanma ALIŞKANLIĞI ile
sağlanıyordu — mimari olarak kırılgan ama fiilen doğru.

## Ampirik kanıt — gerçek `data/document-templates.json` verisiyle simülasyon

Komut: `npx tsx` ile gerçek üretim verisi (`tenant_nilufer_acar`, `student_enrollment_contract`)
üzerinde hem ESKİ hem YENİ (sertleştirilmiş) fonksiyon çalıştırıldı:

```
NEW selectActiveTemplateOfKind (active dahil filtre): dtpl_jfpy6i01m1de   (active=true)
OLD davranış simülasyonu (yalnızca updatedAt sıralaması): dtpl_fy9artyvontl (active=false)
```

Bu, iddiayı İKİ yönden de kanıtlar:

1. **Eski kod, EĞER unfiltered bir listeyle beslenmiş olsaydı, gerçekten yanlış şablonu (taslağı)
   seçerdi** — teorik risk gerçek ve somuttu.
2. **Ama gerçek `createContract`/tanılama çağrıları HER ZAMAN önceden filtrelenmiş `listTemplates()`
   sonucunu kullandığından, bu risk PRATİKTE hiç tetiklenmedi** — canlı bir yanlış-şablon
   üretimi OLAYI yoktur, kanıt: aşağıdaki tablo + `ACTIVE_TEMPLATE_RECOVERY_REPORT.md`'nin önceki
   oturumlarda zaten belgelediği "eski aktif şablon eksikse üretim REDDEDİLİR" davranışı (sessiz
   yanlış şablon YERİNE gürültülü ret).

## Faz 0 — güncel şablon envanteri (tenant: `tenant_nilufer_acar`)

`data/document-templates.json` doğrudan okunarak (varsayım değil, gerçek dosya):

| Template ID | Başlık | Tür | Sürüm | active | updatedAt | Diagnostics (zorunlu alan eksik mi?) | İlk kayıtta uygun mu? | Yenilemede uygun mu? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dtpl_ip169tzdn992` | Öğrenci Kayıt Sözleşmesi (eski/generik) | student_enrollment_contract | 1 | **false** | 2026-08-25 | EVET — 7 zorunlu alanın hiçbiri yok (`titleMain`, `paymentDueRuleText`, `totalContractAmountText`, `signatoryFullName`, `enrollmentStartDateText`, `taksit1Tarih`, `taksit1Tutar`) | Hayır (inactive + eksik) | Hayır |
| `dtpl_nq8gbjawojm3` | Öğrenci Kayıt Sözleşmesi (kurumsal kaynaktan taslak — 29.08.2026, ilk sürüm) | student_enrollment_contract | 1 | **false** | 2026-08-30T06:03:54.578Z | Hayır (eksik alan yok) | Hayır (inactive) | Hayır |
| `dtpl_fy9artyvontl` | Öğrenci Kayıt Sözleşmesi (kurumsal kaynaktan taslak — 29.08.2026, revize) | student_enrollment_contract | 1 | **false** | 2026-08-30T11:47:09.038Z (EN YENİ) | Hayır (eksik alan yok) | Hayır (inactive) | Hayır |
| **`dtpl_jfpy6i01m1de`** | Öğrenci Kayıt Sözleşmesi (kurumsal kaynaktan taslak — 30.08.2026) | student_enrollment_contract | 1 | **true** | 2026-08-30T11:47:04.615Z | Hayır (eksik alan yok — `findMissingRequiredContractPlaceholders` boş liste döndü) | **EVET — GERÇEKTEN SEÇİLEN** | **EVET — GERÇEKTEN SEÇİLEN** (initial/renewal aynı seçim mantığını paylaşır, kind bazlı ayrım yok) |

Doğrulama komutu ve çıktısı (Faz 3 sorusu #1: "dtpl_jfpy6i01m1de gerçekten aktif şablon mu?"):

```
$ node -e '... data.filter(t=>t.tenantId==="tenant_nilufer_acar" && t.active) ...'
selected: dtpl_jfpy6i01m1de true
```

**Önemli ek bulgu:** `dtpl_fy9artyvontl` ve `dtpl_jfpy6i01m1de`'nin `bodyHtml` alanları **BAYT
BAYT AYNI** (`a.bodyHtml === b.bodyHtml` → `true`, uzunluk ikisinde de 19272 karakter). Yani
gerçek dünyada, eski kod bu iki satır arasında "yanlış" seçim yapmış olsaydı bile, ÜRETİLEN
HUKUKİ METİN İÇERİĞİ DEĞİŞMEZDİ — ikisi aynı kurumsal kaynaktan (`STUDENT_ENROLLMENT_CONTRACT_BODY`)
farklı zamanlarda üretilmiş birebir kopyalardır (muhtemelen taslak oluşturma aracının önceki bir
oturumda tekrar çalıştırılmasından). Bu, olayın hukuki/finansal risk boyutunu belirgin şekilde
azaltır — asıl risk her zaman MİMARİ kırılganlıktı, gözlemlenen bir içerik sapması değil.

## Uygulanan düzeltme (Faz 1 — merkezi seçim sertleştirmesi)

`src/lib/contract-template-schema.ts`:

1. `selectActiveTemplateOfKind` artık **kendisi** `active === true` filtreler — jenerik tip
   kısıtı `{ kind: string; updatedAt: string; active: boolean }`'a genişletildi. Çağıranın
   önceden filtrelemiş olup olmaması ARTIK ÖNEMSİZ — fonksiyon HER ZAMAN güvenli.
2. Yeni, açık isimli giriş noktası eklendi: **`selectEligibleActiveTemplateForContract(templates, kind)`**
   — `active===true` filtresini VE zorunlu alan (`findMissingRequiredContractPlaceholders`)
   doğrulamasını TEK adımda yapar, tipli bir sonuç döner:
   ```ts
   type EligibleTemplateSelection<T> =
     | { ok: true; template: T }
     | { ok: false; reason: "no_active_template" | "diagnostics_failed"; message: string; missingRequired?: ... };
   ```
   Uygun şablon yoksa (`no_active_template`) TAM OLARAK talep edilen Türkçe mesajı döner:
   > "Bu sözleşme türü için üretime hazır aktif şablon bulunmuyor. Lütfen Sözleşme Şablonları
   > bölümünden uyumlu taslağı gözden geçirip yetkili olarak aktifleştirin."
3. `src/lib/contracts.ts` `createContract` artık ESKİ iki adımlı (`selectActiveContractTemplate` +
   `validateContractTemplateBody`) yerine TEK `selectEligibleActiveTemplateForContract` çağrısı
   kullanıyor — `diagnostics_failed` durumunda mevcut `ContractTemplateIncompleteError` (aynı
   davranış, değişmedi), `no_active_template` durumunda yeni standart Türkçe mesaj fırlatılıyor.
4. `.find()` üzerinde sıralama YOK, salt `updatedAt` sıralaması TEK BAŞINA hiçbir yerde
   KULLANILMIYOR — sıralama yalnızca `active===true` filtresinden SONRA, kalan adaylar
   arasında bir belirleyicilik kuralı.
5. Silent fallback YOK — hiçbir kod yolu draft/arşivlenmiş/başka-tür/salt-metadata bir şablona
   sessizce düşmez; uygun şablon yoksa YAZILI hata fırlatılır (önceden de böyleydi, şimdi ayrıca
   tipli/merkezi).

## Faz 2 — aktivasyon/durum bütünlüğü (audit, DEĞİŞTİRİLMEDİ)

Mevcut kod incelendi (`src/lib/documents/index.ts` `activateTemplateExclusive`,
`src/lib/services/tools.ts` `activateContractTemplateTool`):

- **A. Taslak oluşturma:** `createContractTemplateDraftFromCanonicalSource` `active:false` ile
  oluşturur — DOĞRU, değiştirilmedi.
- **B. Aktivasyon:** `activateTemplateExclusive` ATOMİK — hedef hariç AYNI tenant+tür TÜM
  şablonları `active:false` yapar, ardından hedefi `active:true` yapar (db modda `updateMany` +
  `update`; json modda tek `saveTpl` çağrısıyla). RBAC: yalnızca `SCHOOL_ADMIN`/`SUPER_ADMIN`
  (`requireRole`). Audit: `document_template.activate_exclusive` olayı YAZILIYOR. **Zaten
  gereksinimleri karşılıyor — bu görevde EK KOD DEĞİŞİKLİĞİ YAPILMADI.**
- **C. Arşivleme:** `archiveTemplate`/`archiveDocumentTemplateTool` — **BULGU (düzeltilmedi,
  bilinçli olarak kapsam dışı bırakıldı):** bu GENEL (tüm belge türleri için ortak) uç nokta
  `active` bayrağını DOĞRUDAN, EXCLUSİVE OLMAYAN bir şekilde çevirir (`archiveTemplate(tenantId,
  id, active)`). "Geri Aç" (`active:true`) işlemi `activateTemplateExclusive`'i KULLANMAZ — teorik
  olarak aynı tür için 2. bir `active:true` satırı yaratabilir (tam olarak
  `ACTIVE_TEMPLATE_RECOVERY_REPORT.md`'nin belgelediği eski "birden fazla aktif" senaryosunu
  YENİDEN üretebilecek tek yol budur). Seçim artık sertleştirildiği için bu durumda bile YANLIŞ
  (inactive) bir şablon ASLA seçilmez — yalnızca "en son güncellenen active" belirsizliği geri
  gelebilir (draft DEĞİL, arşiv geri açma senaryosu). Bu, Faz 1 düzeltmesinin kapsamı DIŞINDA;
  ayrı bir iş kalemi olarak `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`'ye
  eklendi. **Bu görevde template verisi/route'u DOKUNULMADI.**
- **D. UI netliği (Aktif/Taslak/Arşivlendi rozetleri, onay diyaloğu):** Bu görevde UYGULANMADI —
  kapsamlı bir UI/UX yeniden tasarımı gerektirir, "STOP unrelated feature work" talimatına göre
  bilinçli olarak roadmap'e bırakıldı (bkz. `NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`).

## Faz 3 — güncel şablon durumu doğrulaması (mutasyon YOK)

Sorulan sorular ve kanıtlı cevaplar:

1. **`dtpl_jfpy6i01m1de` gerçek aktif şablon mu?** EVET — `data/document-templates.json`'da tek
   `active:true` satır bu.
2. **Tüm zorunlu placeholder'ları içeriyor mu?** EVET — `findMissingRequiredContractPlaceholders`
   boş liste döndürdü (7/7 zorunlu alan mevcut: `titleMain`, `paymentDueRuleText`,
   `totalContractAmountText`, `signatoryFullName`, `enrollmentStartDateText`, `taksit1Tarih`,
   `taksit1Tutar`).
3. **Kaynak metinle uyumlu mu?**
   - İlk ödeme kayıt sırasında → **KISMEN.** Gövdede "Kurumumuzda kayıt sırasında bildirilen
     ödeme gününde ödemeler her ay düzenli olarak alınır." cümlesi var ama "İlk ödeme/ilk taksit
     kayıt anında tahsil edilir" ifadesi bulunmadı (`"İlk ödeme"`, `"ilk taksit"` metinde YOK).
     Bu, ayrı bir P0 iş kaleminde (`FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md`) KOD
     seviyesinde zaten zorunlu kılınan bir politikadır — ama HUKUKİ METİN henüz bunu açıkça
     yansıtmıyor. **Hukuki metin değişikliği bu görevin kapsamı DIŞINDA (owner kararı gerekir) —
     yalnızca RAPORLANIYOR, DEĞİŞTİRİLMEDİ.**
   - Kredi kartı 1–5 → EVET, birebir: "Kredi kartı ile yapılan ödemeler: Her ayın 1–5'i arasında
     (iki gün dahil) tamamlanmalıdır."
   - Havale/EFT/nakit 1–15 → EVET, birebir: "Nakit / Havale / EFT ile yapılan ödemeler: Her ayın
     1–15'i arasında (iki gün dahil) tamamlanmalıdır."
   - KDV dahil → `{{vatStatusText}}` placeholder'ı üretim anında "Dahil" değeriyle doldurulur
     (varsayılan `vatInclusive !== false`) — metin kendisi sabit "KDV Dahil" YAZMAZ, alan dinamik.
   - Eğitim yılı toplamı 2 telafi hakkı → EVET, birebir: "Her öğrenci için 2026-2027 eğitim
     yılının tamamında (güz ve yaz dönemleri ayrı ayrı değil, toplamda) en fazla iki (2) telafi
     hakkı bulunmaktadır."
   - Orijinal ders tarihinden 30 takvim günü → EVET, birebir: "Telafi hakkı, telafiye konu olan
     dersin planlanan/orijinal tarihinden itibaren 30 (otuz) takvim günü içinde kullanılmalıdır."
4. **`dtpl_fy9artyvontl` doğru/en son taslak mı?** EVET, içerik olarak `dtpl_jfpy6i01m1de` ile
   BAYT BAYT AYNI (yukarıya bkz.) — aktivasyon gerekmiyor, zaten aktif olanla özdeş.
5. **Diagnostics/preview/PDF testi geçiyor mu?** EVET — `findMissingRequiredContractPlaceholders`
   boş; `getContractTemplateDiagnosticsTool` gerçek entegrasyon testinde (`contracts.test.ts`,
   yeni eklenen "P0 selection fix" testi) `isReadyForFormalGeneration:true` ve
   `selectedTemplate.id === "dtpl_jfpy6i01m1de"`'ye eşdeğer bir senaryo doğrulandı.
6. **Owner sonra hangisini aktifleştirmeli?** Hiçbiri — `dtpl_jfpy6i01m1de` ZATEN aktif ve
   eksiksiz; `dtpl_fy9artyvontl`/`dtpl_nq8gbjawojm3` içerik olarak ya aynı ya da süperseded,
   aktivasyon gerektirmiyor. **Bu görevde HİÇBİR aktivasyon işlemi yapılmadı.**
7. **İlk kayıt doğru aktif şablonu seçiyor mu?** EVET (Faz 0 tablosu + Faz 1 sertleştirmesi).
8. **Yenileme doğru aktif şablonu/türü seçiyor mu?** EVET — initial/renewal AYNI seçim
   fonksiyonunu (`selectEligibleActiveTemplateForContract(..., "student_enrollment_contract")`)
   paylaşır; kodda ayrı bir "renewal template kind"i YOK (kaynak, aynı sözleşme türünün versiyonlu
   bir devamı — bu, ürün tasarımı, bu görevde değiştirilmedi).
9. **Ulaşılabilir/seçilebilir eski/geçersiz şablon var mı?** `dtpl_ip169tzdn992` (eski/generik,
   eksik alanlı) hâlâ store'da duruyor ama `active:false` → seçim tarafından ASLA erişilemez
   (hem eski hem yeni kodda, çünkü zaten `active:false`). Silinmedi (görev talimatı: "Silme yok").

**Bu fazda hiçbir şablon verisi mutasyona uğratılmadı** (auto-activate/archive/restore/delete
YAPILMADI) — yalnızca okundu ve doğrulandı.

## Faz 4 — ilk ödeme regresyon kontrolü

Ayrı rapora taşındı: `docs/contracts/FIRST_PAYMENT_DUPLICATION_PREVENTION_REPORT.md`.

## Faz 5 — testler ve doğrulama

Bkz. bu raporun sonundaki "Doğrulama Sonuçları" veya ana teslim mesajı (typecheck/lint/test/build
komut çıktıları, izole çalıştırmalar dahil).

## Sonuç maddeleri (görev talimatının istediği 10 madde)

1. **Kök neden:** `selectActiveTemplateOfKind` `active` alanını hiç filtrelemiyordu — çağıranın
   ön-filtrelemesine güveniyordu (kırılgan sözleşme).
2. **Seçim davranışı (önce/sonra):** Önce — teorik olarak unfiltered bir listede en son
   güncellenen (`dtpl_fy9artyvontl`, active:false) seçilirdi. Sonra — HER ZAMAN, çağıranın
   filtrelemesinden bağımsız olarak yalnızca `active:true` adaylar arasından en son güncellenen
   (`dtpl_jfpy6i01m1de`) seçilir.
3. **Güncel gerçek aktif şablon:** `dtpl_jfpy6i01m1de`.
4. **Güncel en son uyumlu taslak:** `dtpl_fy9artyvontl` (içerik olarak aktif olanla AYNI).
5. **Sözleşme üretimi hiçbir zaman bir taslağı kullanabilir mi?** HAYIR — ne düzeltme öncesi
   canlı çağrı yollarında (kanıtlandı), ne de düzeltme sonrası (artık yapısal olarak imkansız).
6. **Sözleşme üretimi arşivlenmiş bir şablonu kullanabilir mi?** HAYIR — bu modelde "arşivlenmiş"
   = `active:false`, aynı filtreyle dışlanır.
7. **Bu düzeltmeden sonra manuel aktivasyon güvenli mi?** EVET — `activateTemplateExclusive`
   zaten atomik/tek-aktif garantili ve audit'li; hiçbir aktivasyon bu görevde YAPILMADI.
8. **İlk ödeme regresyon sonucu:** bkz. `FIRST_PAYMENT_DUPLICATION_PREVENTION_REPORT.md` — final
   politika hâlâ doğru uygulanıyor, regresyon YOK.
9. **Test/build/typecheck/lint sonuçları:** ana teslim mesajında/PR açıklamasında.
10. **Onay:** stage/commit/push/deploy YOK; shared/staging/production migration YOK; şablon
    auto-activate YOK; şablon verisi mutasyonu YOK; tarihsel sözleşme/ödeme değişikliği YOK.
