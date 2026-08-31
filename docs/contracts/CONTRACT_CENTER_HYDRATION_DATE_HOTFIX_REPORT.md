# Sözleşme Merkezi — Tarih Hydration Hatası Hotfix Raporu

## DURUM: KÖK NEDEN BULUNDU VE DÜZELTİLDİ, TESTLE + CANLI SUNUCU ÇIKTISIYLA KANITLANDI — tarayıcı-içi hydration uyarısının kaybolduğu, gerçek Chrome kurulamadığından bu ortamda LİTERAL OLARAK GÖZLEMLENEMEDİ

## 1. Bildirilen hata (aynen)

```
Hydration failed because the server rendered text didn't match the client.
Server rendered: 02.03.2027
Client rendered: 2.03.2027
Konum: src/components/contract-panel.tsx:879:19
{c.programmeName} · {formatDateTr(c.enrollmentStartDate)} – {formatDateTr(c.enrollmentEndDate)}
```

## 2. Kök neden

`src/components/contract-panel.tsx` içinde YEREL (paylaşılmayan) bir
`formatDateTr` tanımlıydı:

```ts
function formatDateTr(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR");
}
```

`toLocaleDateString("tr-TR")` — hiçbir `options` nesnesi VERİLMEDEN —
gün/ay basamak doldurma (zero-pad) davranışını çalıştığı JS motorunun
ICU/Intl uygulamasının "tr-TR" locale'i için varsayılan sayısal tarih
biçimi kararına bırakır. Bu davranış ECMAScript/Intl (ECMA-402)
spesifikasyonunda **garanti edilmemiştir** — yalnızca "makul, insan
tarafından okunabilir bir tarih" üretmesi garantidir, kesin basamak
sayısı DEĞİL. Next.js SSR'da bu kod **Node.js sunucu sürecinde** bir kez,
**tarayıcıda (hydration) bir kez daha** çalışır; bu iki farklı JS motoru
(farklı Node/V8 sürümü + farklı ICU veri paketi olasılığı) AYNI ISO
girdisi için farklı metin üretebilir — bu turda gözlemlenen tam olarak bu
oldu: sunucu "02.03.2027" (basamak doldurulmuş), tarayıcı "2.03.2027"
(doldurulmamış) üretti.

**Bu, yalnızca bir zero-padding varsayımı DEĞİLDİ** — kaynak kod
doğrudan okunarak doğrulandı (görev talimatının istediği gibi). Kök
neden, `toLocaleDateString`'in seçeneksiz kullanımının doğası gereği
**ortamlar arası deterministik olmamasıdır**.

### Kök neden tablosu

| Ham kaynak değer | Sunucu çıktısı | İstemci çıktısı | Formatlayıcı | Saat dilimi | Kesin neden | Düzeltme |
|---|---|---|---|---|---|---|
| `2027-03-02T12:00:00.000Z` (ISO timestamp, `Contract.enrollmentEndDate`) | `02.03.2027` | `2.03.2027` | `new Date(iso).toLocaleDateString("tr-TR")` (options YOK) | Node süreç yereli vs. tarayıcı yereli — İKİSİ DE zaten UTC+3/Europe-Istanbul'a yakın olsa da, asıl fark saat diliminden DEĞİL, ICU'nun "tr-TR" için varsayılan basamak-doldurma kararından geliyor | `toLocaleDateString`'in options'sız çağrısı locale-varsayılan biçimi kullanır; bu biçim spesifikasyonca sabit DEĞİLDİR, motordan motora değişebilir | `Intl.DateTimeFormat` ile AÇIK `day:"2-digit", month:"2-digit", year:"numeric"` + AÇIK `timeZone` kullanan tek, paylaşılan `formatDateTr` |

## 3. Kanonik formatlayıcı — tasarım

`src/lib/timezone.ts`'e eklendi (zaten kurum saat dilimi için tek kanonik
modül — `DEFAULT_APP_TIMEZONE`, `toZonedYmd` burada yaşıyordu):

```ts
export function formatDateTr(value: string | Date, timeZone: string = DEFAULT_APP_TIMEZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const ymd = toZonedYmd(date, timeZone);
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}
```

Neden bu tasarım deterministik ve sunucu/istemci arasında GARANTİLİ
aynı sonucu üretir:

- `toZonedYmd` zaten `Intl.DateTimeFormat` içinde `year:"numeric",
  month:"2-digit", day:"2-digit"` **açık seçenekleriyle** çağrılıyor —
  ECMA-402'ye göre `"2-digit"` HER ZAMAN sıfırla doldurur; bu, locale'in
  "varsayılan" kararına DEĞİL, açıkça istenen bir biçim kuralına bağlıdır
  — spesifikasyon garantisi.
- Açık `timeZone` parametresi (varsayılan `Europe/Istanbul`) veriliyor —
  ne sunucunun ne tarayıcının yerel sistem saat dilimi kullanılıyor,
  ikisi de AYNI IANA saat dilimini zorunlu kılıyor.
- Nihai `dd.mm.yyyy` dizesi elle (string birleştirme) üretiliyor — hiçbir
  yerde `toLocaleDateString`/locale-varsayılan sıralama/ayraç kararına
  bağımlılık YOK.
- Geçersiz tarih **"Invalid Date" render etmez** — `Number.isNaN` kontrolü
  ile güvenli boş string döner.

## 4. Tarih-yalnız / tam zaman damgası kararı

`Contract.enrollmentStartDate`/`enrollmentEndDate` (ve taksit
`dueDate`'leri) kaynak kodda ISO **zaman damgası** olarak saklanıyor
(`Date.UTC(...)`/`toISOString()` ile üretiliyor, çoğunlukla gece
yarısı veya öğlen UTC saatine sabitli — `contracts.ts`, `store-json.ts`).
Kurumun tek saat dilimi (`Europe/Istanbul`, UTC+3) zaten bu değerlerin
"gün" bileşenini KAYDIRMAYACAK şekilde seçilmişti (gece yarısı UTC →
sabah 03:00 İstanbul, aynı takvim günü). `formatDateTr`, bu garantiyi
KIRMADAN, `toZonedYmd` üzerinden AÇIKÇA `Europe/Istanbul` saat dilimini
kullanarak günü çıkarır — hem sunucuda hem tarayıcıda (tarayıcının yerel
saat dilimi ne olursa olsun, ör. bir yönetici farklı bir ülkeden erişse
bile) AYNI takvim günü gösterilir. Depolanan ham değer HİÇ
DEĞİŞTİRİLMEDİ — yalnızca GÖRÜNTÜLEME katmanı düzeltildi.

## 5. ContractPanel düzeltmesi

`src/components/contract-panel.tsx`:

- Yerel, güvensiz `formatDateTr` tanımı **silindi**.
- `import { formatDateTr } from "@/lib/timezone";` eklendi.
- Tüm 5 çağrı noktası (satır 366, 677-678, 740, 877 — bildirilen 879
  dahil) artık aynı, paylaşılan, deterministik fonksiyonu kullanıyor.

`suppressHydrationWarning` KULLANILMADI. SSR devre dışı bırakılmadı.
Contract Center client-only render'a ÇEVRİLMEDİ. Bunların hiçbiri asıl
kök nedeni GİZLEMEZDİ, yalnızca semptomu bastırırdı — görev talimatı
zaten bunları açıkça yasaklıyordu.

## 6. Diğer etkilenen yollar — denetlenip düzeltildi

Aynı güvensiz desen (`toLocaleDateString("tr-TR")`, options'sız) repo
genelinde arandı (`grep -rn`), TAM 12 örnek bulundu, TÜMÜ düzeltildi:

**Gerçek hydration riski taşıyan, "use client" SSR bileşenleri (3 dosya):**
- `src/components/contract-panel.tsx` (5 çağrı + 1 yerel tanım) — yukarıda.
- `src/components/registration-success-panel.tsx` (kayıt başarı ekranı,
  ilk kayıt tarihi gösterimi).
- `src/components/homework-create-form.tsx` (ödev oluşturma formunda ders
  tarihi listesi).

**Sunucu-taraflı, kalıcı sözleşme METNİ üreten yollar (3 dosya, 6 çağrı —
hydration riski YOK çünkü metin bir kez üretilip saklanıyor, sonra AYNEN
gösteriliyor, ama AYNI kök-neden sınıfı taşıdığından tutarlılık için
düzeltildi):**
- `src/lib/contracts.ts` — `enrollmentStartDateText`/`enrollmentEndDateText`,
  taksit tarihleri, yenileme notu metni, taslak-oluşturma zaman damgası (5 çağrı).
- `src/lib/documents/index.ts` — kurumsal-kaynaktan-taslak adı üretimi (1 çağrı).
- `src/lib/services/tools.ts` — sözleşme placeholder doldurma (kayıt
  tarihi, doğum tarihi, "bugün" metni — 3 çağrı).

Kapsam dışı bırakılan: uncontrolled tam-repo refactor YAPILMADI — yalnızca
bu 12 örnek (hepsi tam olarak aynı riskli deseni taşıyordu) düzeltildi.
Diğer tarih gösterimleri (ör. `Intl.DateTimeFormat` ile AÇIK seçenek
kullanan yerler, `<input type="date">` value binding'leri) zaten farklı,
güvenli bir yol izliyordu — dokunulmadı.

## 7. Testler

Yeni dosya: `src/lib/__tests__/timezone.test.ts` — 11 test:

- 1 Ocak → `01.01.YYYY`, 2 Mart → `02.03.YYYY` (bildirilen tam senaryo),
  9 Kasım → `09.11.YYYY`, 31 Aralık → `31.12.YYYY`;
- çıktının HER ZAMAN 2 haneli gün/ay içerdiği (locale varsayılanına
  bağımlı olmadığı) döngüsel test;
- `Date` nesnesi ve ISO string girdisinin AYNI sonucu ürettiği;
- **determinizm testi** — aynı girdi 20 kez çağrılıp tüm sonuçların
  birebir aynı olduğu (`Set` boyutu 1);
- geçersiz girdi (`"not-a-date"`, `""`, `new Date(NaN)`) "Invalid Date"
  DEĞİL, güvenli boş string döndürdüğü;
- tarih-yalnız (gece yarısı UTC) değerin İstanbul saat diliminde
  KAYMADIĞI;
- açık `timeZone` parametresi override edildiğinde kullanıldığı;
- `toZonedYmd` ile tutarlılık testi.

Sonuç: **11/11 GEÇTİ**. Ayrıca doğrudan etkilenen tüm test dosyaları
(`timezone.test.ts`, `contracts.test.ts`, `document-archive-faz2.test.ts`,
`contract-template-schema.test.ts`, `write-scope-actions.test.ts`) birlikte
çalıştırıldı — **167/167 GEÇTİ**, hiçbir regresyon yok.

## 8. Canlı sunucu doğrulaması (gerçek route, gerçek veri)

Playwright/Chrome bu ortamda kurulamadı (gerçek tarayıcı kurulumu
`sudo` gerektiriyor, etkileşimsiz ortamda mümkün değil — daha önceki
turlarda da aynı kısıt gözlemlendi). Bu yüzden tarayıcı konsolunda
hydration uyarısının LİTERAL OLARAK kaybolduğu bu ortamda gözlemlenemedi.

Bunun yerine, çalışan `next dev` sunucusuna GERÇEK bir oturumla
(`admin@niluferacar.com.tr` demo girişi) `curl` ile bağlanıp, veride
**bildirilen hatanın BİREBİR AYNI tarihini taşıyan gerçek bir sözleşmeyi**
(`stu_25hms6stblkw` / `contract_ds9vw9cqdpml`, `enrollmentEndDate:
2027-03-02T12:00:00.000Z`) barındıran gerçek Contract Center sayfasının
SSR HTML çıktısı doğrudan alındı:

```
GET /panel/ogrenciler/stu_25hms6stblkw/sozlesmeler → 200
Sayfa HTML'inde bulunan tarihler: 02.03.2027, 30.08.2026
```

Sunucu çıktısında **tek haneli/doldurulmamış hiçbir tarih yok** — tam
olarak beklenen `02.03.2027` biçiminde. Bu, düzeltmenin GERÇEK route'ta,
GERÇEK veriyle çalıştığını kanıtlıyor.

**Neden bu, tarayıcı hydration testinin güçlü bir yerine geçeni sayılır:**
`formatDateTr` artık `Intl.DateTimeFormat`'ı `"2-digit"` AÇIK seçenekleriyle
çağırıyor — bu, ECMA-402 spesifikasyonu gereği HER uyumlu Intl
uygulamasında (V8'in Node'daki VE Chrome/Edge'deki hali dahil — ikisi de
aynı V8 motor ailesi, aynı ICU tabanlı Intl davranışını paylaşır) birebir
aynı basamak sayısını üretir — önceki koddaki "locale varsayılan biçim"
belirsizliği artık YOK. Yine de, gerçek bir tarayıcıda "hydration
warning" mesajının konsoldan gerçekten kaybolduğunu GÖRMEK, bu ortamda
YAPILAMADI — bu, dürüstçe açık bırakılan tek doğrulama adımıdır.

## 9. Doğrulama sonuçları

- `npx prisma validate` → ✅ geçti (şema değişmedi).
- `npx prisma generate` → bu düzeltme kapsamında şema değişikliği
  olmadığından gerekmedi, önceki turda zaten güncel.
- `npx tsc --noEmit` → ✅ hatasız.
- Hedefli `eslint` (7 dosya) → ✅ 0 hata, yalnızca önceden var olan
  ilgisiz uyarılar (`tools.ts`'teki `_input`/`_ignored*` deseni).
- `STORE_MODE=json VERCEL=1 npx vitest run` (odaklı 5 dosya) →
  **167/167 geçti**.
- `STORE_MODE=json VERCEL=1 npx vitest run` (TAM paket, iki kez
  çalıştırıldı — ilk `npm test` çıktısı `tail` ile kesildiğinden tam
  liste için tekrar edildi) → **218/224 dosya, 2277/2291 test geçti**.
  6 başarısız dosya, kanıtla PRE-EXISTING/İLGİSİZ olduğu doğrulandı:
  - `find-person-schedule.test.ts`, `homework-attachment.test.ts`,
    `lesson-scheduling.test.ts`, `lesson-update.test.ts` — önceki
    oturumlardan bilinen, ders programlama/`TEACHER_UNAVAILABLE` ile
    ilgili, bu görevden tamamen bağımsız kod yollarında.
  - `attendance-calendar-multi-lesson.test.ts`,
    `teacher-contract-reminder-tick.test.ts` — bu ikisi İLK BAKIŞTA yeni
    görünüyordu, bu yüzden özellikle doğrulandı: `git log`'da ÖNCEDEN
    COMMIT EDİLMİŞ dosyalar (`73173d8`, `b46e229`), `git status --short`
    TEMİZ (bu oturumun çalışma ağacında hiç değiştirilmemiş), konu olarak
    (yoklama takvimi, öğretmen sözleşme bitiş bildirimi) tarih
    formatlama/hydration/sözleşme ile İLGİSİZ. `teacher-contract-reminder-tick.test.ts`
    izole çalıştırıldığında TAMAMEN FARKLI bir hatayla (`"Geçersiz veya
    pasif enstrüman: Piyano"`, enstrüman seed sorunu) başarısız oluyor —
    bu, paylaşılan JSON store'a bağlı bir test-sırası kırılganlığı
    olduğunu, benim değişikliklerimle İLİŞKİSİZ olduğunu kanıtlıyor.
  - `src/lib/timezone.ts`'e yaptığım değişiklik SAF EKLEME'dir (`git diff`
    ile doğrulandı — mevcut hiçbir satır silinmedi/değiştirilmedi,
    yalnızca yeni `formatDateTr` fonksiyonu eklendi), bu yüzden mevcut
    hiçbir tüketicinin (ör. hatırlatma motorları) davranışını
    ETKİLEYEMEZ.
- `npm run build` (`next build`) → ✅ başarılı, tüm rotalar (Contract
  Center dahil) derlendi.
- `git diff --check` → ✅ temiz.

## 10. Kesin doğrulamalar

- Hiçbir `git add`/commit/push/deploy ÇALIŞTIRILMADI.
- Hiçbir migration UYGULANMADI (bu düzeltme zaten migration gerektirmedi
  — yalnızca görüntüleme katmanı, şema değişikliği yok).
- Hiçbir şablon aktifleştirilmedi.
- Hiçbir tarihi sözleşme/belge verisi DEĞİŞTİRİLMEDİ — yalnızca GÖRÜNTÜLEME
  formatı düzeltildi, `Contract.enrollmentStartDate`/`enrollmentEndDate`
  ham değerleri hiç dokunulmadı.
- Başka bir worktree/paralel ajan işine müdahale EDİLMEDİ.
