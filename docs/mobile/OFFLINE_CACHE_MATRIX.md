# Offline Read-Cache Matrisi (Faz 7)

Salt-okunur, stale-while-revalidate. Yazma kuyruğu YOK — yoklama, ödeme,
portal erişimi, duyuru ve onay yazmaları çevrimdışıyken hata gösterir, sahte
başarı gösterilmez.

## Kapsam + TTL

| Veri | Sınıf | TTL | Ekranlar |
|---|---|---|---|
| Ders programı + takvim | schedule | 15 dk | Program, Ana sayfa, Gelişim |
| Ödev listesi/detayı | homework | 15 dk | Ödevler, Ana sayfa |
| Materyal metadata | reference | 60 dk | Materyaller |
| Devam özeti + detay raporu | attendance | 30 dk | Devam raporu, Ana sayfa, Gelişim |
| Telafi listesi/detayı | makeup | 15 dk | Telafiler |
| Ödeme ledger + makbuz metadata | payments | 15 dk | Ödemeler, Ana sayfa |
| Bildirim ilk sayfası | notifications | 5 dk | Bildirim merkezi, Ana sayfa |
| Müfredat + öğrenci başlığı | reference | 60 dk | Gelişim, tüm başlıklar |

## Anahtar + izolasyon

`v1/<tenant>/<user>/<persona>/<student|->/<yol-hash>.json` — çocuk/kullanıcı/
tenant/persona değişiminde anahtar değişir. Ödeme checkout URL'i, token/secret,
fotoğraf baytı, indirme/presign allowlist DIŞI (yazılmaz + okunmaz). Kayıt başına
512 KB, toplam 200 kayıt üst sınırı (en eski silinir).

## Invalidation + temizlik

- Başarılı ağ yanıtı kaydın üzerine yazılır (savedAt güncellenir).
- 401/403'te kayıt SİLİNİR (erişim kaybında eski hassas veri gösterilmez).
- Logout'ta kullanıcının TÜM cache'i silinir (`clearUserCache`).
- Çocuk değişiminde yeni anahtar kullanılır (eski çocuğun verisi görünmez).
- Bozuk/sürümsüz kayıt silinir, miss sayılır.
- Ağ geri geldiğinde focus/foreground/refresh ile tazelenir (Faz 8).

## Test

`src/cache/__tests__/read-cache.test.ts` (allowlist, anahtar izolasyonu, TTL,
bozuk-temizlik, toplu silme) + `read-cache-contract.test.ts` (logout temizliği,
ekran entegrasyonu, yazma-kuyruğu yasağı).
