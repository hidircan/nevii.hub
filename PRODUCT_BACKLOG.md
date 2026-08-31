# Nevii Hub — Onaylı Ürün Backlog

> **Durum:** Onaylı gereksinimler · canlıya alma / deploy / push bu belgenin uygulama
> kapsamında **yoktur**.  
> **Kaynak:** Operatör onaylı backlog (2026-08-05 oturumu).  
> **İlişki:** `IMPLEMENTATION_PLAN.md` (tamamlanan EPIC’ler), `WORK_PROGRESS.md`,
> `PRODUCTION_AUDIT.md`. Bu belge yeni işleri tanımlar; tamamlanmış EPIC’leri yeniden açmaz.

---

## 0. Uygulama sırası (bağımlılık)

| Sıra | Paket | Gerekçe |
|------|--------|---------|
| 1 | Öğrenci/öğretmen hassas veri + yetki | T.C. şifreleme, maskeleme, RBAC, audit; diğer formlar buna bağlanır |
| 2 | Öğrenci ve öğretmen model/formları | Profil alanları, seviye kuralları, filtreli listeler, pasifleştirme |
| 3 | Tahsilat kuralları | Vade pencereleri, kurum IBAN ayarları, taslak banka seçimi |
| 4 | Program / yoklama / deneme dersi | Takvim, tatiller, pazartesi kapalı, deneme yaşam döngüsü |
| 5 | Evraklar Merkezi Faz 1 | Şablon + otomatik alan + referans + yazdırma/PDF |
| 6 | Evraklar Merkezi Faz 2 | Yükleme, imzalı sürüm, versiyon, arama, tam audit |

**Kısıtlar (tüm paketler):**

- Deploy / push / release / gerçek veri geçişi yok.
- Kirli çalışma ağacında ilgisiz dosyalara dokunma; küçük, izole commit.
- Yeni veri: DB + JSON + memory parity, Zod, RBAC, tenant izolasyonu, audit, seed, export/backup, test.
- Silme yok (hard delete yok); pasife alma / arşiv / geri alma tercih edilir.

---

## 1. Öğrenci

### 1.1 Eğitim türü ve seviye kuralları

| Tür | Seviye | Not |
|-----|--------|-----|
| **MEB** | Zorunlu 1–8 | Başlangıç + bitiş kayıt tarihleri zorunlu mantıkla uyumlu |
| **LCM** (`London College of Music Hazırlık`) | Opsiyonel seviye | |
| **Diğer türler** (Hobi, Konservatuvar, GSL, …) | Seviye **görünmez** | UI ve validation seviye istemez |

- **“Kayıt Başlangıç Tarihi” = “Kayıt Tarihi”** (tek alan / etiket birleşimi).
- **MEB öğretmeni** şimdilik yok (ayrı rol/atanan kişi modeli yok).

### 1.2 Kayıt sırasında alınan alanlar

- Doğum tarihi → **yaş otomatik** (hesaplanan, saklanabilir türev).
- T.C. kimlik numarası (hassas — bkz. 1.3).
- Adres.
- Veli telefonu + öğrenci telefonu.
- Ders süresi tercihi: **30 / 40 / 50 dk**.
- Eğitim metodu: `Suzuki | Klasik | LCM | MEB | Kurum İçi | Diğer`.
- Ödeme: şekil, tutar, vade.
- İlk ders tarih + saat (kayıt anında).

### 1.3 T.C. kimlik güvenliği

| Kural | Detay |
|-------|--------|
| Saklama | **Şifreli** (at-rest encryption; düz metin store/export yok) |
| Liste | **Gösterilmez** |
| Detay | **Maskeli** (örn. `*********34`) |
| Tam görünüm | Yalnızca yetkili roller (SUPER_ADMIN / SCHOOL_ADMIN; açık izin) |
| Audit | Görüntüleme / çözümleme loglanır |

### 1.4 Sosyal medya izni

- Durum (verildi / reddedildi / geri çekildi / süresi doldu, vb.).
- Veli / yasal temsilci kimliği ve yakınlık.
- Tarih-saat.
- **Çoklu kapsam** (foto, video, isim, platform listesi, …).
- Kaynak / dayanak evrak referansı.
- Geri çekilme kaydı.
- **Audit tarihçesi** (tüm durum değişimleri).

### 1.5 Yaşam döngüsü

- **Hard delete yok.**
- Pasife alma / arşivleme.
- Geri alma (reaktivasyon).

### 1.6 Öğrenci listesi

- **Tüm sütunlarda filtre.**
- **Şube** sütunu + filtresi.
- **Toplam sayı** + **filtre sonucu sayısı.**
- **Paket sütunu:** yalnızca paket adı (fiyat/detay yok).
- **Telefon ve not listede yok.**

### 1.7 Öğrenci detay sekmeleri / bölümleri

Kişisel/veli · Şube · Ödeme-tahsilat · Ders-program · Yoklama · Telafi · Ödev ·
Materyal · Müfredat/ilerleme · Gelişim · Rapor · Metod · **Evraklar**.

---

## 2. Tahsilat

### 2.1 Vade pencereleri

| Ödeme şekli | Vade kuralı |
|-------------|-------------|
| Kredi kartı | Ayın **1–5** arası |
| Nakit / havale | En geç ayın **20**’si |

### 2.2 IBAN / banka taslağı

- WhatsApp/SMS tahsilat taslağında:
  - **MEB öğrencisi** → **VakıfBank** IBAN
  - **Diğer** → **Halkbank** IBAN
- IBAN’lar **kurum ayarlarında** saklanır.
- Taslak yönetici tarafından **düzenlenir ve onaylanır** (mevcut approval akışı ile uyumlu).

---

## 3. Öğretmen

### 3.1 Profil alanları

- Lise (opsiyonel).
- Üniversite, mezuniyet.
- Doğum tarihi.
- T.C. kimlik (öğrenci ile aynı hassas veri kuralları).
- E-posta, adres.
- Sözleşme başlangıç / bitiş.

### 3.2 Enstrüman + seviye

- Çoklu enstrüman.
- Her enstrüman için seviye: **Başlangıç | Orta | İleri**.

### 3.3 Liste / detay / bildirim

- Filtreli liste ve detay.
- Sözleşme bitimine **30 gün** kala yöneticiye **tekilleştirilmiş** bildirim
  (aynı öğretmen için gürültü yok).

### 3.4 Hakediş / ödeme eşiği

- Yönetilebilir **haftalık ders saati eşiği**:
  - Üstü → varsayılan **nakit**
  - Altı → varsayılan **havale**
  - Yönetici override edebilir.
- Hakediş tablosunda **Enstrüman sütunu kaldırılır**.

---

## 4. Program / Yoklama

### 4.1 Pazartesi kapalı

- UI’da görünmez (veya gün yok).
- Backend planlama / slot önerisi Pazartesi’yi **engeller**.

### 4.2 Tatil / kapalı günler

- Türkiye resmî tatilleri **otomatik**.
- Yönetici **özel kapalı gün** ekler.
- Günler takvimde işaretli; planlamaya **kapalı**.

### 4.3 Takvim UX

- Takvim **10:00**’da başlar; **09:00–10:00 yok**.
- “Başlangıç Tarihi” = “**Ders Planı**” (etiket).
- Okunaklı grid; sınırlar, punto, sürükle-bırak belirgin.

### 4.4 İletişim

- Ders oluşunca **yalnız veliye** mesaj taslağı (öğretmene otomatik taslak yok bu kuralda).

### 4.5 Yoklama durumları

| Durum | Görünüm | Anlam |
|-------|---------|--------|
| **Geldi** | Yeşil | Öğrenci derste |
| **İşlendi** | Yeşil + ders tamamlandı | Yoklama + ders bitmiş |
| **Telafi** | Kırmızı | Telafi hakkı / telafi dersi bağlamı |

- Yoklama varsayılan **yalnız bugünü** gösterir.
- Ders kartında aynı **hızlı aksiyonlar** bulunur.

---

## 5. Deneme dersleri

### 5.1 Planlama girişi

- “Ders Planla” yanında **“Deneme Dersi Planla”**.
- Alanlar: ad, telefon, branş, şube, öğretmen, tarih, saat, süre.
- Normal **çakışma kontrolleri** uygulanır.

### 5.2 Ayrı model + durumlar

`Planlandı | Katıldı | Düşünüyor | Kayıt Bekliyor | Devam Edecek | Devam Etmeyecek | İptal`

- Ayrı ekran / entity (öğrenci kaydından bağımsız pipeline).
- Deneme kaydı → **öğrenci kaydına dönüştürülebilir**.
- Operasyonel UI inisiyatifle (liste, filtre, durum geçişleri, boş/hata durumları).

---

## 6. Evraklar Merkezi

### 6.1 Menü ve şablon türleri

Yeni **Evraklar** menüsü:

- Öğrenci Kayıt Sözleşmesi
- Veli / Sosyal Medya İzni
- KVKK
- Öğretmen Sözleşmesi / Bilgi Formu
- Deneme Formu
- Telafi Talebi
- Ödeme Taahhüdü
- Dilekçe
- Özel şablonlar

### 6.2 Üretim

- Şablondan belge oluşturma.
- Bağlam: öğrenci / veli / öğretmen / deneme / kurum.
- Otomatik dolan: tarih, **benzersiz referans**, kişi/şube/kurum, metod,
  sözleşme tarihleri, ödeme planı.
- Elle doldurulacak alanlar boş kalabilir.

### 6.3 Referans kuralları

- Aynı belge **yeniden basılırsa referans korunur**.
- **Yeni örnek** → **yeni referans**.
- Mevcut **makbuz referans/yazdırma** altyapısı ortak servis olur (kopya değil, paylaşımlı).

### 6.4 Yaşam döngüsü ve dosya

- Dijital düzenleme, taslak, önizleme, yazdırma, PDF.
- İmzalı tarama yükleme, versiyon, arşivleme.
- Durumlar: `Taslak | Yazdırıldı | İmzaya Verildi | İmzalandı | Yüklendi | İptal Edildi | Süresi Doldu`.
- Öğrenci detayında **Evraklar** sekmesi.
- Dosya tipi/boyutu/erişim kontrolü, maskeleme, **tüm işlemlerde audit**.

### 6.5 Fazlar

| Faz | Kapsam |
|-----|--------|
| **Faz 1** | Şablon + otomatik alan + referans + yazdırma/PDF |
| **Faz 2** | Yükleme + imzalı sürüm + versiyon + arama + tam audit |

---

## 7. Kabul kriterleri (çapraz)

Her paket için minimum:

- [ ] Tenant izolasyonu (ALS / oturum)
- [ ] RBAC + hassas alan maskeleme
- [ ] Zod validation
- [ ] DB / JSON / memory parity (yeni entity)
- [ ] Audit (kritik yazma + T.C. full view)
- [ ] Seed / demo uyumu
- [ ] Export / backup listesinde yeni entity
- [ ] Unit + erişim (own/cross) testleri
- [ ] `typecheck` · `lint` · `test` · `prisma validate` · `build`

---

## 8. Bilinçli olarak bu backlog dışı

- Canlı deploy, production migration tatbikatı, gerçek müşteri verisi.
- Kart/RFID, billing SaaS planları, native mobil.
- AI agent genişletmeleri (backlog maddeleri operasyonel UI odaklı).

---

## 9. İlerleme takibi

| Paket | Durum | Commit / not |
|-------|--------|----------------|
| 0 Backlog belgesi | ✅ | `5646aa1` |
| 1 Hassas veri + yetki | ✅ | PII AES-GCM, maskeleme, `pii:full`, reveal audit |
| 2 Öğrenci/öğretmen model alanları | 🟡 kısmi | Types + schema + archive API; öğrenci/öğretmen detay ekranları eklendi (bkz. §11); form UX sonraki |
| 3 Tahsilat kuralları | 🟡 kısmi | Vade + IBAN çözümleme pure + tool; Geldi/İşlendi → otomatik öğrenci tahsilatı + öğretmen hakedişi entegrasyonu (bkz. §13) |
| 4 Program/yoklama/deneme | 🟡 kısmi | Pazartesi/kapalı gün helpers artık gerçekten uygulanıyor (bkz. §11) + deneme model/UI; Geldi/İşlendi/Telafi Program+Yoklama+öğretmen ekranlarının hepsinde canlı |
| 5 Evraklar Faz 1 | ✅ | Şablon, referans, oluştur/yazdır API+UI + tam Evraklar Merkezi (liste/filtre/KPI/detay), bkz. §11 |
| 6 Evraklar Faz 2 | 🟡 kısmi | İmzalı sürüm yükleme/görüntüleme eklendi; sürüm geçmişi/arama sonraki |

Durum güncellemeleri `WORK_PROGRESS.md` ve bu tablo ile senkron tutulur.

## 13. Yoklama, Tahsilat ve Öğretmen Hakedişi Entegrasyonu (ÖNCELİK 3, 2026-08-07)

Ayrıntılar için `WORK_PROGRESS.md`'deki aynı başlıklı bölüme bakın. Özet:
Geldi/İşlendi işaretlenince, o dersin KENDİ lessonId'si için — henüz yoksa —
otomatik bir öğrenci tahsilatı oluşuyor (çift kayıt engelli); Telafi tek
başına varsayılan olarak mali sonuç doğurmuyor (sistem ayarından
açılabilir); ders iptalinde ödenmemiş otomatik tahsilat "voided" oluyor;
tahsilat/hakediş satırlarında kaynak derse tek tıkla ulaşılabiliyor;
öğretmen hakediş ekranının açılmama ve sidebar'da iki menü öğesinin
birlikte aktif görünmesi hatası kök nedeniyle düzeltildi (yeni
`/panel/hakedisler` tenant-çapında ekranı + ölü query-param linkin
kaldırılması). Diğer öncelikler (4-7: yıllık takvim, fotoğraf yükleme,
Evrak modülü + filtre standardı, kurum logosu) bilinçli olarak bu
oturumun kapsamı dışında bırakıldı — operatör onayıyla, "önce Öncelik 3'ü
tamamla" kararı.

## 12. Öğrenci Filtre Menüsü + Öğretmen Değerlendirmesi + Ders Programı
    Görsel Yenilemesi (2026-08-06)

Ayrıntılar için `WORK_PROGRESS.md`'deki aynı başlıklı bölüme bakın. Özet:
öğrenci listesi filtreleri sade, listeli/açılır "Filtreler" menüsüne
dönüştürüldü (chip yığını yerine); öğrenci portalına gizli/güvenli öğretmen
değerlendirmesi eklendi (5 zorunlu kriter, aynı ay güncelleme kuralı,
yönetici incelemesi maskeli kimlikle + gerekçeli reveal, öğretmene yalnız
≥3 yanıtta anonim özet); Ders Programı ızgarası çizgi/tipografi/hiyerarşi
açısından yeniden tasarlandı (sticky başlıklar, saat çizgisi vurgusu,
büyük öğrenci adı, Geldi/İşlendi/Telafi rozetleri artık takvim kartlarında
da görünüyor). Gerçek bir güvenlik açığı (`veli/degerlendirme` sayfasının
`session.studentId || "s1"` varsayılanı) bu oturumda bulunup düzeltildi.

## 11. Kişi Detay Ekranları + Liste Filtreleri + Evraklar UX + Ders Programı
    Okunabilirliği + Kurumsal Tema Tercihleri (2026-08-05)

Ayrıntılar için `WORK_PROGRESS.md`'deki aynı başlıklı bölüme bakın. Özet:
öğrenci ve öğretmen detay ekranları (`/panel/ogrenciler/[studentId]`,
`/panel/ogretmenler/[teacherId]`) eklendi; öğrenci listesine tam sütun
filtreleri (URL query state) geldi; Evraklar Merkezi kart listesinden
gerçek bir doküman merkezine (KPI + tablo + detay + imzalı yükleme)
dönüştürüldü; Ders Programı artık Pazartesi'yi hiç göstermiyor, 10:00'da
başlıyor ve backend'de yeni Pazartesi planlamasını reddediyor; dört
kurumsal tema profili + üç yazı tipi seçeneği (`/gorunum-ayarlari`, tüm
portallardan erişilebilir) eklendi. Devir teslimde bulunan (ama hiç
commit'e alınmamış) `src/lib/nav/panel-nav.ts` da bu oturumda commit'e
alındı — onsuz fresh clone build alamazdı.

## 10. Fonksiyon Onarımı + Kurumsal UI Yenilemesi (2026-08-05, Grok devrinden devam)

Grok'un yarım bıraktığı sprint bu oturumda tamamlandı. Ayrıntılı checklist,
regresyon bulguları ve commit listesi için `WORK_PROGRESS.md`'deki aynı
başlıklı bölüme bakın. Özet: build'i kıran syntax hatası + eksik
`durationMinutes` validasyonu düzeltildi, Geldi/İşlendi/Telafi admin Program
ekranına bağlandı ve test edildi (18 yeni test), `/ogrenci` portalına geçmiş
ders/ilerleme/metod/pasif-hesap koruması eklendi, ve tüm uygulama tek, açık,
koyu-altın kurumsal temaya geçirildi (dark mode kaldırıldı).
