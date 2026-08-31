# VISION.md — Nevii Hub Uzun Vadeli Vizyon ve Kalite Standartları

CEO tarafından belirtildi (2026-08-31), bu projenin mihenk taşı olarak
kaydedildi. Her teknik karar bu standartlara karşı değerlendirilmeli.

## Vizyon

Nevii Hub kısa vadede müzik okulları için bir SaaS'tır; **uzun vadede çok
katmanlı bir AI-native ERP uygulaması ve ekosistemi** olacak şekilde
tasarlanıyor. Mimari kararlar ("Tool Layer her işlemin tek geçidi",
"AI için ayrı bir DB erişim yolu yok" — bkz. `ARCHITECTURE.md`) bu vizyonla
zaten uyumlu: yeni bir dikey (başka bir sektör, başka bir modül) eklendiğinde
aynı Tool Layer/Agent Runtime üzerinden büyüyebilecek şekilde kurulu.

## Öncelik sırası (CEO kararı, 2026-08-31, FINAL)

1. **Web sürümünü canlıya almak** (admin paneli — bkz.
   `PRODUCTION_READINESS.md`, `KNOWN_GAPS.md` §Kritik).
2. **Öğretmen-öğrenci mobil uygulamaları.**
3. **Yönetim (admin) mobil portalı.**

Bu sıralama `TASK_BOARD.md` ve gelecekteki her önceliklendirme kararında
esas alınır. `apps/mobile/*` (şu an paralel oturumun elinde, dokunulmuyor)
bu sıralamada 2. veya 3. sıraya denk düşüyor olabilir — hangisi olduğu
`apps/mobile/README.md` içeriğiyle netleştirilmeli (bu taramada açılmadı).

## Kalite standartları — asla ödün verilmez

- **Güvenlik önce gelir.** Tenant izolasyonu, RBAC, PII şifreleme, secret
  hijyeni — her değişiklikte `security-rbac-review` skill'i uygulanır.
- **Hız.** Kullanıcı bekletilmez; performans regresyonu sessizce kabul
  edilmez.
- **Hatasızlık.** "Test edilmedi" dürüstçe söylenir, asla "çalışıyor" gibi
  sunulmaz (kök talimat §2).
- **Veri güvenliği ve erişilebilirliği.** Veri kaybı riski (bkz. KNOWN_GAPS
  §1-2 — yerel-only veri) EN YÜKSEK öncelikli risk sınıfıdır, iş
  özelliklerinin önüne geçer.
- **Çökme direnci.** Production'da hata → kullanıcıya güvenli, anlaşılır
  Türkçe mesaj; sistem çökmesi/yarım işlem asla sessizce geçilmez.
- **Kurumsallık ve profesyonellik.** Canlıda müşteriye (okul yöneticisi,
  veli, öğretmen) mahçup olunmaz — her yeni özellik bu ölçüyle test edilir.
- **Maliyet-etkin mühendislik.** En ucuz/en verimli çözüm tercih edilir
  (örn. domain seçimi, altyapı planı) — ama güvenlik/kalite bu yüzden
  düşürülmez; ikisi çatıştığında CEO'ya seçenekli sunulur (bkz. kök
  talimat §4, seçenek tablosu formatı).

## Domain durumu (2026-08-31)

`neviihub.com`, CEO tarafından Cloudflare Registrar üzerinden **2
yıllığına** satın alındı (Vercel üzerinden değil). Domain henüz Vercel
projesine/DNS'e **bağlanmadı** — bu, güvenli canlıya alma sırasının
(`TASK_BOARD.md` §En Yüksek Öncelik) 8. adımı, veri taşıma ve migration
doğrulamasından SONRA yapılacak.

## Marka ↔ müşteri entegrasyonu (planlanan, henüz uygulanmadı)

Canlıya geçince Nilüfer Acar'ın kendi web sitesine bir "Giriş Yap" butonu
eklenip Nevii Hub'a yönlendirecek. Bu, domain/DNS/CORS/redirect kurulumu
gerektirir — go-live sonrası görev, bkz. `TASK_BOARD.md`.
