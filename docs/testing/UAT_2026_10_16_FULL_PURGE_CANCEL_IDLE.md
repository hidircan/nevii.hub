# UAT 2026-10-16 — Tam silme (finans + hakediş), iptal emekliliği, hareketsiz oturum

Üç PR, migration YOK (şema değişmedi). Sıra serbest; dosya çakışması yok.

## 1. Tam silme ("Yanlış oluşturuldu — bağlı finansallarıyla kalıcı sil") — `feat/full-purge-financial`

**Kök neden (canlı `ba031de`):** "her şeyi sil" plancısı (`src/lib/person-purge.ts`) öğrenciyi, derslerinden biri
başka öğretmenin iptal edilmemiş hakedişine giriyorsa; öğretmeni ise HER ders/seri/telafi, HER öğrenci bağı
(silinmiş dahil) ve HER değerlendirme/ödev kaydı için ENGELLİYOR, "başka ekrana git" diyordu. `Student.teacherId`
zorunlu FK olduğu için öğretmenin öğrenci bağı bu akışta hiç çözülemiyordu. Yetki/deploy/mod sorunu değil.

**Kanıt (izole yerel PostgreSQL, db modu, gerçek FK):** sentetik öğrenci (tahsilat ₺3.000 + borç ₺2.500, 3 ders,
yoklama, telafi, bekleyen hakediş ₺1.000 ve ödenmiş hakediş ₺800 satırları) → tam silindi; bekleyen hakediş
₺1.000 → ₺600 (yalnız diğer öğrencinin satırı kaldı, sürüm +1), ödenmiş hakediş ₺800 değişmedi, satırdaki ad
"Silinmiş öğrenci (Ö-UAT1)". Sentetik öğretmen (öğrencisi, dersi, yoklaması, telafisi, derse bağlı ₺500 tahsilat,
ödenmiş hakediş ₺900): "Dersleri sil" + hedef öğretmen → öğretmen/ders/yoklama/telafi/hakediş silindi, ₺500 tahsilat
öğrencide kaldı (ders bağı kalktı), öğrenci hedef öğretmene geçti. Grup dersli öğretmende "sil" engellendi,
"devret" ile ders+telafi+öğrenci hedefe geçti, yoklama kaldı. Kaynağı başka öğretmende olup yalnız planlanan telafi
dersi silinen öğretmende olan talep SİLİNMEDİ: planı kalktı, talep `pending` (Telafi Merkezi'nde açık), changeLog
`plan_deleted`, kaynak ders yerinde — kaynak dersi "Telafi" işaretli ama talepsiz bırakmaz.

Arayüz (yerel json, tarayıcıda): Kaldırılanlar → Kalıcı sil → tam silme: hedefsiz engel + çözüm; öğretmen seçilince
önizleme yenilendi, engel kalktı; "tümünü seç" işaretlenmeden gönder pasif; silme sonrası öğretmen ve dersi yok,
öğrenci seçilen öğretmende.

**Owner UAT (canlıda, önce SENTETİK kayıtla):**
1. Test öğrencisi aç → ders + yoklama + Telafi + borç + tahsilat ekle → öğretmenin o ay için hakediş kaydı oluştur
   (ödenmemiş bırak). Öğrenciyi sil (Silinenler'e taşı).
2. Silinenler → "Kalıcı sil" → "Yanlış oluşturuldu — bağlı finansallarıyla kalıcı sil". Önizlemede 7 grup:
   Ders programı / Yoklama ve telafi / Borç-tahsilat (tutarlar) / Hakediş ("Yeniden hesaplanacak: ₺X → ₺Y") / …
3. "Seçili kişiye ait tüm silinebilir kayıtları seç" + finans kutusu + ad + kritik şifre → sil. Hakedişler'de
   o kayıt yeni tutarla, diğer öğrencilerin satırları aynı.
4. Test öğretmeni: öğrencisi + dersi olan → Kaldırılanlar → Kalıcı sil → tam silme. Hedef seçmeden engel; hedef seç
   → "Dersleri sil" veya "devret" → sil. Öğrencinin öğretmeni hedef olmalı.
5. Gerçek kişi için: önce yalnız önizlemeyi açıp ekran görüntüsünü paylaşın; silme ayrı, açık onayla.

Somut istisna (kalıyor): ödeme sağlayıcısında tahsil edilmiş online ödeme — önizlemede tutar + "sağlayıcıdan iade
edin" gösterilir. Elle girilen tahsilat bu istisnaya girmez. Harici dosya deposu yalnız duyuru eklerinde kullanılıyor;
kişi evrak/fotoğrafları DB satırında — silme DB transaction'ı ile tamamlanır (outbox gerekmez). Silinen kişi satırı
kalmadığı için tahakkuk cron'u ona borç/ders üretemez.

## 2. Telafi → iptal → yeniden telafi (#46) — db yolu doğrulandı
İzole PostgreSQL'de: Telafi → Geri al → Telafi = TEK talep, `pending` (yeniden açıldı), Telafi Merkezi'nde 1 açık
talep, 1 yoklama satırı; aktif telafiyle silme açıklamalı ret ("Telafi Merkezi'nde … önce iptal edin"); iptal sonrası
kritik silme ders + yoklama + talebi birlikte kaldırdı. Canlı örnek kayıt için salt-okunur SQL:
`UAT_2026_10_15_MAKEUP_DELETE.md` (bu oturumda da canlı DB erişimi yoktu). Beklenen dışı sonuç → silmeyin, paylaşın.

## 3. İptal — `fix/retire-lesson-cancel-mobile`
- Mobil admin ders detayında "İptal et" düğmesi/onayı kaldırıldı; eski iptal kayıtları "Bu ders iptal edilmiş".
- `POST /api/v1/lessons/:id/cancel` yazmaz; eski derlemeye Türkçe yönlendirme (409 — mobil istemci 403'te sunucu mesajı yerine genel "yetkiniz yok" gösteriyor). Mağazada herkese açık eski
  sürüm yok → minVersion DEĞİŞMEDİ.
- Mobil derleme: **1.0.1 (versionCode 5)**, EAS build `e04760ec-b973-47af-80e3-a47b233f1753` (mağazaya gönderilmedi).
- #50 takip: yalnız iptal dersi + ödemesi olan gün "Bu gün ders yok" yerine "dersi iptal edilmiş; ödeme kaydı aşağıda";
  programdaki derin bağlantı iptal derste Ödemeler sekmesi ve Telafi Merkezi bağlantısı verir.

## 4. Hareketsiz oturum — `feat/idle-session`
Mimari: özel JWT (erişim 15 dk / yenileme 7 gün) + `UserSession`; Supabase Auth değil.
- 30 dk gerçek etkileşim yok → çıkış; son 2 dk uyarı + "Oturumu sürdür". Sunucu JWT `act` ile ayrıca reddeder
  (yalnız tarayıcı girişinde gömülür, her yolda uygulanır; mobil token'da yok).
- Yenileme/yoklama/API yanıtı etkinlik sayılmaz; etkinlik sunucuya en fazla 5 dk'da bir (mevcut refresh uç noktası).
- Gizli sekmede ve 5 dk etkileşimsiz: oturum denetimi ve program yenilemesi istek atmaz; dönüşte tek yenileme.
- Süre: `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` (varsayılan 30). Yerelde 2,5 dk ile tarayıcıda denendi: uyarı ~30 sn
  kala çıktı, "Oturumu sürdür" tek istekle oturumu sürdürdü, süre dolunca `/login?oturum=zaman-asimi`, `/auth/me` 401.
- İstek sayısı (tahmini, ölçüm değil): açık ama dokunulmayan sekme başına önce saatte 12 oturum denetimi + öğretmen/
  öğrenci programında 12 tam sayfa yenilemesi (görünürken); şimdi 5 dk sonra 0, 30 dk sonra oturum kapalı. Aktif
  kullanıcıda ≤12/saat hafif etkinlik isteği (zaten 15 dk'da bir olan token yenilemesiyle aynı uç nokta). Canlı
  transfer ölçümü deploy sonrası Vercel runtime loglarından yapılmalı. Oturumdan çıkarma tek başına egress çözümü
  değildir; sunucu cron'ları (tahakkuk, saklama) bundan etkilenmez.

Owner UAT: iki sekme aç, 28 dk dokunma → iki sekmede uyarı; birinde "Oturumu sürdür" → diğeri ≤15 sn'de kapanır.
Bilgisayarı uyut-uyandır (>30 dk) → giriş ekranı. Mobil uygulamada 30 dk+ arka plan → oturum açık kalmalı.
