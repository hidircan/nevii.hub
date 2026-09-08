# Test → Production Veri Geçişi (Cutover) Planı

**Durum:** PLAN — bu turda **hiçbir adımı uygulanmadı**.
**Tarih:** 2026-09-09 · **Taban:** `fix/admin-payment-attendance-sync-p0`
**Kapsam:** Test ortamındaki gerçek kurum verisinin production'a **tek yönlü,
tek seferlik** taşınması.

> Bu belge bir **runbook taslağıdır**, çalıştırılabilir bir araç değildir.
> Brief kararı gereği import aracı bu turda **yazılmadı**. Aşağıdaki adımlar
> uygulanmadan önce owner onayı ve ayrı bir iş kalemi gerekir.

---

## 0. Ön koşul — bugünkü gerçek durum

Plan yapmadan önce doğrulanmış gerçekler (`docs/PRODUCTION_DATABASE_SOURCE_OF_TRUTH.md`,
2026-09-06 denetimi):

| Gerçek | Sonuç |
|---|---|
| Production uygulaması `STORE_MODE=memory` ile çalışıyor | Production'ın **kalıcı veritabanı YOK**; her cold start `createSeedData()` ile sıfırlanıyor |
| Production Supabase (`uqkafczrplqitzumtrqy`) **sıfır tablo** | Hiç migration uygulanmamış |
| Test Supabase (`vxzewyiwfshobjizzetw`) **sıfır tablo** | Temiz sayfa |
| Canlı build repo'nun ~178 commit gerisinde | Canlıda eski marka ("Maestron"), `/api/v1/ready` yok |

**Bunun cutover'a etkisi:** "test → production veri taşıma" bugün **erken bir
sorudur**. Önce production'ın bir veritabanına sahip olması gerekir. Doğru
sıra:

1. Production `STORE_MODE=db`'ye geçer ve `prisma migrate deploy` ile şema kurulur.
2. Güncel kod production'a deploy edilir.
3. **Ancak ondan sonra** aşağıdaki cutover anlamlı hale gelir.

Bu üç adım bu belgenin **kapsamı dışındadır** ve ayrı onay gerektirir.

---

## 1. Demo / test / gerçek veri sınıflandırması

Taşınacak veri, taşınmayacaktan **kaynağında** ayrılmalıdır. Üç sınıf:

| Sınıf | Tanım | Cutover'da |
|---|---|---|
| **Demo** | `src/lib/seed.ts` / `demo-seed.ts` ile üretilen sabit veri (`s1`, `t1`, `r1`, `l12`, "Erzene" şubesi vb.) | **ASLA taşınmaz** |
| **Test** | İnsanların test ortamında elle oluşturduğu, gerçek karşılığı olmayan kayıtlar (deneme öğrencileri, "asdf" isimli kayıtlar, senaryo sözleşmeleri) | **Taşınmaz** |
| **Gerçek** | Nilüfer Acar'ın kurumuna ait, gerçek öğrenci/veli/ödeme/sözleşme kayıtları | **Taşınır** |

### Sınıflandırma nasıl yapılır

Bugün şemada "bu kayıt demo mu" diyen bir alan **yok**. İki seçenek:

- **(A) Tercih edilen — `origin` alanı eklemek.** `Student`, `Teacher`,
  `Payment`, `StudentContract` gibi kök tablolara `origin` (`demo` | `manual`)
  eklenip seed'in ürettiği her kayıt `demo` olarak işaretlenir. Additive,
  geri dönüşü kolay, sorgulanabilir. Ayrı bir iş kalemi.
- **(B) Geçici — id ön eki + oluşturma tarihi.** Seed verisi sabit, tahmin
  edilebilir id'ler kullanır (`s1`, `t1`, …); gerçek kayıtlar `uid()` ile
  üretilir. Bu **kırılgandır** ve elle gözden geçirme gerektirir.

**Karar gerekli (owner):** cutover'dan önce (A) uygulanacak mı, yoksa (B) ile
elle mi doğrulanacak?

---

## 2. Demo verinin güvenli biçimde ayırt edilmesi

Export'tan önce çalıştırılacak doğrulamalar:

1. Demo id kümesi (`seed.ts` içindeki sabitler) kod tarafından çıkarılır ve
   export filtresine **dışlama listesi** olarak verilir.
2. Export sonrası **sayım mutabakatı**: `gerçek kayıt = toplam − demo` her
   tablo için ayrı ayrı raporlanır ve owner tarafından **göz ile onaylanır**.
3. Referans bütünlüğü: taşınan bir `Payment`'ın `studentId`'si taşınan bir
   `Student`'a işaret etmiyorsa export **durur** (yetim kayıt taşınmaz).
4. Şüpheli kayıtlar (ad alanı 2 karakterden kısa, telefonu olmayan veli,
   tutarı 0 olan sözleşme) ayrı bir "gözden geçir" listesine düşer —
   otomatik atılmaz, otomatik taşınmaz.

---

## 3. Gerçek Nilüfer Acar / şube verisinin export kapsamı

Taşınacak varlıklar ve sırası (yabancı anahtar bağımlılığına göre):

1. `Tenant`, `Branch`, `SchoolSettings`, `Room`
2. `User` (yalnız gerçek personel; parola hash'leri **taşınmaz** — bkz. §3.1)
3. `Teacher`, `Student`, `Guardian`
4. `LessonSeries`, `Lesson`
5. `StudentContract` + taksit/snapshot alanları
6. `Payment` (`paymentNote`, `receivedByUserId`, `contractId`,
   `installmentSequence`, ilk-tahsilat fark alanları **dahil**)
7. `MakeupRequest`, `Attendance`/ops bayrakları
8. `Document`, `AuditLog` (yalnız gerçek kayıtlara ait olanlar)

### 3.1 Taşınmayacaklar

- Parola hash'leri ve refresh token'ları → production'da **davet/aktivasyon
  akışıyla** yeniden kurulur. Sabit/açık parola **üretilmez**.
- Oturumlar, rate-limit sayaçları, cache
- AI konuşma geçmişi ve vektör bellek (yeniden üretilebilir)
- Test ortamına özgü env değerleri, webhook secret'ları

---

## 4. Freeze / cutover günü

| Adım | Sorumlu | Not |
|---|---|---|
| 1. Duyuru: test ortamı **salt-okunur**, veri girişi durur | Owner | En az 24 saat önce |
| 2. Test ortamında son yedek (Supabase snapshot) | Helios | Geri dönüş noktası |
| 3. Export çalıştırılır, sayım mutabakatı raporu üretilir | Prisma | §2'deki 4 kontrol |
| 4. Owner raporu onaylar | Owner | **Blocking** — onaysız devam edilmez |
| 5. Production'a import (tek yönlü) | Helios | Bakım penceresinde |
| 6. §5 doğrulama kontrolleri | Sentinel | Hepsi geçmeden açılmaz |
| 7. Production açılır, test ortamı salt-okunur **kalır** | Owner | §6 |

Freeze penceresi boyunca **test ortamında hiçbir yazma yapılmaz** — aksi halde
export ile import arasında oluşan kayıtlar sessizce kaybolur.

---

## 5. Import doğrulama kontrolleri

Import'tan sonra, production açılmadan **önce**:

- [ ] Her tablo için kayıt sayısı export raporuyla **birebir** eşleşiyor
- [ ] Hiçbir demo id (`s1`, `t1`, `r1`, …) production'da **yok**
- [ ] Tenant izolasyonu: her satırın `tenantId`'si beklenen tek tenant
- [ ] **Para değişmezleri** (bu turda eklenen `money-invariants.test.ts` ile
      aynı kurallar): her sözleşmenin taksit toplamı = dondurulmuş toplam
      tutar; normal aylık taksit = onaylı aylık ücret
- [ ] Ödeme mutabakatı: taşınan `paidAmount` toplamı = export toplamı
- [ ] `receivedByUserId` işaret ettiği kullanıcı production'da mevcut **veya**
      UI "Pasif/silinmiş kullanıcı" gösteriyor (audit izi kaybolmuyor)
- [ ] Yoklama statüleri: örneklem bir öğrenci için Ders Programı, Yoklama
      Takvimi ve Yoklama Raporu **aynı** statüyü gösteriyor
- [ ] Yetim kayıt yok (her `Payment` → geçerli `Student`, her `Lesson` →
      geçerli `Teacher`/`Room`)
- [ ] Owner, kendi kurumunda 3 gerçek öğrenciyi **gözle** doğruluyor

---

## 6. Test ↔ production çift yönlü senkron YASAĞI

Cutover **tek yönlüdür ve tek seferliktir**.

- Cutover'dan sonra production **tek gerçek kaynaktır**.
- Test ortamı production'dan veri **çekmez**; production test'ten veri **almaz**.
- İki ortam arasında otomatik senkron **kurulmaz** — kurulursa hangi tarafın
  kazandığı belirsizleşir ve çakışan yazmalarda sessiz veri kaybı olur.
- Test ortamı bundan sonra yalnız **demo/seed verisiyle** çalışır; gerçek
  müşteri verisi test ortamına **kopyalanmaz** (KVKK).

---

## 7. Rollback planı

| Senaryo | Aksiyon |
|---|---|
| Import sırasında hata | İşlem transaction içinde; **tamamı geri alınır**, production açılmaz |
| Import bitti, doğrulama (§5) başarısız | Production'ı açma. Supabase point-in-time restore ile import öncesine dön |
| Production açıldı, kritik veri hatası bulundu | Uygulamayı bakım moduna al → snapshot'a dön → test ortamındaki freeze yedeği hâlâ bozulmamış (§4 adım 2), yeniden export edilebilir |
| Kısmi import (bazı tablolar geçti) | **Elle düzeltme YAPILMAZ** — tamamen geri dönülür ve baştan çalıştırılır |

**Ön koşul:** freeze yedeği (§4 adım 2) alınmadan import **başlatılmaz**.

---

## Açık kararlar (owner)

1. §1'deki (A) `origin` alanı mı, (B) elle doğrulama mı?
2. Production'ın `STORE_MODE=db`'ye geçişi ne zaman planlanıyor? (cutover'ın ön koşulu)
3. Gerçek personel için davet e-postaları cutover gününde mi gönderilecek?
