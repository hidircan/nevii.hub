# Mobil tipografi — serif +2pt (Times görünümü)

- Tarih: 2026-09-20 · Branch: `release/mobile-review`.
- Kapsam: öğrenci / veli / öğretmen / yönetici / welcome / login dahil TÜM portallar.

## 1. Font eşlemesi

| Platform | Aile | Kaynak | Not |
|---|---|---|---|
| iOS | `Times New Roman` | yerleşik sistem fontu | asset yok, yükleme yok, flash yok |
| Android | `Tinos_400Regular` / `Tinos_700Bold` | `@expo-google-fonts/tinos` (Apache 2.0) | Times ile metrik-uyumlu; Expo Font ile yüklenir |
| Web | `Times New Roman, Times, serif` | CSS yığını | — |

Android'de sistem `serif` (Noto Serif) sessiz ikame olarak KULLANILMADI;
Tinos'un ilerleme genişlikleri Times ile aynı olduğu için iOS/Android
satır kırılmaları tutarlıdır. Yalnız 400 + 700 kesitleri gömüldü (italik
kullanım yok); 500→regular, 600→bold eşlenir.

## 2. Token ölçeği (eski → yeni, pt)

| Token | Eski | Yeni | Aile |
|---|---|---|---|
| display | 30/38 | 32/40 | Gloock (değişmedi) |
| screenTitle | 26/32 | 28/34 | sistem sans (değişmedi) |
| sectionTitle | 18/24 | 20/26 | sistem sans (değişmedi) |
| cardTitle | 16/22 | 18/24 | serifBold (içerik başlıkları) |
| body | 15/22 | 17/24 | serif |
| bodyStrong | 15/22 | 17/24 | serifBold |
| caption | 13/18 | 15/20 | serif |
| label | 11/14 | 13/16 | serifBold |

Bileşen ölçüleri: button 17/15, input 17, chip 15, badge 14, tab etiketi 15,
header rozeti 12. Başlık hiyerarşisi (Gloock + sans) korundu; Inter
referansı yok (test: `tokens.test.ts` "Inter referansı yok").

## 3. Taşma güvenliği (+2pt)

- Button md minHeight 44 korundu; etiket 2 satıra sarar.
- Sekme etiketleri 15pt serif (Times daraltması ~%5; 5 sekme sığar).
- Bildirim rozet kutusu 18→20pt.
- Liste/kart satırlarında `numberOfLines` kırpması mevcut (test kilitli).
- Serif-regular üzerine 600/700 override yasak (Android kesit güvenliği,
  test kilitli) — Bold token/aile kullanılır.
- Dynamic Type ölçeklemesi korunur (allowFontScaling varsayılanı).
- Finans/yoklama satırları tek-sütun akışta; hizalama bozulmaz.

## 4. Login etiketi

Geri dönüş butonu "Karşılama" → "Anasayfa"; erişilebilirlik etiketi
"Anasayfaya dön"; davranış aynı (`replace` ile /welcome). Test:
`welcome-flow.test.ts`.
