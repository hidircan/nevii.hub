# Fiyat, paket adları ve kapasite — öneri raporu (2026-10-30)

Karar sahibin. Rakamlar öneridir; fiyatlar NeviiOS › Paketler ve Fiyatlar'dan girilir ve yayınlanır
(katalogdaki "Core/Pro" paketleri şu an "ÖRNEK FİYAT — demo" etiketli).

## 1. Altyapı gerçekte ne kaldırır?

Doğrulanmış plan limitleri (supabase.com/pricing, vercel.com/pricing — 2026-10-30):

| | Free / Hobby | Pro |
|---|---|---|
| Supabase | 0 $; 500 MB DB; 5 GB egress/ay; 1 hafta hareketsizlikte proje durur | 25 $/ay; 8 GB disk/proje; **250 GB egress**, sonra 0,09 $/GB; durdurma yok |
| Vercel | 0 $; ticari kullanım YASAK | 20 $/ay (20 $ kullanım kredisi dahil); 1 TB veri aktarımı; CPU saat başı 0,128 $'dan |

Ölçülen tüketim (Nilüfer Acar, egress dalgaları sonrası, `pg_stat_statements`): ~6–10 MB/gün veritabanı
egress'i; Supabase panelindeki rakam ölçerin ~1,13 katı ve havuz ek yükü kadar fazladır → kurum başına
**~10–15 MB/gün** varsayın (kurum büyüdükçe doğrusal artar).

| Senaryo | Günlük egress | Supabase Free (≈170 MB/gün) | Supabase Pro (≈8 GB/gün) |
|---|---|---|---|
| 1 kurum (bugün) | ~15 MB | sığar | rahat |
| 10 kurum | ~150 MB | sınırda | rahat |
| 50 kurum | ~750 MB | aşar | %10 |
| 200 kurum | ~3 GB | aşar | %40 |

Sonuç:
- **Kod tarafı çok kurumu kaldırır**: her satır `tenantId` taşır, kurum kimliği yalnız oturumdan gelir,
  NeviiOS'ta kurum açma/paket/özellik/görünüm/rol/form/politika kurum başınadır.
- **Darboğaz plan kotası, kod değil.** Canlı Supabase organizasyonu Free planda. Para alan ikinci kurumdan
  ÖNCE (tercihen Nilüfer Acar'dan ilk tahsilattan önce) **Supabase Pro'ya geçin** (25 $/ay). Free'de proje
  hareketsizlikte durabilir; tekrar kota aşımında ikinci tolerans süresi yoktur.
- Vercel zaten Pro (ticari kullanım için zorunlu). Altyapı toplamı ~45 $/ay; 20–50 küçük-orta kurumu taşır.
- Ayrı kurum için ayrı veritabanı/ayrı deploy önermiyorum: maliyet ve bakım katlanır, NeviiOS tek yerden
  yönetimi kaybolur. Büyük bir kurum "verim ayrı dursun" diye sözleşmeyle isterse "Kampüs" teklifine özel
  fiyatlanır.

## 2. "Yeni kurum diğerlerini bozmasın" — nasıl sağlanır?

| Risk | Bugünkü koruma | Yapılacak |
|---|---|---|
| Veri karışması | Satır düzeyinde tenant filtresi, oturumdan kurum kimliği, RBAC + kayıt düzeyi erişim | Yeni kurum açtıktan sonra iki kurumla çapraz kontrol (README "Multi-Tenant Demo" adımları) — **bu oturumda db modunda iki kurumla koşulmadı** |
| Kurum özel ayarı diğerini etkilemesi | Özellik bayrağı, paket, tema, rol, form, politika kurum başına (NeviiOS › Kurumlar › sekmeler) | Kod gerektiren kişiselleştirmeyi (yeni alan/akış) önce bayrak arkasında yayınla |
| Yeni sürümün herkesi aynı anda etkilemesi | Tek kod tabanı, sahip onaylı yayın | Riskli özelliği kurum bazlı bayrakla önce tek kurumda aç |
| Kota | Egress ratchet testi, dar okuma kuralları | Supabase Pro; ayda bir egress raporu |

Yeni kurum açma (kod gerekmeden): NeviiOS › Kurumlar › Yeni kurum → Paket → Özellikler → Görünüm
(logo/renk) → Kullanıcılar (kurum sahibini davet) → Formlar/Politikalar. Satın alma sitesinden gelen
müşteride bu akış ödeme onayıyla kendiliğinden başlar.

## 3. Paket adları

Müzik çağrışımlı adlar (Nota/Ritim/Senfoni) yoga, dil kursu ve dans stüdyosuna uymaz. Sektörden bağımsız,
büyüklüğü anlatan, Türkçe ve kısa öneri:

| Paket | Kime | Limit önerisi |
|---|---|---|
| **Atölye** | Tek şube, küçük stüdyo/kurs | 60 öğrenci, 5 personel, 1 şube |
| **Akademi** | Büyüyen kurum (Nilüfer Acar bu sınıfta) | 250 öğrenci, 20 personel, 2 şube |
| **Kampüs** | Çok şubeli / zincir | Sınırsız veya sözleşmeyle; özel teklif |

Eklenti (her pakete): AI asistan çağrı kotası, SMS/WhatsApp (ölçüm altyapısı gelene kadar kota satmayın —
NeviiOS fiyat yardımcısı da bunu söylüyor), ek şube.

## 4. Fiyat önerisi (KDV hariç, TL)

| Paket | Aylık | Yıllık (2 ay hediye) |
|---|---|---|
| Atölye | 1.490 | 14.900 |
| Akademi | 2.990 | 29.900 |
| Kampüs | 5.990'dan başlayan özel teklif | — |

Gerekçe (maliyet tabanı + değer):
- Altyapı ~45 $/ay ≈ 1.500–1.600 TL; 10 kurumda kurum başı ~160 TL. Destek ve geliştirme emeği asıl
  maliyettir; fiyat bunu karşılamalı.
- Değer: tek bir unutulan aidat veya telafi karmaşasının çözülmesi ayda paketi öder; öğretmen hakedişi ve
  sözleşme/tahsilat takibinin el emeği sekreter saatleriyle ölçülür.
- Yıllık peşin = nakit akışı + müşteri kaybı düşer.

### Nilüfer Acar için
Kurucu (ilk) müşteri olduğu, ürünü birlikte olgunlaştırdığınız ve referans olacağı için:
- **Akademi, kurucu müşteri fiyatı: 1.990 TL/ay + KDV**, ilk 12 ay sabit; veya **yıllık peşin 19.900 TL + KDV**.
- Karşılığında: referans/logo kullanım izni, ayda bir geri bildirim görüşmesi. 12 ay sonunda liste fiyatı
  veya o günkü kurucu indirimi (ör. %20) — sözleşmede yazılı olsun.
- NeviiOS › Kampanyalar'da "Kurucu müşteri" kampanyası olarak tanımlanabilir; fiyat yeni dönemde
  Yenileme koşullarındaki 30 gün önceden bildirim kuralıyla değişir.

## 5. Para almadan önce yapılacaklar (sırayla)
1. Supabase Pro'ya geçiş (sahip, Supabase panelinden).
2. NeviiOS › Fatura › E-belgeler › Satıcı profili: HDR Mühendislik unvan, vergi no (şahıssa T.C. kimlik no),
   vergi dairesi, adres, MERSİS (şirketse), KEP, telefon.
3. NeviiOS › Hukuki Belgeler: her belge için "Hazır taslağı yükle" → avukata okut → hukuki + ticari onay → Yayınla.
4. NeviiOS › Fatura › KDV oranı: %20 (SaaS hizmeti) — mali müşavirle teyit.
5. PayTR üye işyeri başvurusu + Direct API/kart saklama/Non3D yetkileri; ETBİS kaydı (e-ticaret sitesi);
   İYS kaydı (pazarlama e-postası göndermeden önce); e-Fatura/e-Arşiv entegratörü.
6. Paketleri yukarıdaki ad/limit/fiyatla NeviiOS'tan yayınla; "ÖRNEK FİYAT" paketlerini pasifleştir.
