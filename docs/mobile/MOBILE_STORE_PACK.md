# NeviiHub Mobil — Store Yayın Paketi (Faz 6)

Durum: dosya/runbook HAZIR. Fiilen yükleme (App Store Connect / Play Console
hesabı + gerçek build) insan adımıdır — bu belgede simüle edilmedi.

## 1. Uygulama kimliği (app.json denetimi)

- Ad: Nevii Hub · slug `nevii-hub-mobile` · scheme `neviihub://`
- iOS: `com.neviihub.mobile` · Android: `com.neviihub.mobile`
- EAS: `extra.eas.projectId` + `owner` tanımlı; profiller development/preview/
  production (`eas.json`); production `autoIncrement` açık.
- İkon: `assets/icon.png` (+ Android adaptive `adaptive-icon.png`); splash
  aynı ikon `contain` — gerçek marka asseti gelene kadar teknik-geçerli fallback.
- İzinler: fotoğraf galerisi (Türkçe açıklama metni; kamera/mikrofon KAPALI),
  bildirimler (çalışma-anı izni + Android kanalı "Ders hatırlatmaları").
- `ITSAppUsesNonExemptEncryption: false` (standart HTTPS dışı şifreleme yok).
- Deep-link: uygulama-içi (`neviihub://` + push `data.kind` eşleşmesi);
  universal-link/assetlinks v1 kapsamı DIŞI (ihtiyaç hâlinde backlog).

## 2. Kısa açıklama (her iki mağaza)

> NeviiHub: ders programı, yoklama, ödev ve ödemeleri tek uygulamadan takip edin.
> Öğrenci, veli, öğretmen ve yönetici için rol bazlı mobil portal.

## 3. Uzun açıklama (taslak)

NeviiHub, müzik ve sanat kurslarının günlük işleyişini mobile taşıyan kurum
uygulamasıdır. Hesabınız kurumunuz tarafından oluşturulur; giriş yaptığınızda
rolünüze uygun ekranları görürsünüz.

- **Öğrenciler:** ders programı, yoklama/devam raporu, ödevler ve teslimler,
  telafi talepleri, ödeme dökümü ve sözleşmeler.
- **Veliler:** birden fazla çocuğu tek hesapla takip, devam ve gelişim
  raporları, ödemeler, ders hatırlatma bildirimleri.
- **Öğretmenler:** günlük/haftalık program, öğrenciler, ödev ve materyal
  yönetimi, hakediş özeti.
- **Yöneticiler:** saha operasyonu (yoklama, kişiler, portal erişimi),
  tahsilat takibi, duyurular, onaylar ve gün özeti.

Bildirim tercihlerinizi uygulama içinden yönetirsiniz. Verileriniz kurum
yalıtımıyla korunur; kart bilgileriniz uygulamaya hiç girmez (ödeme kuruluşunun
güvenli sayfası kullanılır). Gizlilik Politikası ve Kullanım Koşulları uygulama
içinden (Hesabım → Gizlilik ve veri) her zaman erişilebilir.

## 4. Anahtar kelimeler (iOS, 100 karakter sınırı gözetilir)

`müzik kursu,ders programı,yoklama,ödev,veli bilgi,öğretmen,özel ders,telafi,ödeme takibi`

## 5. Sürüm notu (v0.1.0)

- Öğrenci/veli/öğretmen/yönetici rolleri için ilk mobil sürüm
- Ders programı, yoklama raporu, ödevler, ödemeler ve bildirimler
- Ders hatırlatma bildirimleri (tercihlere göre)
- Performans ve erişilebilirlik iyileştirmeleri

## 6. Ekran görüntüsü senaryosu (5–8 adet, TR)

1. Karşılama + giriş (marka başlığı görünür).
2. Veli ana sayfa: iki çocuk seçici + bugünkü dersler.
3. Ders programı gün görünümü (öğretmen filtreli).
4. Devam raporu (katılım özeti + ders kırılımı).
5. Ödeme dökümü (bakiye + makbuz satırları).
6. Bildirim merkezi (ders hatırlatması örneği).
7. Yönetici Özet (bugün kartları + dikkat listesi).
8. Hesabım → Gizlilik ve veri (yasal satırlar görünür).

Kural: gerçek öğrenci PII'si İÇERMEYEN demo verisiyle çekilir; saatler Türkçe
yerelle (`tr-TR`) gösterilir; light + dark temadan en az birer kare.

## 7. Review test hesapları (runbook)

Mağaza incelemesi için kurumun test ortamında (production verisi DEĞİL) hazır
hesaplar — kimlik bilgileri bu repoya YAZILMAZ, Console formlarına girilir:

| Rol | Kapsam | Beklenen ilk ekran |
|---|---|---|
| Veli (2 çocuk) | İki aktif öğrenci erişimi | Çocuk seçici → ana sayfa |
| Öğrenci (SELF) | Kendi ders/ödev/ödeme | Ana sayfa |
| Öğretmen | Program + öğrenciler | Bugün |
| Yönetici | Saha operasyonu | Özet |

Hazırlık: her hesaba bugüne 1 ders, 1 ödev, 1 ödeme kaydı; velinin iki
çocuğuna ayrı ders (push + çocuk-bağlamı testi için). İnceleme notuna eklenir:
"Hesaplar kurum tarafından oluşturulur; kayıt ekranı yoktur. Giriş: e-posta +
şifre. Hesap silme: Hesabım → Gizlilik ve veri → Hesap silme talebi."

## 8. Privacy / Data safety cevap matrisi

Veri akışı: `src/app/gizlilik/page.tsx` ile AYNI (tek kaynak metin odur).

| Mağaza sorusu | Cevap |
|---|---|
| Kişisel veri toplanır mı? | Evet — hesap + eğitim kayıtları (ad, iletişim, ders/yoklama/ödev/ödeme durumu) |
| Konum / kişiler / dosya erişimi? | Hayır (yalnız isteğe bağlı profil/ödev fotoğrafı galeri seçimi) |
| Kart/CVV/PAN? | HAYIR — hosted checkout; karta dokunulmaz, saklanmaz |
| Push token? | Evet — hatırlatma/bilgilendirme için; tercih kapatılabilir |
| Üçüncü tarafla paylaşım? | Barındırma + push altyapısı + ödeme kuruluşu (işlem için) + yasal zorunluluk |
| Veri silme? | Evet — uygulama-içi talep + herkese açık `/hesap-silme-talebi` sayfası |
| Çocuk verisi? | Evet (öğrenci) — kurum hesabıyla, veli kapsamı kendi çocuğuyla sınırlı |
| Şifreleme (ITSAppUsesNonExemptEncryption)? | `false` — standart HTTPS |

## 9. Kalan manuel adımlar (insan + console)

1. `eas build --platform ios --profile production` + `--platform android`.
2. App Store Connect: kimlik + ekran görüntüleri + inceleme notu + hesapları gir.
3. Play Console: Data safety formu (yukarıdaki matris) + hesap silme URL'i
   (`https://<production-domain>/hesap-silme-talebi`) + dahili test sürümü.
4. Kurum bilgileri netleşince `NEVII_ORG_NAME/ADDRESS/EMAIL` + yürürlük tarihi
   env'e girilir (kod değişikliği gerekmez).
