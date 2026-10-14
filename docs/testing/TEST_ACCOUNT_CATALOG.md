# Test Hesabı Kataloğu

**Durum:** 2026-09-07 · **Ortam:** test (`test.neviihub.com`)

> **BU DOSYA PAROLA, TOKEN VEYA ÇEREZ İÇERMEZ VE İÇEREMEZ.**
> Aşağıda yalnızca *hangi rol için hangi amaçla bir hesap olduğu* ve
> *erişimin nasıl alınacağı* yazar. Parolalar yalnızca kurumun parola
> yöneticisinde (veya erişimi kısıtlı özel UAT dokümanında) tutulur; repoya,
> issue'ya, sohbete veya bu dosyaya YAZILMAZ.

## Neden bu dosya var

Giriş ekranındaki "Demo ile giriş" listesi 2026-09-07'de kaldırıldı: o liste
14 hesabın e-postasını ve **açık metin parolasını** taşıyordu ve bir client
component olduğu için parolalar her ziyaretçiye giden JS paketinin içindeydi.
Test hesapları test veritabanında durmaya devam ediyor; envanterleri artık
burada, parolasız tutuluyor.

## Erişim prosedürü

1. Kurumun parola yöneticisinde **"NeviiHub — Test Ortamı"** kasasına erişim
   isteyin (onay: ürün sahibi).
2. Kullanacağınız rolün hesabını kasadan alın.
3. `test.neviihub.com/login` üzerinden normal e-posta/şifre ile giriş yapın —
   giriş ekranında artık hızlı seçenek yoktur.
4. UAT bitince erişim talebinizi kapattırın.

> Otomasyon (Playwright vb.) için kimlik bilgileri ortam değişkeniyle
> geçilir (`VERIFY_EMAIL` / `VERIFY_PASSWORD`), dosyaya yazılmaz —
> bkz. `scripts/verify-contract-print.mjs`.

## Hesap envanteri (parolasız)

| Etiket | Rol | Kullanım amacı |
|---|---|---|
| `test-admin-okul` | `SCHOOL_ADMIN` | Panel geneli UAT: öğrenci/öğretmen/program/ödeme akışları |
| `test-superadmin` | `SUPER_ADMIN` | Çok kurumlu ("tüm kurumlar") birleşik görünüm ve rol kapısı testleri |
| `test-ogretmen-1` … `test-ogretmen-7` | `TEACHER` | Öğretmen portalı, kendi dersleri dışına erişememe (negatif RBAC) |
| `test-ogrenci-1` … `test-ogrenci-5` | `STUDENT` | Öğrenci portalı, kendi sözleşmesi/ödevi/yoklaması |
| `test-veli-1` … `test-veli-3` | `PARENT` | Veli portalı, yalnız bağlı olduğu öğrenci |

Etiketler kasadaki kayıt adlarıdır; e-posta adresleri de kasada tutulur.

## Kurallar

- Bu dosyaya parola, token, çerez, `DATABASE_URL` veya API anahtarı EKLENMEZ.
- Test hesaplarıyla production'a giriş denenmez.
- Bir test hesabının parolası sızdıysa: kasadan rotasyon + ilgili ortam
  değişkeninin güncellenmesi (aşağıdaki açık maddeye bakın).

## Açık operatör aksiyonu — durum güncellemesi (2026-10-10)

> **Production için kapandı:** `STORE_MODE=db` iken giriş yalnız veritabanına bakar; DB okunamazsa kaynak koddaki
> bootstrap parolalarına **düşülmez** (`authenticateUser`, 2026-10-02). Production'da `AUTH_HYPER_ADMIN_*` yoksa
> HYPER_ADMIN hesabı üretilmez. Aşağıdaki madde yalnız `json`/`memory` (yerel/demo) modları için geçerlidir.

## Açık operatör aksiyonu (json/memory modları için; bu turda YAPILMADI)

`src/lib/auth/users.ts` bootstrap hesapları için
`process.env.AUTH_* || "<sabit varsayılan>"` biçiminde **kod içi yedek
parolalar** taşıyor. Bunlar sunucu tarafındadır (istemci paketine girmez) ve
ortam değişkeni tanımlıysa kullanılmaz — ancak preview/production'da ilgili
`AUTH_*` değişkenleri TANIMLI DEĞİLSE bilinen varsayılanlar geçerli olur.

Gereken (kod değişikliği değil, ortam işi):
1. Test ve production ortamlarında tüm `AUTH_*` değişkenlerini güçlü,
   kasada saklanan değerlerle tanımlayın.
2. Giriş ekranından kaldırılmış olan eski demo parolalarını **rotasyona**
   sokun — git geçmişinde kalmışlardır, ekrandan silinmeleri rotasyon yerine
   geçmez.
3. Uzun vadede kod içi varsayılanların tamamen kaldırılması (fail-closed:
   değişken yoksa hesap oluşturulmaz) önerilir; bu ayrı bir karardır.
