# Mobil UAT Checklist (Final)

Ortam: EAS preview build (iOS + Android fiziksel cihaz) + staging backend.
Önkoşul: `npm run preflight:push` hatasız.

## Cihaz matrisi

- [ ] iPhone SE (320pt) — tab bar, dialog, uzun adlar, ledger satırları taşmıyor
- [ ] Standart iPhone — light + dark
- [ ] Android orta ekran — system back her ekranda güvenli
- [ ] Büyük font ölçeği (en büyük 2 kademe) — kart/dialog taşmıyor
- [ ] Screen reader (VoiceOver/TalkBack) — bildirim zili, geri, sekmeler etiketli

## Persona turları

### Veli (2 aktif çocuk)

- [ ] Çocuk seçici → her çocuğun program/ödev/ödeme doğru
- [ ] Ödev detayı: teslim/yükleme CTA'sı YOK (salt-görünüm)
- [ ] Çocuk değiştir → eski çocuğun verisi 1 kare bile görünmüyor
- [ ] Push: iki çocuğa ayrı hatırlatma; dokunuş doğru çocuğu açıyor
- [ ] Revoke (admin panelden) → liste tazeleniyor, push kesiliyor, cache sızmıyor

### Öğrenci (SELF)

- [ ] Ödev teslim + dosya yükleme çalışıyor
- [ ] Devam raporu + ödeme ledger web ile aynı toplamlar
- [ ] Push 1g/1s/15dk tercihlere uyuyor

### Öğretmen

- [ ] Program, öğrenciler, ödev, materyal, müsaitlik, performans, hakediş açılıyor
- [ ] Yoklama yazma CTA'sı YOK (salt-okunur)
- [ ] Push 1s/15dk geliyor, 1g GELMİYOR

### Yönetici

- [ ] Özet: sayılar + dikkat listesi + drill-down
- [ ] Yoklama: 5 bayrak + gerekçe (Telafi/İşlendi) + statü-değişim onayı + iptal
- [ ] Aynı dersi web + mobilde değiştir → onay akışı ezilmeyi önlüyor
- [ ] Kişiler: arama + sayfalama + detay + tap-to-call
- [ ] Portal erişimi: davet/iptal/yeniden-açma + audit
- [ ] Finans özeti + tahsilat vaka ilerletme + hata görünürlüğü
- [ ] Duyuru: hedef + önizleme + yayın; alıcı sayısı doğru
- [ ] Telafi/izin/müsaitlik/silme onayları: karar + not + stale CONFLICT
- [ ] Raporlar: ödev + performans + katalog (web-only notu görünür)
- [ ] Hesabım: bildirim + e-posta + şifre + çıkış

## Offline + tazelik

- [ ] Uçak modu: program/ödev/devam/ödeme/telafi/bildirim cache'ten açılıyor + "Son güncelleme" rozeti
- [ ] Uçak modu: yoklama/ödeme yazma HATA gösteriyor (sahte başarı YOK, kuyruk YOK)
- [ ] Ağ dönüşü: foreground + pull-to-refresh tazeleme
- [ ] Foreground push: görünür ekran dokunuşsuz tazeleniyor
- [ ] Logout: cache + seçim + token temizliği (farklı kullanıcıda sızıntı YOK)

## Hukuk + silme

- [ ] /gizlilik, /kullanim-kosullari, /hesap-silme-talebi oturumsuz açılıyor
- [ ] Hesabım → Gizlilik ve veri: 3 satır canlı (URL + ekran)
- [ ] Silme talebi: onay + gönderim + durum + geri çekme
- [ ] Admin silme-talepleri: inceleme + karar akışı

## Push (Faz 5 runbook §7 tam tur)

- [ ] iOS/Android × foreground/background/killed
- [ ] Killed dokunuşu doğru hedef + (velide) doğru çocuk
- [ ] Ders iptali/değişikliği/telafi bildirimleri
- [ ] Logout sonrası bildirim YOK; tercih-kapalı kategori YOK

## Çıkış kriteri

- [ ] Tüm kutular işaretli + bulunan hata kaydı (dosya/satır/ekran) rapora işli
- [ ] Store paketi (MOBILE_STORE_PACK.md §9) insan adımları planlandı
