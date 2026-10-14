# Rapor portalı — öğretmen gelişim raporları + öğrenci değerlendirmesi (tasarım)

**Tarih:** 2026-10-14 · **Durum:** owner tasarımı onayladı (sohbet) · **Taban:** `origin/main` ca9acb6

## 1. Amaç ve kapsam

Mobil uygulama canlıya geçene kadar öğretmenler öğrencilerinin gelişim raporlarını telefondan, kısa bir linkle açılan sade bir web
formundan doldurur; yöneticiler tüm raporları tek ekrandan takip eder; öğrenciler/veliler ders ve öğretmen değerlendirmesini portal
şifresiyle veya yöneticinin gönderdiği kişiye özel linkle doldurur; her gönderimde yöneticilere bildirim gider.

Owner kararları (2026-10-14):
- Öğretmen girişi: **kendi şifresiyle** (mevcut öğretmen girişi).
- Rapor türleri: **ikisi de** — ders bazlı gelişim (`LessonAssessment`) + 4 haftalık genel (`PeriodicAssessment`).
- Öğrenci formu: **öğrenci dersi/öğretmeni değerlendirir** (`TeacherFeedback`), giriş: **portal şifresi VE kişiye özel link**.
- Yaklaşım A: aynı Next uygulaması içinde panel çerçevesiz, mobil öncelikli mini site.

Kapsam dışı (YAGNI): PDF çıktısı, öğretmene otomatik hatırlatma, çoklu dil, yeni rapor türü/kriter.

## 2. Bileşenler

### 2.1 Öğretmen sitesi — `/gelisim`
- **Yol ve giriş:** `src/app/gelisim/**`. `src/middleware.ts` matcher'ına `/gelisim` eklenir → oturumsuz istek
  `/login?next=/gelisim`'e gider (mevcut davranış). Sayfa `requireSessionContext()`; rol TEACHER (admin önizleme için
  SCHOOL_ADMIN/SUPER_ADMIN öğretmen seçmeden "yalnız görüntüleme" uyarısı görür; formu göndermez).
- **Kabuk:** panel kabuğu yok; kurum logosu/adı (dar okuma, logo yalnız burada), tek sütun, `max-w-md`, büyük dokunma alanları,
  açık/koyu tema mevcut tokenlarla. Başvuru sayfalarıyla (`/basvuru/[kurum]/*`) aynı görsel dil.
- **Ekranlar:**
  1. `/gelisim` — "Raporu bekleyenler" (ders gelişimi yazılmamış son 14 günün geçmiş dersleri + bekleyen 4 haftalık dönemler)
     ve öğrenci araması (yalnız öğretmenin kendi aktif öğrencileri). Her satır tek dokunuşla forma gider.
  2. `/gelisim/[studentId]` — öğrenci özeti + iki sekme: **Ders gelişimi** (son 10 geçmiş dersten seçim → form) ve
     **4 haftalık** (bekleyen dönem varsa form; yoksa "bekleyen dönem yok").
  3. Gönderim sonrası onay ekranı: "Rapor gönderildi" + "Bekleyenlere dön".
- **Form bileşeni (ortak):** `src/components/reports/lesson-assessment-mobile-form.tsx` ve
  `periodic-assessment-mobile-form.tsx` — 10 kriter için 1–5 segment düğme (mevcut ölçek), zorunlu notlar, isteğe bağlı alanlar
  katlanır bölümde; taslak `localStorage` (anahtar: tenant+teacher+student+lesson/dönem; gönderimde silinir; try/catch).
  Mevcut API'yi kullanır: `POST /api/v1/assessments` ve dönemsel karşılığı (yeni endpoint yok).
- **Öğretmen portalı "Gelişim" alanı:** `/ogretmen/ogrenciler/[studentId]` (#gelisim) ve `/ogretmen/degerlendirme` aynı ortak
  form bileşenine geçer → tek tasarım (kurumsal, minimal). Eski `lesson-assessment-form.tsx` kaldırılır (kullanan kalmazsa).

### 2.2 Öğrenci değerlendirmesi
- **Portal yolu:** `/degerlendir` → oturum varsa `/ogrenci/degerlendirme`'ye yönlendirir (mevcut sayfa, yeni sade kart tasarımı);
  yoksa `/login?next=/ogrenci/degerlendirme`. Matcher değişmez (`/degerlendir` herkese açık yönlendirme sayfası).
- **Kişiye özel link:** `/degerlendir/[kod]` (herkese açık, giriş yok).
  - Yeni model `FeedbackInvite` (eklemeli migration):
    `id, tenantId, studentId, tokenHash (unique), createdBy, createdAt, expiresAt, revokedAt?, completedTeacherIds Json (string[])`.
    `@@index([tenantId, studentId])`.
  - Kod: 32 bayt `crypto.randomBytes` → base64url; DB'de yalnız `sha256(kod)`. Geçerlilik 14 gün.
  - Sayfa: kodu çözer (hash ile tek satır), süresi/iptali kontrol eder; o öğrencinin **uygun öğretmenlerini** gösterir
    (aktif branş kayıtlarının öğretmenleri ∪ son 90 günde dersi olan öğretmenler — `/ogrenci/degerlendirme` ile aynı türetme,
    ortak saf fonksiyona çıkarılır). Değerlendirilmiş öğretmen "tamamlandı" görünür; hepsi bitince link "tamamlandı" sayfası
    gösterir ve yeni gönderim kabul etmez.
  - Gönderim: `POST /api/v1/feedback-invites/[kod]/submit` → yeni tool `submitTeacherFeedbackViaInviteTool`
    (oturum yok; tenant kodun satırından; `runWithTenantAsync`). `submitterRole: "STUDENT_LINK"`, `submittedBy: "invite:<inviteId>"`.
    Kayıt `submitTeacherFeedback` (aylık tekil kuralı aynen). Yarış: `completedTeacherIds`'e ekleme koşullu tek ifade
    (aynı öğretmene ikinci gönderim reddedilir).
  - Hız sınırı: `src/lib/rate-limit.ts` (IP + kod) — 10 istek / 10 dk.
  - Hatalar Türkçe ve nedenli: "Bu bağlantının süresi doldu, kurumdan yeni bağlantı isteyin." vb.
- **Yönetici link üretimi:** öğrenci detayında (ve Raporlar ekranında) "Değerlendirme linki oluştur" → link + "Kopyala" +
  "WhatsApp ile gönder" (`https://wa.me/?text=` — numara otomatik doldurulmaz; owner kuralı: mesaj gönderimi insan onaylı).
  Etkin link varsa yenisi eskisini iptal eder. Tool'lar: `createFeedbackInviteTool`, `revokeFeedbackInviteTool`
  (SCHOOL_ADMIN/SUPER_ADMIN, audit).
- **Düzeltme (mevcut hata):** `submitTeacherFeedbackSchema`'da `teacherId` yok; kartlar öğretmen başına görünse de kayıt hep
  `student.teacherId`'ye gider (çoklu branşta yanlış öğretmen). `teacherId` isteğe bağlı alan olarak eklenir, uygun öğretmenler
  kümesinde doğrulanır; yoksa eski davranış.

### 2.3 Yönetici takibi — `/panel/raporlar`
- Panel menüsüne "Raporlar" (SCHOOL_ADMIN/SUPER_ADMIN). Üç sekme: **Ders gelişimi**, **4 haftalık**, **Öğrenci değerlendirmeleri**.
- Filtre: öğretmen, öğrenci (arama), tarih aralığı (varsayılan son 30 gün); sayfalı (25). Satır → detay çekmecesi/sayfası
  (mevcut detay görünümleri yeniden kullanılır: `/panel/ogrenciler/[id]/gelisim`, `/panel/ogretmenler/[id]/geri-bildirim`).
- Üst kartlar: son 30 günde gönderilen rapor sayısı (tür bazında), "bekleyen" ders gelişimi sayısı (geçmiş 14 gün, raporsuz ders),
  aktif değerlendirme linki sayısı.
- Paylaşım kutusu: öğretmen linki `neviihub.com/gelisim` ve öğrenci linki `neviihub.com/degerlendir` için "Kopyala".
- Kurum seçici: tek kurum yazma kuralı aynen; birleşik görünümde salt okuma + `<KurumScopeNote>`.

### 2.4 Bildirim
- Yeni kategoriler: `lesson_assessment_submitted`, `periodic_assessment_submitted` (`notification-categories.ts` +
  `notification-href.ts` → `/panel/raporlar?sekme=...`). `teacher_feedback_submitted` mevcut; link gönderimi de bunu kullanır,
  href `/panel/raporlar?sekme=degerlendirme`.
- `createAssessmentTool`, `createPeriodicAssessmentTool`, davet gönderimi → `notifyAdmins(..., { dedupeKey: <kayıt id> })`;
  bildirim hatası kaydı geri almaz (mevcut desen: try/catch).

## 3. Veri erişimi ve kota (zorunlu)
- Yeni sayfalar ve tool'lar `readData()` / `readScopedData()` çağırmaz (kilit testi). Okumalar:
  - Öğretmenin öğrencileri ve bekleyen dersleri: mevcut `readLessonWindow(now−15g, now+1g)` (referans + pencere dersleri;
    sayfa öğretmene süzer). Yeni okuyucu YAZILMAZ (plan sırasında sadeleştirildi; ölçüm gerekirse sonra).
  - Tek öğrenci formu: `readStudentScope(studentId)` (mevcut).
  - Raporlar ekranı: yalnız rapor tablolarından sayfalı sorgu + id listesiyle öğretmen/öğrenci adları (`select` ad).
- `createAssessmentTool`: `readData()` → `readStudentById` + `readLessonById`; `teacherId` artık `lesson.teacherId`
  (çoklu branşta dersin öğretmeni). `createPeriodicAssessmentTool`: `readData()` → `readStudentScope`; TEACHER için
  `teacherId = ctx.teacherId` (kendi branşı), admin için mevcut davranış.
- Bekleyen hesapları sayfa başına tek sorgu; polling yok.

## 4. Güvenlik
- Kimlik/tenant yalnız oturumdan veya davet satırından; istemciden gelen `tenantId` yok.
- TEACHER yalnız `isOwnStudent` öğrencisi ve kendi dersi; davet linki yalnız o öğrencinin uygun öğretmenleri.
- Davet kodu düz metin saklanmaz; süre + iptal + tamamlanma kontrolleri sunucuda; hız sınırı; `noindex` meta.
- PII: davet sayfası öğrencinin yalnız adını ve öğretmen adlarını gösterir.

## 5. Hata yönetimi
Her kullanıcı hatası Türkçe, nedenli ve çözüm yollu (owner kuralı). İstemci fetch'leri `friendlyApiErrorMessage` + 401'de bir kez
`/api/v1/auth/refresh` ile yeniden dener (mevcut kural). Taslak kaydı başarısız olursa sessiz geçilir (form çalışır).

## 6. Test
- Tool testleri (json modu): öğretmen yalnız kendi öğrencisi/dersi; çoklu branşta `teacherId` doğru; bildirim çağrısı;
  davet: üret/iptal/süre doldu/tamamlandı/aynı öğretmene ikinci gönderim/başka kurum kodu; `teacherId` doğrulaması.
- Kilit testi: yeni sayfa/tool dosyalarında `readData()`/`readScopedData()` yok.
- `verify-db-slices` yeni okuyucu için db ≡ narrow.
- Kapı: typecheck → lint → test (taban karşılaştırmalı) → prisma validate → build. Kalanlar owner UAT adımı.

## 7. Teslim ve geri alma
- Migration (yalnız ekleme, `FeedbackInvite`) kod deploy'undan ÖNCE owner onayıyla canlıya (session pooler 5432).
- Geri alma: Vercel önceki deployment; tablo kalır (zararsız).
