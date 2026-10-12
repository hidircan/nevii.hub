# Mobil tipografi — Noto Serif gövde +2pt

- Tarih: 2026-09-20 · Branch: `release/mobile-review`.
- Kapsam: öğrenci / veli / öğretmen / yönetici / welcome / login dahil TÜM portallar.
- Karar: Times New Roman İPTAL — gövde/UI fontu Noto Serif; Inter yok.

## 1. Font eşlemesi

| Platform | Aile | Kaynak | Not |
|---|---|---|---|
| iOS | Noto Serif (400/500/600/700) | `@expo-google-fonts/noto-serif` (OFL) | gömülü, Android ile AYNI dosyalar |
| Android | Noto Serif (400/500/600/700) | aynı paket | Tinos/Times fallback YOK |
| Web | `Noto Serif, Georgia, serif` | CSS yığını | — |

Yüklenen kesitler (~2.1MB toplam): Regular 400, Medium 500, SemiBold 600,
Bold 700. İtalik gömülmedi (kullanım yok). Kalınlık dosya adıyla seçilir;
splash akışı korunur (bloklama yok). Gloock yalnız marka + display
(`typography.display`, brand-mark, AppHeader başlığı); ekran/section
başlıkları sistem sans'ı.

## 2. Token ölçeği (+2pt korunur)

| Token | Ölçü (pt) | Aile |
|---|---|---|
| display | 32/40 | Gloock |
| screenTitle | 28/34 | sistem sans |
| sectionTitle | 20/26 | sistem sans |
| cardTitle | 18/24 | Noto Serif SemiBold |
| body | 17/24 | Noto Serif Regular |
| bodyStrong | 17/24 | Noto Serif SemiBold |
| caption | 15/20 | Noto Serif Medium |
| label | 13/16 | Noto Serif Bold |

Bileşenler: button 17/15 (semibold), input 17, chip 15 (semibold),
badge 14 (bold), tab etiketi 15 (2 satıra sarar), header rozeti 12.

## 3. Ölçülen etiket genişlikleri (Noto Serif 500, 15pt)

Öğrencilerim 96.7 · Ödemeler 71.6 · Ana Sayfa 72.8 · Çocuğum 67.6 ·
Gelişim 55.0 · Ödevler 57.9 · Hakediş 58.9 · İşlemler 60.1 · Hesabım 64.3 (px).
Sekme genişlikleri: 375pt/5=75 · 360/5=72 · 320/5=64 (5 sekme);
375/4≈94 · 360/4=90 (4 sekme, öğretmen). Dar ekranda etiket 2 satıra
sarar (ortak `TabBarLabel`, boyut düşürülmedi); tam metin a11y'de korunur.

## 4. Görsel UAT checklist (cihaz)

- [ ] Küçük iPhone (SE 375pt): 4 portal tab bar'ı (sarma/ellipsis yok mu)
- [ ] Büyük font (Dynamic Type XL): liste/kart/button sarma, hedef ≥44pt
- [ ] Uzun Türkçe metin: yoklama rozetleri, sözleşme satırları, bildirimler
- [ ] Login: "Anasayfa" geri butonu + klavye açık hâlde taşma
- [ ] Yoğun ekranlar: ödeme ledger ay özeti, devam raporu satırları, haftalık plan
- [ ] Light + dark tema: serif okunabilirliği, rozet kontrastı
- [ ] Android: Noto Serif yüklendi (sistem serif'ine düşme yok), splash flash yok
- [ ] iOS: aynı aile render'ı, Medium/SemiBold/Bold ayrımı belirgin
