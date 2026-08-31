# Öğrenci/Veli Portal — Sözleşme Erişimi Doğrulama

## DURUM: DOĞRULANDI, ERİŞİM SAĞLAM — hiçbir kod değişikliği yapılmadı (yalnızca denetim)

## 1. Görev bağlamı

Önceki turda admin panel sidebar'ının altındaki "Öğretmen portalı"/"Öğrenci
portalı" hızlı-erişim linkleri kaldırılmıştı (temiz karşılama ekranı
isteği kapsamında). Bu tur, bunun öğrenci/veli portal ERİŞİMİNİN kendisini
YANLIŞLIKLA bozmadığını doğrulamak için yapıldı — görev talimatı açıkça
"Do not remove student portal capability" diyor.

## 2. Denetim sonucu

- **Kaldırılan**: yalnızca admin panelinin sol menüsündeki, adminin
  kendi hesabından öğretmen/öğrenci görünümüne "atlaması" için kullanılan
  2 kısayol linki (`src/components/sidebar.tsx`). Bunlar portalların
  KENDİSİ değil, admin'e özel bir gezinme kolaylığıydı.
- **Dokunulmayan/sağlam**: `/ogrenci` portalı — kendi `layout.tsx`'i,
  kendi oturum/kimlik doğrulaması, kendi navigasyonu ile tamamen bağımsız
  çalışmaya devam ediyor. Bir öğrenci/veli `/login` üzerinden normal
  şekilde giriş yapıp bu portala erişebiliyor (admin sidebar'ından
  bağımsız bir yol).
- **Sözleşme erişim rotası**: `/ogrenci/sozlesmelerim/page.tsx` mevcut ve
  çalışıyor — öğrencinin/velinin kendi sözleşmelerini listeliyor, her biri
  için "Sözleşmeyi görüntüle / yazdır" bağlantısıyla
  `/sozlesme-yazdir/[contractId]`'e yönlendiriyor (bu rota da `getContractHtmlTool`
  içindeki `canAccessStudent` ile yetkilendiriliyor — yalnızca ilgili
  öğrenci/veli veya personel görebilir, IDOR koruması mevcut).
  Öğrenci portalı ana sayfasında (`ogrenci/page.tsx`) bu sayfaya giden bir
  gösterge kartı VAR — kalıcı bir üst menü linki yok, ama erişilebilir.
- **`/veli/**` rotası**: Bilinçli, ÖNCEDEN VAR OLAN bir tasarım — "Karma
  Öğrenci Portalı" birleşmesiyle veli portalı `/ogrenci`'ye taşınmış,
  `/veli/layout.tsx` artık koşulsuz `redirect("/ogrenci")` yapıyor. Bu, bu
  turun yaptığı bir değişiklik DEĞİL — önceden var olan, kasıtlı bir
  yönlendirme kabuğu; olduğu gibi bırakıldı.

## 3. Sonuç

Öğrenci/veli portal kapasitesi ve sözleşme erişim rotası TAM ÇALIŞIR
durumda; bu turdaki sidebar değişikliği yalnızca admin'e özel bir kısayolu
kaldırdı, gerçek portal işlevselliğine dokunmadı. Kod değişikliği
gerekmedi — bu rapor yalnızca denetim/doğrulama kaydıdır.

## 4. Kapsam dışı bırakılan (bilinçli)

Görev talimatı "do not expand scope into multi-child switcher unless
necessary" diyor — birden fazla çocuğu olan bir velinin çocuklar arası
geçiş yapabildiği bir switcher UI'ı bu turda incelenmedi/eklenmedi, çünkü
görevin asıl P0 kapsamı bu değildi.
