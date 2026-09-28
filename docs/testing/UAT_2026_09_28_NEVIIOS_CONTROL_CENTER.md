# UAT — NeviiOS Control Center (mobil/web yönetimi + control room redesign)

Tarih: 2026-09-28 · Dal: `test` · SHA: `e73aee9` · Domain: `test.neviihub.com`
Hesap: `info@neviihub.com` (HYPER_ADMIN) · Migration: YOK (şema değişmedi)

## Kapsam (çalışan)

- Kurum → Mobil sekmesinde kontrol matrisi (hak / ayar / efektif / istemci etkisi), tehlike uyarıları, push "hazır değil", uzaktan-değişen vs yeni-sürüm ayrımı.
- Expo uygulaması policy kapısı: bakım / güncelleme / kapalı-portal ekranları, tenant-anahtarlı önbellek, çıkışta temizlik.
- Panelde kurum karşılama şeridi, marka önizleme kartı, logo/metin doğrulaması.
- Homebrew Hacker teması (tercihsiz HYPER_ADMIN varsayılanı), Gloock menü markası, control-room özet sayfası.
- Ayrı `/platform/giris` kapısı, rol sınırları, `next` doğrulaması. `/login` ve şifre sıfırlama akışı değişmedi.

## Bilerek eksik / yapılmayan

- Gerçek cihaz testi, EAS build, mağaza yayını, APNs/FCM bağlantısı, gerçek push gönderimi YOK.
- `npm run build` ajan sandbox'ında OS engeline takılır (bilinen durum); doğrulama Vercel Preview build'iyle yapıldı (Ready).
- Tam web suiti: 3685 geçti, 7'si 4 dosyada BAŞARISIZ — dördü de temiz HEAD'de aynı şekilde kırık (önceden var, bu işle ilgili değil): `password-reset-ui`, `staff-onboarding` (yorum-içi literal bekleyen eskimiş içerik assertion'ları), `portal-access-management` (6-8, reset token), `seed-demo-schedule` (tsx script hatası).

## NET UAT listesi (12 adım)

1. Oturumsuz `test.neviihub.com/platform` adresine git → ayrı "NeviiOS Control Center" girişine düştüğünü, `/login` kurum ekranının değişmediğini gör.
2. Kapıdan `info@neviihub.com` ile giriş yap → control-room özeti (Sistem durumu / Kurumlar / Yayın ve operasyon / Paket ve modüller / Güvenlik ve denetim) ve koyu-yeşil Homebrew görünümü.
3. Sağ üst menüde Tema modunun "Hacker" seçili olduğunu gör; Açık'a geç, sayfayı yenile (korunur), Hacker'a dön.
4. Bir kurum → Mobil sekmesi: kontrol matrisinde paket hakkı/ayar/efektif ayrımını ve push satırındaki "hazır değil" notunu kontrol et.
5. Bakım mesajı yaz (kritik onay) → Denetim sekmesinde kaydın düştüğünü gör; mesajı boşalt (güvenli varsayılan).
6. Marka & Görünüm: önizleme kartının kayıtlı değerleri gösterdiğini, editörden değiştirmeden önizlemenin değişmediğini gör; `javascript:alert(1)` logoyu reddettiğini dene.
7. Karşılama metni kaydet → kurum paneli ana sayfasındaki karşılama şeridini gör (yapılandırılmamış kurumda şerit yoktur).
8. Kurum yöneticisi hesabıyla `/platform/giris`'ten giriş yap → kendi paneline gittiğini, platforma girmediğini gör.
9. `/login?next=https://evil.test` ile giriş yap → dış siteye çıkmadığını (panele düştüğünü) gör.
10. Minimum sürümü yükselt → `GET /api/v1/mobile/policy?platform=ios&appVersion=0.1.0` yanıtında `updateRequired: true` döndüğünü gör.
11. Kapıdaki "Şifre sıfırlama" bağlantısıyla sıfırlama e-postası al, yeni şifre belirle, giriş yap (SMTP akışı).
12. Oturumu kapat → `/platform` isteğinin yeniden kapıya düştüğünü gör.
