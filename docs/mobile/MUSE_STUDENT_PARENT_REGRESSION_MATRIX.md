# Student/Guardian Regression Matrix

Branch: `feature/mobile-student-parent-p0`. Otomasyon = mobil vitest
(node env — saf fonksiyon + statik dosya taraması; RN renderer yok).
Cihaz UAT ID'leri `MOBILE_DEVICE_UAT_RUNBOOK.md`'ye bağlıdır.
Durum: `Geçti` (vitest 18/18 dosya, 126/126 test) / `UAT bekliyor` (cihaz).

| Persona | Ekran / Akış | Ön Koşul | Aksiyon | Beklenen Sonuç | Veri Kapsamı | Otomasyon Testi | Cihaz UAT | Durum |
|---|---|---|---|---|---|---|---|---|
| Student | Ana sayfa | SELF oturumu | Aç | Sıradaki ders, ödev sayısı, bakiye özeti | schedule, homework, balance | yok (UAT) | ST-IOS-01/02 | UAT bekliyor |
| Student | Program | SELF oturumu | Hafta gezinme | Gün grupları, BUGÜN rozeti, boş hafta empty | schedule, attendance-calendar | date/homework-bucket unit | ST-IOS-03 | UAT bekliyor |
| Student | Ders detayı | Programda ders | Karta dokun | Öğretmen/saat/oda (gelen bilgi) | schedule | route-integrity | ST-IOS-04 | UAT bekliyor |
| Student | Ödev | SELF oturumu | Filtre + detay | Durum, son teslim, suçlayıcı-olmayan dil | homework | homework-bucket unit | ST-IOS-05 | UAT bekliyor |
| Student | Öğrenci teslim | PENDING ödev | Not + Teslim et | "Teslim gönderildi." / hata + retry | homework submit | guardian-homework-lock (kapı kilidi) | ST-IOS-06 | Geçti (kilit) + UAT bekliyor |
| Student | Payment read-only | Oturum | Özet → detay → makbuz | Salt-görünüm; başlatma butonu yok | balance, receipt | student-scope-guard (finans yok) | ST-IOS-07 | Geçti (kilit) + UAT bekliyor |
| Student | Notifications | Oturum | Liste → sayfa → okundu | Gruplar, boş/hata state | notifications | group-by-day unit | ST-IOS-08 | UAT bekliyor |
| Student | Logout | Oturum | Çıkış + onayla | Login; geri dönüş yok | session | yok (UAT) | ST-IOS-09 | UAT bekliyor |
| Student | Network error | Uçak modu | Refresh | Bağlantı metni + retry, beyaz ekran yok | — | api-error-message (metin) | ST-IOS-10 / FT-01 | Geçti (metin) + UAT bekliyor |
| Student | 401 | Süresi dolmuş oturum | Korumalı ekran | "Oturumunuz sona erdi." → login | — | api-error-message (metin) | FT-03 | Geçti (metin) + UAT bekliyor |
| Student | 403 | Yetkisiz kayıt | Ekranı aç | "Erişim yetkiniz yok." nötr ton | — | isAccessScopeError | FT-04 | Geçti (metin) + UAT bekliyor |
| Student | Empty state | Boş liste | Ekranı aç | Anlaşılır empty state | — | yok (UAT) | ST-IOS-03/08 | UAT bekliyor |
| Student | Refresh | Liste açık | Pull-to-refresh | Tazeleme, duplicate request yok | — | yok (UAT) | ST-IOS-01 | UAT bekliyor |
| Guardian | Parent ana sayfa | Guardian oturumu | Aç | Özetler + aktif öğrenci bağlamı | ctx.studentId | parent-scope-guard | GD-IOS-01 | Geçti (kilit) + UAT bekliyor |
| Guardian | Child context | Guardian oturumu | Çocuğum'u aç | Ad/branş/öğretmen/paket; PII yok; selector yok | StudentProfile | child-context-view + parent-scope-guard | GD-IOS-02 | Geçti |
| Guardian | Child schedule | Bağlam var | Hafta gezinme | Read-only program; operasyon butonu yok | schedule | parent-scope-guard (teacher-op yok) | GD-IOS-03 | Geçti (kilit) + UAT bekliyor |
| Guardian | Child lesson detail | Derste kayıt | Karta dokun | Salt-görünüm detay | schedule | parent-scope-guard | GD-IOS-04 | Geçti (kilit) + UAT bekliyor |
| Guardian | Homework read-only | Oturum | Ödev detayı | Salt-görünüm mesajı; Teslim Et yok; upload yok | homework | guardian-homework-lock | GD-IOS-05 | Geçti |
| Guardian | Attendance read-only | Oturum | Yoklama özeti | Oran + kartlar; mutation CTA yok | attendance-summary | attendance-view + parent-scope-guard | GD-IOS-06 | Geçti |
| Guardian | Payment read-only | Oturum | Özet → detay | Salt-görünüm; finans akışı yok | balance, receipt | parent-scope-guard (hedef kilidi) | GD-IOS-07 | Geçti (kilit) + UAT bekliyor |
| Guardian | Telafiler read-only | Oturum | Telafiler ekranı | Liste + TR tarih; empty "Gösterilecek telafi..."; mutation CTA yok; fake kayıt yok | makeup | makeup-view + parent-scope-guard | GD-IOS-13 | Geçti |
| Guardian | Receipt read-only | Ödeme detayı | Makbuz bölümü | eligible:false → ineligibleReason; 403/404 nötr; fake PDF yok | receipt | service-contracts | GD-IOS-07 | Geçti (kilit) + UAT bekliyor |
| Guardian | Absence fallback | — | (çağrı yok) | Kırık absence çağrısı/CTA yok; gerekiyorsa FEATURE_UNAVAILABLE | — | service-contracts | — | Geçti |
| Guardian | Notifications | Oturum | Liste/okundu/boş/hata | ST ile aynı davranış | notifications | group-by-day unit | GD-IOS-08 | UAT bekliyor |
| Guardian | Logout | Oturum | Çıkış + onayla | Login; geri dönüş yok | session | yok (UAT) | GD-IOS-09 | UAT bekliyor |
| Guardian | Network error | Uçak modu | Refresh | Bağlantı metni + retry | — | api-error-message (metin) | FT-01 | Geçti (metin) + UAT bekliyor |
| Guardian | 401 | Süresi dolmuş oturum | Korumalı ekran | "Oturumunuz sona erdi." → login | — | api-error-message (metin) | FT-03 | Geçti (metin) + UAT bekliyor |
| Guardian | 403 | Yetkisiz kayıt | Ekranı aç | "Erişim yetkiniz yok." nötr ton | — | isAccessScopeError | FT-04 | Geçti (metin) + UAT bekliyor |
| Guardian | Empty state | Boş liste | Ekranı aç | Anlaşılır empty state | — | attendance-view (hasRecords) | GD-IOS-06 | Geçti (kısmi) + UAT bekliyor |
| Guardian | Missing child context | İlişkisiz guardian | Giriş | "Öğrenci bilgisi bulunamadı"; fake child yok | — | child-context-view (null) + parent-scope-guard | GD-IOS-10 | Geçti (kısmi) + UAT bekliyor |
| Guardian | Relationship scope leak | Guardian oturumu | Gözlem | Başka öğrenci verisi görünmez | ctx.studentId | parent-scope-guard (ID tahmini yok) | GD-IOS-11 / FT-12 | Geçti (kilit) + UAT bekliyor |
| Guardian | Teacher/admin action yok | Oturum | Tüm ekranlar | Operasyon CTA'sı görünmez | — | parent-scope-guard (teacher-op yok) | GD-IOS-03/04/06 | Geçti (kilit) + UAT bekliyor |

Notlar:

- `yok (UAT)` = RN renderer altyapısı olmadığı için otomasyonu yok;
  davranış cihaz UAT'sinde doğrulanacak. Sahte otomasyon iddiası yok.
- `Geçti (kilit)` = davranış birim testi değil, statik güvenlik kilidi
  (dosya taraması) ile korunuyor; cihaz doğrulaması ayrıca gerekli.
- Fake test hesabı/parola/token bu tabloda YOK (runbook'ta da takma ad).
