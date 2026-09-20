# Mobil ↔ Web Özellik Paritesi

Bu dosya, Nevii Hub web uygulamasının `/panel/**` (yönetici), `/ogretmen/**`,
`/veli/**`, `/ogrenci/**` route ağaçları taranarak çıkarılan web↔mobil özellik
envanteridir. Kaynak doğruluk web'dir — mobil, web panelinin daraltılmış
kopyası değildir, ama hiçbir günlük iş akışı "webde var, mobilde hiç yok"
halinde bırakılmaz.

Durum kodları:
- ✅ **Tamamlandı** — gerçek API ile çalışıyor
- 🟡 **UI var, API eksikti** → bu iterasyonda tamamlandı
- 🆕 **Bu iterasyonda eklendi** (ekran + gerekiyorsa endpoint)
- 🔗 **Webde aç** — ileri seviye/nadir kullanılan yönetim özelliği; mobilde özet/liste var, tam CRUD web'de kalıyor (görev metninde açıkça izin verilen kapsam)
- ⛔ **Uygulamada yok** — web tarafında da karşılığı olmayan bir kavram (spec bunu varsaymış ama gerçek değil); not düşüldü, uydurulmadı

## Yönetici (SUPER_ADMIN / SCHOOL_ADMIN)

### Operasyon

| Web sayfası | Mobil karşılığı | Durum |
|---|---|---|
| `panel/page.tsx` (dashboard) | `(admin)/ozet` | ✅ |
| `panel/program/page.tsx` (haftalık grid) | `(admin)/program` (gün bazlı liste) | ✅ (bilinçli basitleştirme — grid yerine gün listesi, task metninde onaylı) |
| `panel/yoklama/page.tsx` (yoklama takvimi) | `(admin)/islemler/yoklama` | 🆕 öğrenci arama + günlük/haftalık liste + geçmiş |
| `panel/ders-duzeltme/page.tsx` (öğretmen/şube/oda devri) | `(admin)/program/[lessonId]` içine devir formu | ✅ **bu iterasyonda eklendi** — teacher/branch/room seçici + özet `ConfirmDialog`, `changeLessonTeacherOrBranchTool`'a yeni ince `POST /api/v1/lessons/:lessonId/reassign` route'uyla bağlandı (tool zaten hazırdı, yalnız REST sarmalayıcı yoktu). Bilinçli sadeleştirme: yalnız `scope:"single"` (tek ders) destekleniyor — mobil `Lesson` tipi `seriesId`/`branchId`/`roomId` taşımadığı için "bundan sonrası"/"tüm seri" devri mobilde yok; bu, schedule/lessons yanıtını genişletmeyi gerektiren ayrı bir sonraki adım. Mevcut `lesson-reassignment.test.ts`+`lesson-availability-override.test.ts` (10/10) regresyonsuz geçiyor |
| Ders yeniden atama (öğretmen/şube/oda devri, `c0b5e12`/`85e54ae`) | — | ✅ **web tarafı bu iterasyonda tamamlandı** (ayrı bir turda, build blocker düzeltmesi olarak) — `LessonReassignmentModal`/`actionChangeLessonTeacherOrBranch`/`changeLessonTeacherOrBranchTool`/`reassignLessonTeacherOrBranchLive` (json/memory/db, 3 mod paritesi) + `Lesson.availabilityOverride`/`OVERRIDABLE_SLOT_CODES` hunk-level taşındı; `lesson-reassignment.test.ts`+`lesson-availability-override.test.ts` (10/10) çalışıyor. Bilinçli olarak taşınmayan TEK parça: main'deki `notifyLessonReassigned` bildirimi — `manager-notifications.ts`/`notification-dispatch.ts` adlı, bu worktree'de bulunmayan ayrı ve geniş bir bildirim altyapısına bağımlı; atama işleminin kendisi (çakışma kontrolü, veri yazımı, audit) buna bağımlı değil ve tam çalışır durumda. Mobilde karşılığı hâlâ yok — sonraki adım: admin mobiline `(admin)/kisiler/ogretmen/[id]` veya Program ekranından erişilen bir "ders yeniden ata" formu eklemek, `POST` ile `changeLessonTeacherOrBranchTool`'u doğrudan çağırarak (yeni endpoint gerekmez, tool zaten hazır) |
| `panel/ogrenciler/page.tsx` + `[studentId]` + `yeni` | `(admin)/kisiler` (segment: Öğrenciler) + detay | ✅ liste/detay; öğrenci ekleme formu 🔗 webde (kimlik/paket/ödeme alanları çok, mobilde form riskli) |
| `panel/ogretmenler/page.tsx` + `[teacherId]` + `[teacherId]/performans` | `(admin)/kisiler` (segment: Öğretmenler) + detay + `[id]/performans` | ✅ liste/detay/performans; **musaitlik** 🆕, **geri-bildirim** 🆕, **hakediş** 🆕, **Teacher Performance v2 detayı** ✅ (bkz. aşağıdaki ayrı satır) alt sekmeleri/ekranları eklendi |
| `panel/ogretmenler/[teacherId]/performans/page.tsx` (Teacher Performance v2 — `d62bb21`) | `(admin)/kisiler/ogretmen/[id]/performans` | ✅ **tamamlandı bu iterasyonda** — toplam skor, öğretmen yoklama oranı, veli/öğrenci geri bildirim ortalaması, görev tamamlama/zamanında tamamlama oranı, ders sonrası ödev verme oranı, yetersiz-veri durumu; öğretmen detayında özet kart + link (`GET /api/v1/teachers/:id/performance-v2`, doğrudan Bearer-uyumlu, adaptasyonsuz) |
| `panel/subeler/page.tsx`, `odalar/page.tsx`, `enstrumanlar/page.tsx` | `(admin)/islemler/katalog` | 🆕 salt-okunur liste; ekleme/arşivleme 🔗 webde (nadir kurulum işi) |
| `panel/telafi/page.tsx` (telafi merkezi) | `(admin)/islemler/telafi` | 🆕 liste + onayla/iptal aksiyonu |

### Eğitim

| Web sayfası | Mobil karşılığı | Durum |
|---|---|---|
| `panel/odev-raporu/page.tsx` | `(admin)/islemler/odev-raporu` | ✅ **bu iterasyonda tamamlandı** — "Toplu rapor yakında" placeholder'ı kaldırıldı; yeni `listHomeworkReportTool` (SCHOOL_ADMIN/SUPER_ADMIN, tek `readData()`, N+1 yok) + `GET /api/v1/homework/report`; web'deki aynı 4 sayaç (toplam/teslim edilen/bekleyen/gecikmiş) + öğretmen bazlı kırılım, uydurma metrik yok. `homework-report.test.ts` (2/2) |
| Admin-wide müfredat sayfası | — | ⛔ web'de de yok — müfredat yalnız öğrenci detayında görülüyor, mobil aynı deseni izliyor (Kişiler > Öğrenci detay) |
| `panel/evraklar/page.tsx` + `[documentId]` | `(admin)/kisiler/ogrenci/[id]` içine evrak listesi | 🆕 öğrencinin evrakları salt-okunur; şablon yönetimi/imza akışı 🔗 webde — sonraki adım: mobilde yalnız "webde imzala" linki yeterli, imza akışı (KVKK/hukuki bağlayıcılık) mobilde başlatılmamalı |

### İletişim ve iş akışı

| Web sayfası | Mobil karşılığı | Durum |
|---|---|---|
| `panel/duyurular/page.tsx` | `(admin)/islemler/duyurular` | ✅ liste + yeni duyuru (Tümü/Öğretmenler/Veliler/Öğrenciler); "seçili kişi" hedefleme 🔗 webde kalıyor — **bu iterasyonda araştırıldı, bilinçli olarak yapılmadı**: `audienceType:"selected"` gerçek auth **User** id'sine (`recipient.userId`, JWT `sub`) göre eşleşiyor (`matchesAudience`, `src/lib/announcements/audience.ts`), ama mobilde görünen öğretmen/öğrenci listeleri yalnız `Teacher.id`/`Student.id` dönüyor — bu iki id uzayı arasında hiçbir yerde (web admin paneli dahil) bir eşleme endpoint'i yok. Entity id'siyle gönderilirse sessizce 0 alıcıya ulaşır — bu yüzden inşa edilmedi. Sonraki adım: auth kullanıcı tablosundan (`src/lib/auth/users.ts`/Prisma `User`) entity id → user id eşlemesini üç modda (json/memory/db) döndüren gerçek bir backend özelliği — kapsamı "mevcut tool'u kullan" düzeltmesinin ötesinde |
| `panel/bildirimler/page.tsx` | — | ⛔/🔗 bu sayfa bildirim gelen kutusu DEĞİL, WhatsApp şablon kataloğu — mobil bildirim zili zaten ayrı ve gerçek bir gelen kutusu (`/notifications`); şablon kataloğu düşük öncelik, webde bırakıldı. Sonraki adım: yalnız admin nadiren şablon düzenlerse, salt-okunur bir "webde düzenle" linki yeterli — ayrı ekran gerektirmiyor |
| `panel/is-takip/page.tsx` (+kanban/takvim/raporlar) | `(admin)/islemler/is-takip` + `[taskId]` | ✅ **bu iterasyonda tamamlandı** — KPI özet satırı eklendi (mevcut `GET /api/v1/tasks/kpi`), ve daha önce hiç bağlı olmayan görev satırlarına dokunma artık yeni `(admin)/islemler/is-takip/[taskId]` detay ekranına gidiyor (öğretmen dalgasındaki detay ekranından uyarlandı — tek seferlik kopya, paylaşılan bileşene çıkarılmadı, gerekmedi); kanban/takvim/raporlar 🔗 webde — mobil segmentli liste yeterli parite |
| `panel/workflows/page.tsx` | `(admin)/islemler/workflows` | 🆕 liste + son çalışma özeti + aç/kapat |
| **CRM / tahsilat takibi** (`panel/ai/tahsilat-agent`) | `(admin)/islemler/tahsilat` | 🆕 kuyruk + ROI özeti + durum güncelleme (mesaj taslağı yalnız — gönderim insan onayı ister, PROJECT.md §8.3 korunuyor) |

### Finans

| Web sayfası | Mobil karşılığı | Durum |
|---|---|---|
| `panel/odemeler/page.tsx` + `[studentId]` | `(admin)/kisiler/ogrenci/[id]` içine ödeme özeti + `(admin)/islemler/tahsilat` | 🆕 öğrenci bakiyesi/ödeme geçmişi (mevcut `getParentBalanceTool` admin rolüne zaten açıktı, kullanılmıyordu) + ödeme kaydetme onay diyaloglu |
| `panel/hakedisler/page.tsx` + `ogretmenler/[id]/hakedis` | `(admin)/kisiler/ogretmen/[id]` içine hakediş sekmesi | 🆕 dönem hakedişi oluştur + ödendi işaretle |
| `panel/paketler/page.tsx`, `ucret-kurallari/page.tsx` | — | 🔗 config-ağırlıklı, nadir; webde kalıyor — sonraki adım: yalnızca salt-okunur bir "aktif paketler" listesi mobilde gösterilebilir, düzenleme yine webde kalmalı (nadir + riskli kurulum işi) |
| Gider/bütçe (`panel/gider*` — ana dalda `4d107f9 feat(finance): add expenses budgets and reporting` ile mevcut) | — | 🔗 **düzeltme**: bu modül web'de gerçekten var, ama bu mobil çalışma alanının (worktree) dallandığı noktadan SONRA ana dala eklendi — bu worktree'ye henüz taşınmadı (bkz. Teacher Performance v2 ile aynı kök neden: worktree main'in atası, main'den 500+ dosya ileride). Bu turun kapsamı yalnızca Teacher Performance v2 idi, bu modülü de sessizce içeri almak kapsam dışı. Sonraki adım: `4d107f9`'u bu worktree'ye Teacher Performance v2 ile aynı hunk-level yöntemle taşıyıp `(admin)/islemler/finans` altında salt-okunur özet + "webde aç" ekranı eklemek |
| Bordro / personel maaş-avans-IBAN (`2569e82 feat(panel): add personnel management module`, `25a1a9a feat(hr): expand personnel into payroll, leave, and owner finance dashboard` ile ana dalda mevcut) | Hakediş ekranları | 🔗 **düzeltme**: ayrı, gerçek bir Personel/HR modülü (bordro + izin + sahip finans paneli, ~3000 satır) web'de var — yalnızca bu worktree'de yok, "uygulamada hiç yok" önceki iddiası yanlıştı; kök neden aynı: worktree'nin dallandığı noktadan sonra ana dala eklendi. Mobilde şu an yalnız hakediş (öğretmen ücreti) karşılanıyor. Sonraki adım: bu iki commit'i Teacher Performance v2 ile aynı hunk-level yöntemle taşıyıp admin mobiline salt-okunur bir "personel/bordro" özet ekranı eklemek — kapsamı büyük olduğu için ayrı bir görev/iterasyon gerektirir |

### Yönetim

| Web sayfası | Mobil karşılığı | Durum |
|---|---|---|
| Personel (öğretmen dışı) | — | 🔗 **düzeltme**: `listAssignableStaff` (bu worktree'de) yalnız görev atama için öğretmen+admin birleşimi — ama ana dalda gerçek bir Personel/HR modülü var (bkz. Finans tablosundaki "Bordro / personel" satırı — `2569e82`/`25a1a9a`), bu worktree'ye henüz taşınmadı. Sonraki adım orada tarif edildi |
| İzinler (personel) | — | 🔗 aynı Personel/HR modülünün parçası (`25a1a9a` — "leave" = izin yönetimi); yukarıdaki "Bordro / personel" satırıyla birlikte taşınacak, ayrı bir mobil ekran değil |
| KVKK / rıza | `(admin)/kisiler/ogrenci/[id]` içine salt-okunur kart | ✅ **bu iterasyonda tamamlandı** — mevcut `getSocialMediaConsentTool`'a yeni ince `GET /api/v1/students/:id/social-media-consent` route'u eklendi (RBAC/sahiplik zaten tool içinde — `assertStudentAccess`), öğrenci detayına salt-okunur rıza durumu kartı eklendi; düzenleme yine webde |
| Kurum/şube seçimi (SUPER_ADMIN çoklu-kurum) | — | 🔗 çerez tabanlı `getInstitutionContext`/`readScopedData` mekanizması Bearer token modeliyle uyuşmuyor; SUPER_ADMIN'in nadir kullandığı bir görünüm, webde kalıyor. Sonraki adım: mobil JWT'ye seçili-kurum claim'i eklemek gerekir — bu, auth modelinde gerçek bir genişleme, hunk-level entegrasyonla yapılamaz |
| `panel/kurulum`, `denetim-kaydi`, `veri-aktar` | — | 🔗 ileri seviye veri aktarımı, denetim kayıtları, karmaşık sistem kurulumu — bilinçli olarak mobile taşınmadı. Sonraki adım: yok, bu üçü kalıcı olarak web-only kalması önerilen bir tasarım kararı (nadir + yüksek riskli işlemler) |
| Bildirim ayarları / hesap / güvenli çıkış | `(admin)/hesabim` | ✅ |

## Öğretmen (TEACHER)

| Web sayfası | Mobil karşılığı | Durum |
|---|---|---|
| `ogretmen/page.tsx` (bugün) | `(teacher)/bugun` | ✅ |
| `ogretmen/program/page.tsx` | `(teacher)/bugun` — haftalık gezinme (önceki/sonraki hafta, "Bugüne dön", 7 günlük Pt–Pz şerit seçici) + seçili günün ders listesi | ✅ **bu iterasyonda düzeltildi** — önceki basitleştirme (yalnız bugün) yeterli bulunmamıştı; artık gerçek haftalık gezinme var (masaüstü grid değil, mobil-native gün şeridi). Ders listesi hâlâ tek `GET /api/v1/teachers/:id/schedule` payload'ı üzerinden istemci tarafında filtreleniyor (yeni endpoint gerekmedi) |
| `ogretmen/ogrenciler/[studentId]` | `(teacher)/ogrencilerim/[studentId]` | ✅ genişletildi: müfredat konu ekleme/güncelleme 🆕; **bu iterasyonda düzeltildi** — "Değerlendirme" bölümü yalnızca yeni değerlendirme oluşturma linkiydi, geçmiş değerlendirmeler hiç gösterilmiyordu (kullanıcı raporu: "değerlendirdiğim öğrencinin geçmişinde ona dair değerlendirmemi göremiyorum"); mevcut `listAssessmentsForStudentTool`/`GET /api/v1/assessments/:studentId` kullanılarak "Değerlendirme geçmişi" listesi eklendi (yeni endpoint gerekmedi) |
| `ogretmen/odevler/page.tsx` | `(teacher)/odevler` + `[homeworkId]` detay | ✅ **bu iterasyonda düzeltildi** — son tarih artık gerçek native takvim seçici (`@react-native-community/datetimepicker`, manuel `YYYY-AA-GG` metin girişi kaldırıldı); dosya eki artık gerçek (`expo-document-picker`+`expo-file-system`, base64 → mevcut `POST /api/v1/homework`'ün zaten desteklediği `fileName`/`fileMimeType`/`fileData` alanları, backend değişmedi), "(yakında)" placeholder'ı tamamen kaldırıldı; ayrıca önceden hiç bağlı olmayan `HomeworkCard.onPress` artık yeni `[homeworkId]` ekranına gidiyor — öğrenci teslimi + öğretmen geri bildirim formu (`POST /api/v1/homework-submissions/:id/review`, mevcut endpoint) |
| `ogretmen/materyaller/page.tsx` | `(teacher)/hesabim/materyaller` (+ yeni materyal) | ✅ (endpoint zaten vardı, ekran eklendi) |
| `ogretmen/degerlendirme/**` | `/assessment/[lessonId]` (ders detayından) | ✅ |
| `ogretmen/geri-bildirim/page.tsx` (kendi veli/öğrenci puanı özeti) | `(teacher)/hesabim/geri-bildirim` | ✅ (endpoint zaten vardı, ekran eklendi) |
| Şifre değiştirme (self-service) | `(teacher)/hesabim/sifre-degistir` | 🆕 **web'de de yoktu — bu iterasyonda net-yeni özellik** olarak eklendi (kullanıcı talebi). Yeni `changeOwnPasswordTool` + `POST /api/v1/auth/change-password` (rol-bağımsız, herhangi bir kimliği doğrulanmış kullanıcı); `db` modunda gerçek `User.passwordHash` güncelleniyor, `json`/`memory` modunda süreç-ömürlü bir override map'i kullanılıyor (bootstrap demo kullanıcıları için dürüst bir sınır, `ponytail:` yorumuyla işaretli) |
| `ogretmen/musaitlik/page.tsx` | `(teacher)/hesabim/musaitlik` | ✅ **bu iterasyonda düzeltildi** — çoklu gün önerisi tek POST'ta zaten çalışıyordu (regresyon değildi), ama gerçek kusur: ilk gönderimden sonra `sent` bayrağı formu kalıcı olarak kilitliyordu, ikinci bir öneri göndermek için ekrandan çıkıp tekrar girmek gerekiyordu. Artık geçici (4sn) bir onay banner'ı gösterip formu sıfırlıyor — aynı oturumda art arda gönderim mümkün. Saf mantık `src/lib/availability-form.ts`'e çıkarıldı, `availability-form.test.ts` ile regresyon testi eklendi |
| `ogretmen/hakedis/page.tsx` + `[payoutId]` | `(teacher)/hesabim/hakedis` | ✅ (tool vardı, yeni REST route + ekran eklendi) |
| `ogretmen/is-takip/**` | `(teacher)/is-takip` + `yeni` | ✅ **bu iterasyonda tamamlandı** — liste/detay zaten kompaktken ("uzun bar" şikayeti güncel koda uymuyordu, yeniden tasarım gerekmedi), gerçek eksikler kapatıldı: görev oluşturma ekranı yoktu (`createTaskTool` TEACHER rolüne izin veriyor, `is-takip/yeni.tsx` eklendi, kendi öğrencisiyle ilişkilendirerek mevcut `POST /api/v1/tasks`'a gönderiyor); detay ekranı `comments`/`attachments` alanlarını API'den alıp hiç göstermiyordu — attachments salt-okunur listelendi, yorumlar için `addTaskCommentTool`'a REST route eksikti, yeni `POST /api/v1/tasks/:taskId/comments` eklendi (mevcut withApiHandler/RBAC/tenant deseniyle, kardeş route'larla birebir aynı şekilde) |
| Teacher Performance v2 detay ekranı (`d62bb21`, ana daldaki doğrulanmış implementasyon) | `(teacher)/hesabim/performans` | ✅ **bu iterasyonda tamamlandı** — admin ekranındaki gösterim `src/components/teacher-performance-v2-panel.tsx` adlı paylaşılan bileşene çıkarıldı, hem admin (`(admin)/kisiler/ogretmen/[id]/performans`) hem öğretmen kendi hesabından (`(teacher)/hesabim/performans`) aynı bileşeni kullanıyor; aynı `GET /api/v1/teachers/:id/performance-v2` (RBAC zaten TEACHER'ı kendi `teacherId`'siyle sınırlıyor), backend değişmedi |

## Veli (PARENT)

| Web sayfası | Mobil karşılığı | Durum |
|---|---|---|
| `veli/page.tsx` (dashboard) | `(parent)/anasayfa` | ✅ |
| `veli/mufredat/page.tsx` | `(parent)/gelisim` | ✅ |
| `veli/odevler/page.tsx` (salt-okunur) | `(parent)/odevler` | ✅ (teslim işlemi bilinçli olarak yalnız öğrenci hesabından — web'deki kural birebir korunuyor) |
| `veli/degerlendirme/page.tsx` | `(parent)/gelisim/degerlendirme` | ✅ **bu iterasyonda düzeltildi** — paylaşılan `src/features/student-scope/gelisim-screen.tsx` bileşeni artık yalnızca atanmış öğretmeni değil, son 90 günde ders verdiği tüm öğretmenleri (son ders tarihiyle) listeliyor; mevcut `GET /api/v1/students/:id/schedule` (`getStudentScheduleTool`, zaten teacherId/teacherName zenginleştirilmiş dönüyor) üzerinden istemci tarafında türetildi, yeni endpoint gerekmedi. Bileşen `(student)/gelisim/degerlendirme` ile paylaşıldığı için aynı düzeltme öğrenci tarafını da kapsıyor |
| Telafi hakları görünümü | `(parent)/dersler` içine telafi kartı | 🆕 (liste endpoint'i yoktu, eklendi) |
| Ödeme özeti/geçmişi | `(parent)/anasayfa` + yeni ekran | 🆕 (`getParentBalanceTool` zaten PARENT'a açıktı, kullanılmıyordu) |
| Online ödeme (hosted checkout) | `(parent)/odemeler/[paymentId]` + `payment-result` | 🆕 **bu iterasyonda eklendi** — yeni `POST /api/v1/mobile/payments/:paymentId/checkout` (web checkout ile aynı tool/yetki/fail-closed; dönüş URL'leri sunucu-sabit `neviihub://payment-result` deep-link, open-redirect YOK). Kart/CVV uygulamaya girmez (sistem tarayıcısı); sağlayıcı kapalıysa dürüst "henüz aktif değil"; paid yalnız webhook'la |
| Push bildirimleri (ders hatırlatma 1g/1s/15dk) | Oturum açıkken otomatik kayıt + dokunma → `(parent)/dersler` | 🆕 **bu iterasyonda eklendi** — `expo-notifications`/`expo-device`, Android `lesson-reminders` kanalı, çıkışta token invalidation; veli TÜM aktif çocukları için alır (`sweepLessonReminders` + `lesson-reminder-sweep.test.ts` 6/6) |
| Çoklu çocuk seçimi | — | ⛔ **veri modelinde yok** — bir veli hesabı JWT'de tek `studentId` taşır, web'de de guardian↔çoklu-öğrenci ilişkisi modellenmemiş; mobil kod zaten tek-id varsayımını genelleştirilebilir tutuyor, ileride model eklenirse ekran değişmeden genişler |
| İletişim tercihi / KVKK | `(parent)/hesabim/iletisim-tercihi` | ✅ (mevcut `communication-preference` endpoint'i kullanıldı) |

## Öğrenci (STUDENT) — yeni, ayrı persona

Öncesinde STUDENT rolü PARENT ile aynı ekranlara yönlendiriliyordu — bu
iterasyonda **ayrıldı** (`roleToPersona` artık `"student"` döndürüyor, ayrı
`(student)` sekme grubu). Web'de zaten tamamen ayrı bir portal (`/ogrenci`,
farklı yazma yetkileri: öğrenci ödev teslim edebilir + kendi adına öğretmen
değerlendirebilir, veli edemez).

| Web sayfası | Mobil karşılığı | Durum |
|---|---|---|
| `ogrenci/page.tsx` | `(student)/anasayfa` | 🆕 (paylaşılan `StudentScopeHomeScreen` bileşeni) |
| `ogrenci/odevlerim/page.tsx` (gerçek teslim formu) | `(student)/odevler` + detay | 🆕 (teslim mantığı zaten `homeworkBucket`/detay ekranında rol bazlı vardı, sekme grubu yoktu) |
| `ogrenci/materyaller/page.tsx` | `(student)/gelisim` içinden | 🆕 |
| `ogrenci/mufredat/page.tsx` | `(student)/gelisim` | 🆕 |
| `ogrenci/degerlendirme/page.tsx` | `(student)/gelisim/degerlendirme` | 🆕 |
| Dönem/tatil-farkında haftalık program mantığı (`resolveDayStatus`, güz/yaz) | `(student)/dersler` + `(parent)/dersler` (paylaşılan `lessons-screen.tsx`) | ✅ **bu iterasyonda tamamlandı** — gün-gün gezinme (önceki/sonraki, "Bugüne dön", 7 günlük şerit, teacher `bugun` ekranıyla aynı `date.ts` yardımcıları) + tam gün durumu: yeni endpoint yazılmadı, zaten var olan `getAttendanceCalendarMonthTool`/`GET /api/v1/attendance-calendar/month` (admin "Yoklama Takvimi" için yazılmış, STUDENT/PARENT için zaten RBAC'lı, `resolveDayStatus`'u manuel istisna>resmî tatil>haftalık kural>açık sırasıyla zaten çalıştırıyordu) yeniden kullanıldı — yalnız bir `withinTerm` alanı eklendi (dönem dışı ay tespiti). Mobil ekran bu ay-bazlı durum uç noktasını, ders içeriği için `getStudentScheduleTool`'la tarihe göre istemci tarafında birleştiriyor (iş mantığı tekrarı yok — sunucu zaten çözümlüyor, istemci yalnızca iki JSON'u tarihle eşliyor). Kapalı gün/resmî tatil/manuel istisna sunucunun `label`'ıyla banner olarak, dönem tatili ay-seviyesinde ayrı bir bilgi çubuğuyla gösteriliyor. RBAC/tenant/JSON-zarf ayrı bir turda doğrulandı (tenant izolasyonu `readData()` ALS üzerinden, sahiplik `assertStudentAccess` her iki tool'da da veri okumadan önce çalışıyor, route girişleri zod ile doğrulanıyor, hatalar hep JSON) — `attendance-calendar-day-status.test.ts`+`attendance-calendar-tools.test.ts`+`attendance-calendar-payment-collection.test.ts` (57/57) |
| Aktif olmayan öğrenci için güvenli engelli-erişim ekranı | — | ✅ **bu iterasyonda tamamlandı** — paylaşılan `lessons-screen.tsx` (+ilgili detay ekranı) artık FORBIDDEN/NOT_FOUND hata kodunu gerçek backend mesajı yerine düz bir Türkçe mesaja ("hesabınız artık aktif değil, okulunuzla iletişime geçin" tonunda) çeviren `friendlyAccessMessage()` kullanıyor; `useApiGet` artık hata kodunu da (`code`) taşıyor |
| Online ödeme (hosted checkout) | `(student)/odemeler/[paymentId]` + `payment-result` | 🆕 **bu iterasyonda eklendi** — veli satırındakiyle aynı altyapı; öğrenci SELF erişimiyle kendi ödemesini başlatır |
| Push bildirimleri (ders hatırlatma) | Oturum açıkken otomatik kayıt + dokunma → `(student)/dersler` | 🆕 **bu iterasyonda eklendi** — veli satırındakiyle aynı altyapı |

## Bu iterasyonda eklenen endpoint'ler

Zaten var olup yalnız mobil ekranı eksik olanlar (backend değişmedi):
`GET /api/v1/teachers/:id/performance-v2` (bu turda `d62bb21`'den worktree'ye taşındı — bkz. üstteki Teacher Performance v2 satırı),
`GET /api/v1/students/:id/balance`, `GET /api/v1/students/:id/teaching-materials`,
`GET /api/v1/teaching-materials/mine`, `POST /api/v1/teaching-materials`,
`GET/POST /api/v1/teachers/:id/availability-requests`,
`POST /api/v1/teachers/availability/propose`,
`POST /api/v1/teachers/availability-requests/:id/review`,
`GET /api/v1/teacher-feedback/summary`, `POST /api/v1/curriculum`,
`PATCH /api/v1/curriculum/:topicId`, `GET /api/v1/workflows`,
`GET/POST /api/v1/tahsilat/cases`, `POST /api/v1/payments/:id/pay`.

Yeni eklenenler (bu iterasyonda, mevcut `withApiHandler`/RBAC/tenant/sahiplik deseniyle):
`GET /api/v1/makeup` (rol bazlı: admin tüm kurum, veli/öğrenci yalnız kendisi),
`GET /api/v1/rooms`, `GET /api/v1/branches`,
`GET /api/v1/teachers/:id/payouts`, `POST /api/v1/teachers/:id/payouts`,
`POST /api/v1/teachers/payouts/:payoutId/mark-paid`.

Push + ödeme turu (bu iterasyon): `POST/DELETE /api/v1/mobile/push-tokens`
(önceki push turunda), `POST /api/v1/mobile/payments/:paymentId/checkout`
(web checkout ile aynı tool; dönüş URL'leri sunucu-sabit deep-link).
RBAC değişikliği YOK (`payments:checkout` STUDENT'ta zaten vardı).

## Uygulama-geneli düzeltmeler (bu iterasyonda, kullanıcı raporu üzerine)

- **Klavye giriş alanlarını kapatıyordu** ("ne yazdığımı göremiyorum") — kök neden: paylaşılan `Screen` bileşeninde (her ekranın ortak dış çerçevesi) `KeyboardAvoidingView` hiç yoktu. Tek bir dosyada (`src/components/ui/screen.tsx`) düzeltildi — uygulamadaki HER form/metin girişi ekranını (değerlendirme formu dahil) kapsar, ekran ekran yama gerekmedi.
- **"Uzun dikey içi dolu elips" görünüm hatası** (ödevler + iş takip ekranlarında bahsedilen) — kök neden: paylaşılan `FilterChip` bileşeninde `numberOfLines` sınırı yoktu (`StatusBadge`'de vardı, `FilterChip`'te unutulmuştu); `odevler` ekranındaki öğrenci-adı filtre çipleri gibi uzun bir etiket `borderRadius:999` pill içinde satır satır sarılınca dikey uzayan, kırpılmış görünen bir "kapsül" oluşuyordu. Tek bileşende (`src/components/ui/filter-chip.tsx`) düzeltildi — `numberOfLines={1}`+`flexShrink:0` ile, yatay scroll zaten mevcut olduğu için tam isim tek satırda görünüyor.

## Bilinçli sadeleştirmeler (task metninde izin verilen kapsam)

- Program ekranı haftalık grid değil, gün-bazlı liste (mobil için daha uygun; task metni bunu açıkça öneriyor).
- İş takip kanban/takvim görünümleri mobilde ayrı ekran değil — aynı veri, segmentli liste (task metni de "kanban yerine mobil segmentli görünüm" istiyor).
- Toplu/ileri seviye admin işlemleri (CSV içe aktarım, denetim kaydı, sistem kurulumu, şablon/evrak oluşturma, paket/ücret kuralı düzenleme) mobilde özet + "webde aç" — tam CRUD değil.
