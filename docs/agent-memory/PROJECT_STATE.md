# NeviiHub — Güncel snapshot (resume-from-here)

Kısa tutulur (~50 satır): oturum sonunda yalnız "Güncel snapshot" bölümünün ÜZERİNE yazılır; eski snapshot
`archive/`'e taşınır. Ayrıntı → ilgili `docs/testing/UAT_*.md`, `docs/operations/*`. Yönlendirici: `nevii-hub` skill.
Tam tarihçe (2026-08-30 → 09-24): `archive/PROJECT_STATE_LOG_2026-08-30_to_2026-09-24.md`.

## Güncel snapshot — 2026-10-15 (kalıcı silme + öğrenci arama dropdown'u; dal `feat/permanent-delete-and-student-search`, PR açık, MERGE/CANLI YOK)
- Kalıcı silme: tek saf planlayıcı `src/lib/person-purge.ts` (önizleme = silme kuralı, parmak izi). DB yürütücü
  `person-purge-db.ts` (tek transaction + advisory lock + satır sayısı + P2003→çatışma), json/memory `person-purge-files.ts`.
  Sonuç: geçmiş yoksa silme; tahsilat/imzalı sözleşme/hakedişe giren ders/öğrenci geçmişi varsa anonimleştirme (`purgedAt`).
  Tool: `getPersonPurgePreviewTool` / `purgePersonTool` (deleteStudent/TeacherTool `mode:"hard"` buna gider). Eski
  "yalnız ilişkisizse sil" (`hardDelete*`) kaldırıldı. UI: `person-purge-dialog.tsx` (Silinenler, detay, Kaldırılanlar).
- Migration `20261015090000_person_purged_at` (2 nullable kolon) KODDAN ÖNCE canlıya — owner onayı bekliyor.
- Arama: ortak `student-search-combobox.tsx` (Yoklama + Öğrenciler); seçim `?studentId=`, 50'şer kademeli liste.
- Doğrulama: hedef testler + json uçtan uca + izole yerel PostgreSQL (db push) duman testi + tarayıcıda UI. UAT:
  `docs/testing/UAT_2026_10_15_PERMANENT_DELETE_AND_STUDENT_SEARCH.md`. Açık: /panel 375px'te kenar menü daralmıyor (eski).

## Güncel snapshot — 2026-10-14 (öğretmen e-posta / portal davet senkronizasyonu; PR #29 açık, merge/canlı yok)
- Dal `fix/teacher-email-portal-sync`, `origin/main` (`2706825e`) tabanlı ayrı worktree.
- `Teacher.email` iletişim, bağlı `User.email` portal giriş adresi olarak ayrıldı; öğretmen hesabı yalnız tenant + `teacherId` ile bulunur.
- Profil e-postası değişikliği bekleyen davet token'larını iptal eder; yeniden davet kendiliğinden gönderilmez. Yönetici eylemi yeni alıcıyı güncel iletişim adresine taşır.
- Aktif hesabın giriş adresi profil güncellemesinde değişmez; iletişim/giriş adresleri UI'da ayrı gösterilir. Etkin/kapalı başka hesaba ait adresler çakışma sayılır.
- Migration `20261014150000_teacher_invitation_email_sync` yalnızca dosya olarak mevcut; DB'ye uygulanmadı. Production verisi, merge ve deploy yok.
- `typecheck`, lint, `prisma validate`, build ve odak davet testleri (2 dosya / 44 test) geçti. Tam suite gereksiz süre nedeniyle durduruldu; başlangıç çıktısında bu iş dışındaki test hataları da vardı.

## Snapshot — 2026-10-14 (rapor portalı; dal `feat/report-portal`, PR açık, MERGE/CANLI YOK)

## Güncel snapshot — 2026-10-14 akşam (telafi yaşam döngüsü + "Geldi" notu; dal `feat/makeup-lifecycle-attendance-note`, PR açık, MERGE/CANLI YOK)
- Planlanmamış telafi son yerel günün ertesi 00:00'ında (kurum saat dilimi) `expired` + kaynak ders "İşlendi — Telafi planlama
  süresi doldu" (Geldi/gerçekleşmiş telafi YOK; yeni finansal kural YOK). Kapatma: `commitMakeupPlanningExpiry` (tenant'a dar,
  indeksli, idempotent; okuma yolunda, yeni cron/polling yok). Planlanmış talep eski süreyle kapanmaz.
- Yönetici: süre uzat, plan revize, "Planı sil" (hak+kaynak ders korunur), "Telafi hakkını iptal et" (ayrı onay); yoklamalı/finansal
  kayıtta açık onay+gerekçe; iz `MakeupRequest.changeLog`. "Geldi" isteğe bağlı notu (`Lesson.studentAttendanceNote`, web+mobil).
- Migration `20261014160000_makeup_lifecycle_note` (eklemeli) KODDAN ÖNCE, owner onayıyla. UAT: `docs/testing/UAT_2026_10_14_MAKEUP_LIFECYCLE.md`.
- Doğrulama: typecheck/lint(0 hata)/prisma validate/odaklı testler temiz; tam suite'te yeni regresyon yok (baseline kırmızıları aynı).
- Not: grok (başka araç) işi yarıda bırakmıştı; Claude tamamladı.

## Güncel snapshot — 2026-10-14 (rapor portalı; dal `feat/report-portal`, PR açık, MERGE/CANLI YOK)
- Spec/plan: `docs/superpowers/specs|plans/2026-10-14-report-portal*`. UAT: `docs/testing/UAT_2026_10_14_REPORT_PORTAL.md`.
- `/gelisim` (öğretmen mobil rapor sitesi), `/degerlendir` + `/degerlendir/<kod>` (öğrenci değerlendirmesi, 14 gün kişiye özel
  link, yeni tablo `FeedbackInvite`), `/panel/raporlar` (yönetici takibi), rapor gönderiminde yönetici bildirimi.
- Düzeltilen hatalar: çoklu branşta değerlendirme/rapor yanlış (ilk) öğretmene yazılıyordu; rapor kaydı tam okuma yapıyordu.
- Migration `20261014120000_feedback_invites` (eklemeli, RLS) canlıya KODDAN ÖNCE, owner onayıyla.
- Kota tarafı: PR #27 açık (merge onayı bekliyor); Firewall Bot Protection + Supabase Data API kapatma owner'da.

## Snapshot — 2026-10-13 (kota denetimi + `perf/quota-p1`; PR açık, MERGE/CANLI YOK — owner sürüm onayı bekliyor)
- Rapor: `docs/performance/QUOTA_AUDIT_2026_10_12.md`. Vercel Active CPU 3 sa 53 dk / 4 sa; Supabase 8,79 / 5 GB, 11 Ekim tek gün
  1,185 GB (PR #21 sonrası, öncesinden YÜKSEK → etkisi kanıtsız). Kasım bütçesi ≈ 170 MB/gün; Supabase'te ikinci grace yok.
- Owner SQL: dosya kolonları canlıda ~boş (yalnız DocumentInstance 126 / 2,6 MB); Student 233 × 459 B ama her dilimde okunuyor.
- Dal `perf/quota-p1` (taban `origin/main` 174bb2b): `store-db.readData()` ölçüm satırı `egress:readData:full`; evrak listeleri
  `fileData`/`renderedHtml` okumuyor; 3 portal sayfası `readStudentScope`. Migration/şema/env değişikliği YOK.
- Sıradaki: deploy sonrası okul saatinde `get_runtime_logs group_by requestPath query egress:readData:full` → en sık 3 rota dilime;
  Student kolon daraltma; `notification-tick` secret'ları sweep daraltılmadan EKLENMEZ; mobil yayın öncesi `admin-lists` daraltılır.

## Snapshot — 2026-10-10 geç (gece tahakkuk cron'u P2002; PR #22 MERGE + CANLIDA, prod `78d81bb`)
- Dal `claude/jovial-perlman-4440c2` (taban `origin/main` cf12bc0). Migration/şema/env değişikliği YOK.
- `monthly-accrual` cron'u platform tenant'ını atlar; kurum başına try/catch + `logger.error`; yanıtta
  `failed`/`failures`, hata varsa HTTP 500. `store-db.readData()` okul yoksa canlıda (`VERCEL_ENV`/
  `NEVII_DEPLOYMENT_TIER`=production) seed etmez, Türkçe hata atar (tüm dilim okuyucular buraya düşer).
- Owner kontrolü (salt okuma): 10-03..10 her gece seed silme transaction'ı okulsuz tenant'ta commit olmuş olabilir —
  `tenant_platform` User satırları ve Tenant adı. Deploy sonrası ilk cron yanıtı `failed: 0` olmalı.

## Güncel snapshot — 2026-10-14 (dört düzeltme; 4 PR açık, MERGE/CANLI YOK, migration YOK)
- PR'lar (taban `origin/main` 937ed5a): ileri ay tahsilatı (`fix/forward-month-attendance`), öğretmenin aktif
  öğrencileri (`fix/teacher-active-students`), öğretmen portal e-postası yalnız kurum sahibi
  (`feat/teacher-portal-email-owner`), NeviiOS platform hesabı teşhis + kurtarma (`fix/neviios-hyper-admin-recovery`).
- Kapı (yerel birleşim dalı): typecheck/lint(0 hata)/prisma validate temiz; tam paket 4425 geçti / 15 kırmızı —
  hepsi `origin/main`'de de kırmızı (taban 16). Build owner talimatıyla çalıştırılmadı; owner canlıda test edecek.
- Kanıtlı canlı durum: (1) 8 sözleşmesiz "takip eden ay" kayıt tahsilatı kırılımsız — 3 kesin/5 belirsiz, backfill
  çalıştırılmadı; (3) Turgay iletişim e-postası yeni, giriş e-postası eski (hesap aktif) — yayından sonra kurum sahibi
  akışıyla doğrulama; (4) canlı DB'de HİÇ HYPER_ADMIN yok, prod env'de AUTH_HYPER_ADMIN_* yok — kurtarma
  `scripts/recover-hyper-admin.ts` owner onayıyla. Kaybolma nedeni bilinmiyor (10-03…10-06 dump'ları bakılmadı).
- Açık: owner onayları (merge/deploy, backfill, Turgay doğrulama e-postası, HYPER_ADMIN kurtarma + reset e-postası).
  UAT: `docs/testing/UAT_2026_10_14_FOUR_FIXES.md`.

## Güncel snapshot — 2026-10-10 (P0 Supabase egress + UserSession kilidi; PR #21 MERGE + CANLIDA `cf12bc0`, ~10:42Z)
- Yöntem/kurallar: skill `performance-db-egress`; kalan tam okumalar `docs/performance/DB_EGRESS_2026_10_10.md` §5.
- Dal `fix/supabase-egress-p0` (taban `origin/main` a18c887) → PR. Migration/şema/env değişikliği YOK.
- Kök neden (kanıt + yerel ölçüm): her yoklama işareti/geri alma (`planOpsChangeForPayout`), ders başlat/bitir, ders
  oluşturma, tahsilat, öğretmen ana sayfası, öğrenci ödeme profili, makbuz ve Öğretmenler listesi tenant'ın TÜM verisini
  okuyordu → dar dilim/tek satır. Ölçüm: bu akışlarda DB→uygulama baytı −85…−98 %. Ayrıntı:
  `docs/performance/DB_EGRESS_2026_10_10.md`.
- UserSession: Prisma 7 `updateMany` = BEGIN/UPDATE/COMMIT; yanıt sonrası presence yazımı askıda kalınca satır kilidi
  açık kalıyordu. Artık tek ifade `update`, DB'de koşullu 5 dk aralık, `after()` ile fonksiyon ömrü içinde.
- Açık: Telafi Merkezi, öğretmen detay sekmeleri, telafi oluştur/onayla, seri işlemleri hâlâ tam okuma; Student
  dilimleri tüm kolonları okur. Gece `monthly-accrual` cron'u okulsuz kurumda P2002 (ayrı görev).
- Canlı doğrulama: deploy sonrası Supabase Usage günlük egress eğilimi + Query Performance (owner).

## Güncel snapshot — 2026-10-09 (çoklu branş kaydı + grup başvurusu süre; PR açık, MERGE/CANLI YOK, test çalıştırılmadı)
- Dal `feat/multi-branch-enrollment` → PR (main). Statik kontrol: typecheck temiz, değişen dosyalarda lint 0 hata.
- Branş kaydı = `Student.enrollments[]`; tüm branşlar eşit (ana/yedek yok), koşullar tek kapıdan `enrollmentTerms`.
  Yeni `Payment.enrollmentId`; ders/seri yazımı branşı store cephesinde çözer (`inferLessonEnrollmentId`).
- Migration `20261009120000_payment_enrollment_link` kod deploy'undan ÖNCE uygulanmalı. Backfill opsiyonel:
  `scripts/backfill-enrollment-links.ts` (kuru çalıştırma → rapor → `--apply`). UAT: `docs/testing/UAT_2026_10_09_MULTI_BRANCH_ENROLLMENT.md`.

## Güncel snapshot — 2026-10-08 (kulüp düzeltmeleri; PR açık, MERGE/CANLI YOK, test çalıştırılmadı)
- Dal `claude/festive-maxwell-5fntib` → PR (main). Owner merge edip canlıda test edecek. Yalnız statik kontrol:
  typecheck + eslint (değişen dosyalar) + prisma validate temiz; `npm test`/build/tarayıcı owner talimatıyla ÇALIŞTIRILMADI.
- Kök neden (üyelik sonlandırma): `isMembershipActive` `endDate >= bugün` diyordu; sonlandırma bitişi BUGÜNE yazınca
  üye aktif listede kalıyor, hem "Üyeliği sonlandır" hem "zaten sonlanmış" görünüyordu. Artık `endDate` = sonlanma
  günü (o günden itibaren aktif değil) — liste/sayaç/kontenjan/seçici/oturum kapsamı (`membershipCoversDay`) tek tanım;
  sonlandırma idempotent. Yeni: "Üyeliği sil" (`deleteClubMembershipTool`; tahsilat/yoklama varsa ret → sonlandır).
- Diğer: üye ekleme sunucu aramalı combobox; yaş grubu "Genç" (`club-audience.ts`); portal önce grup sonra bilgiler;
  "Notlar"→"Eğitim geçmişi" zorunlu; `Club.totalLessons` (portalda "Toplam ders sayısı"), `Club.feeMonths` ("Ödeme
  alınacak ay sayısı", aylık tahakkuku sınırlar); oturum "Haftalık tekrar sayısı" elle (ilk hafta dahil, 1–52, kilit +
  aynı başlangıç mükerrer ret). UAT: `docs/testing/UAT_2026_10_08_CLUB_FIXES.md`.
- Migration `20261008090000_club_total_lessons_fee_months` (2 nullable kolon). ÖNKOŞUL: `20261007120000_club_applications`
  canlıda uygulanmış olmalı; ikisi de KODDAN ÖNCE canlıya (session pooler 5432) uygulanır.

## Güncel snapshot — 2026-10-07 (grup dersi başvuru portalı; KOD HAZIR, canlı migration owner makinesinde bekliyor)
- Dal `claude/clever-mayer-inc1h9`. Kulüp taslak/başvuruya açık ayrımı (öğretmen/üye zorunlu değil), yeni alanlar
  (grup, yaş sınırı, dönem tarihleri, gün/saat, ücret niteliği aylık/dönemlik/toplam, dahil olanlar, yönetim notu,
  bekleme listesi, dahil solfej). Portal `/basvuru/<slug>/kulup` (+`?kulup=`), Kulüpler → Başvurular, "Kulübe ekle"
  (eşleştir → önizle → onay; `withClubMembershipLock` = advisory lock + tek transaction, idempotent), dahil solfej
  hakları (`includedByMembershipIds`), oturum/üyelik tarih düzeltme, üye ekleme araması (50 sınırı kaldırıldı).
- Migration `20261007120000_club_applications` (eklemeli). Canlıya bu konteynerden erişim yok → owner:
  `scripts/ops/release-2026-10-07-club-applications.sh` (yedek+doğrulama+deploy) → sonra `main` push. UAT:
  `docs/testing/UAT_2026_10_07_CLUB_APPLICATIONS.md`.
- Doğrulama: typecheck/lint(0 hata)/prisma validate/build temiz; odaklı testler (kulüp/deneme/bildirim/kayıt/rol
  ~170 test) geçti; yerel PostgreSQL'de STORE_MODE=db duman testi + tarayıcıda uçtan uca senaryo geçti. Tam `npm test`
  owner talimatıyla çalıştırılmadı.

## Güncel snapshot — 2026-10-06 geç (Claude sağlayıcısı + ana sayfa İngilizce özet; PR bekliyor)
- AI zinciri artık Claude → Gemini → Groq → NVIDIA NIM → Cerebras → heuristic (`providers/claude.ts`, resmî
  `@anthropic-ai/sdk`, varsayılan `claude-opus-5-5`, `CLAUDE_MODEL` ile değişir). Anahtar yoksa davranış eskisiyle aynı.
  `collectionsMessageDraft` tercihi claude (onay zorunluluğu değişmedi). Owner Vercel'e `ANTHROPIC_API_KEY` ekledi.
- Ana sayfa "NeviiHub nedir?" altına İngilizce özet (Claude for Startups başvurusu için). Migration YOK.
- Doğrulama: typecheck + hedef AI testleri (6 dosya, 74 test) geçti; tam `npm test` bu ortamda süre sınırına takıldı.

## Güncel snapshot — 2026-10-06 gece (program/telafi filtreleri; PR ile canlıya)
- Ders programı: öğrenci filtresi yalnız aktif (`isActiveStudent`), öğretmen filtresi aktif + silinmemiş; ders kartı adları
  tam listeden (geçmiş korunur). Eski `?studentId=` pasif öğrenci → devre dışı "(pasif)" seçenek; kapsam dışı id yok sayılır.
- Telafi Merkezi: öneriler varsayılan kapalı (`makeup-suggestions-disclosure.tsx`, aria-expanded); kompakt kart; iptal
  gerekçesi `<details>` içinde. Öğrenci otomatik tamamlama + şube + öğretmen filtresi (`makeup-filter-bar.tsx`,
  `lib/makeup-filters.ts`, URL `?ogrenci=&sube=&ogretmen=`, AND, sayaç/sayfalamadan önce). Öğretmen = talebin öğretmeni.
- Bilinçli karar: öneriler açılışta ayrı istekle yüklenmiyor — her açılış tam `readScopedData` (egress) demek; kayıtlı
  öneriler sayfanın tek okumasında doğrulanıp yalnız açılınca DOM'a bağlanıyor.
- CI `main`'de kırmızı: typecheck adımı runner'da OOM (heap ~2 GB) → testler CI'da çalışmıyor; önerilen düzeltme
  `NODE_OPTIONS=--max-old-space-size=6144`. Yerelde 10 dosyada 19 test `main`'de de kırmızı (saat/tarih bağımlı) — ayrı iş.

## Güncel snapshot — 2026-10-05 (sözleşmesiz aylık tahakkuk CANLIDA)
- Kök neden: sözleşmesiz öğrencinin aylık ücreti hiç borç yazılmıyordu (`monthly_plan` yalnız tahsilatta); liste doğru
  ama gösterecek borç yoktu. Canlı: `d3d3212` (`dpl_3mn1hgk…`). `standalone-monthly-accrual.ts` + cron
  `/api/v1/platform/jobs/monthly-accrual?apply=1` her gün 01:00 UTC (yalnız içinde bulunulan ay, idempotent, audit).
- Karşılanmış ay: kayıt ilk tahsilatı (+sonraki ay işaretliyse), `monthly_plan` açıklama ayı VEYA vade ayı (iptal dahil).
- Veri (owner onayı): ilk cron'da 14 öğrenciye Ekim borcu 96.605 TL. 4 öğrencinin ilk tahsilatı 1 TL — dokunulmadı, owner kontrol.
- Açık: vadesi geçen satır hiç `overdue` olmuyor (listede "Gecikmiş" eksik; takvim doğru) — ayrı iş. Sıradaki: yoklama
  takviminde ödeme tarihi/türü sabit, Özet Notlar, deneme başvuru, kulüp (tasarım önce).

## Güncel snapshot — 2026-10-03 akşam (ürün sürümü CANLIDA; açık kapandı; demo verisi kaldırıldı)
- Canlı: `a35be2e` (`dpl_97iJbe28U2s7j214DD1wnXosHzHM`, fra1, 16:07Z): pasif öğretmen kaldırma, telafi saati boşaltır +
  eşzamanlı ders yazımında çift rezervasyon kapandı, enstrüman tek kaynak (Bas Gitar), öğrenci seçilince ders süresi,
  ödeme silme/tahsilat geri alma (kritik şifreli), loglarda gizlilik. Prod migration `20261003120000_teacher_soft_delete`
  uygulandı (91/91). Önceki güvenlik sürümü `3fece63` (fail-closed auth, AI_AGENT sıfırlama yok) de canlıda.
- Hesaplar (owner onayı): 7 öğretmenin herkese açık olmuş varsayılan şifresi döndürüldü (hesaplar aktif; giriş için HYPER_ADMIN
  /platform/kullanicilar → 60 dk sıfırlama bağlantısı). Demo hesaplar + AI_AGENT kapalı (satırlar silindi işaretli kalır —
  seedDatabase eksik bootstrap kullanıcıyı varsayılan şifreyle yeniden yaratır). 13 demo öğrenci + bağlı ders/yoklama/telafi/
  ödeme/bildirim silindi; yalnız demo dersinden oluşan 2 hakediş (t1, t2) iptal. Gerçek veri yedeğe göre TAM doğrulandı.
- Açık: Nilüfer + Ezgi e-posta ve şifrelerini **2026-10-10**'a kadar kendileri değiştirir (sonra kontrol + döndürme).
  Seed'deki 65 öğrenci GERÇEK okul verisi (ogrenciler3.csv) — demo değildir. Hobby ticari kullanım, Supabase–Vercel
  entegrasyonu (uqkaf…), AI dalı + KVKK, seed'den gerçek veriyi çıkarma: owner kararı.
- Olay 16:05–16:14Z: salt-okunur betik pooler'da (6543) oturum düzeyinde `default_transaction_read_only` açtı → prod'da 3 yazma
  hatası (2 kullanıcı). Geri alındı. Kural: ops betikleri 5432 veya transaction kapsamlı ayar (LESSONS_LEARNED).

## Güncel snapshot — 2026-10-02 (güvenlik + local-first hazırlık; CANLIYA ÇIKMADI, sürüm onayı bekliyor)
- Canlı hâlâ `c3476a0`. Dal `perf/vercel-active-cpu` (push edilmedi): `93675ec` auth fail-closed + AI_AGENT sıfırlama
  engeli, `81f8664` seed ikinci kurum düzeltmesi, `f8452e4` başlangıç şifresiyle girişte zorunlu şifre yenileme
  (`/sifre-yenile`, token `pwc`, API 403, migration YOK). Yerel izole DB provaları: AI_AGENT 9/9, zorunlu yenileme 14/14.
- Altyapı (uygulandı): preview'lar Vercel Authentication ile korunuyor; kullanılmayan "Test Hook" kaldırıldı.
  Yerel `.env`/`.env.local` DB hedefleri `neviihub_dev`'e çevrildi (yedek `~/NeviiHub-Secrets/env-backup-2026-10-02`);
  eski test DB adresi `~/NeviiHub-Secrets/old-test-db-session-url` (geri dönüş betikleri buradan okur).
- Canlı hesap denetimi: 25 aktif hesaptan 19'u kaynak koddaki başlangıç şifresinde (3 yönetici, 7 öğretmen, 9 demo
  öğrenci `email.com`). AI_AGENT alanı `notaplan.app` DNS'te kayıtsız. Owner kararı: demo hesaplar + AI_AGENT pasife.
- Entegrasyon: Supabase Marketplace entegrasyonunun 13 production değişkeni kodda/build'de/bağımlılıkta kullanılmıyor;
  kaldırma ayrı onay. CI `main`'de lint'te kırmızı (mobil), testler CI'da çalışmıyor.
- Vercel Hobby resmî belgeye göre yalnız ticari olmayan kullanım içindir; NeviiHub ticari kullanım → Pro owner kararı.
- AI asistan: ayrı dal `feat/ai-free-provider-chain` (`../nevii-hub-ai`, 4 commit), inceleme + anahtar + KVKK kararı bekliyor.

## Güncel snapshot — 2026-10-01 (canlı geçiş, Vercel Active CPU, local-first)
- Canlı geçiş tamam (10:50Z): `neviihub.com` = `main`, Vercel `fra1`, DB Supabase `wsbucznpujcfzhitzrbl`. Eski test DB
  `vxzewyiwfshobjizzetw` gerçek veri taşıyan salt-okunur geri dönüş kaynağı (≥2026-10-31). `test.neviihub.com` → 307.
- Next.js 16.3.8 güvenlik yaması canlıda (`a7bbb7c`). AI_AGENT hesabı kilitlendi (rastgele şifre, oturumlar iptal).
- Vercel Hobby "Fluid Active CPU %75" (son 30 gün): kök neden Link önyüklemesi (sayfa başına ~50 sunucu isteği), 30 sn
  oturum yoklaması, production'da 45 sn canlı yenileme ve asistan çağrıları. Düzeltme: `@/components/link` (ESLint
  zorunlu), yoklama/yenileme 5 dk, sekmeye dönüş ≥60 sn, asistan `/chat` yalnız açılınca. Ölçüm: sayfa 55 → 5 istek.
- Korumalar: `test-target-guard` geçiş sonrası kimlikler; `assertSeedTarget` (6 seed betiği); migration kapısı artık
  `main` build'inde de (canlıda 90/90 migration uygulanmış).
- Yeni çalışma modeli: `docs/operations/LOCAL_FIRST_DEPLOYMENT.md` (sürekli test ortamı yok; risk sınıfına göre yol).
- Açık: AI asistan ücretsiz sağlayıcı zinciri (dal `feat/ai-free-provider-chain`, worktree `../nevii-hub-ai`);
  owner kararları (Vercel Pro/ticari kullanım, preview koruması, eski Supabase–Vercel entegrasyonu, eski projeler,
  yerel gerçek veri kopyaları, 20 hesapta varsayılan şifre).

## Güncel snapshot — 2026-09-30 (Supabase Database egress: hedefli okumalar)
- Kanıt (test DB `pg_stat_statements`, 09-05→09-30): egress'in çoğu `readData()` tam hidrasyonu (Payment/Lesson/Student)
  + `School.logoUrl` ~79 KB data-URI'nin panel isteği başına ~5 kez okunması (`listTenants`, `getPlatformTenant`, `readData`).
- Dilimler tek yerde: `src/lib/reference-data.ts` (Reference / StudentScope / LessonWindow / StudentList / PaymentsPage);
  store-db Prisma ile ÜRETİR, json/memory tam veriden TÜRETİR. Ağır koleksiyonu olmayan tip → yanlış kullanım DERLENMEZ.
- Yeni okuma API'leri: `readStudentById`, `readReferenceData`, `readStudentScope`, `readLessonWindow`,
  `readStudentListData`, `readPaymentsPageData`, tur 2: `readPayoutWindow` (Hakedişler, öğretmen portalı hakediş
  liste/detay), `readDashboardData` (Panel özeti) (+ `institution/context` `readScoped*`). Bildirim zili db'de SQL sayfalı.
- Tur 2: 21 store mutasyonu artık `return readData()` yapmaz (public sarmalayıcı `Promise<void>`); kariyer/İK kurum
  bilgisi tek okul satırı; portal canlı yenileme test/önizlemede 5 dk (production 45 sn aynen, `live-refresh.ts`).
- Bench: tur 1 21 akış 43.6 → 7.3 MB (−%83); tur 2 25 akış 12.5 → 5.9 MB (−%53), mutasyon 1.3 MB → 0.1 KB; görünen
  içerik aynı. Rapor: `docs/performance/DB_EGRESS_2026_09_30.md` (§4b tur 2, §5 kalan yollar).
- Doğrulama: `scripts/bench/verify-db-slices.ts` (2 185 kontrol, 0 hata), `db-egress-slices.test.ts`. Migration YOK.
- Supabase: Free plan 5 GB; 08 Eyl–08 Eki döngüsü 11.32 GB. Kısıtlama 30 Eki 2026'dan itibaren (kota aşımı sürerse).
- Açık (öncelik): Telafi, Öğretmenler (kart TÜM ZAMAN ders sayısı — pencere yasak), panel öğretmen detayı +
  `computeTeacherPayoutTool` (`describeLineSources` dönem dışı ders + seri ister), `/panel/odemeler/[id]`, makbuz,
  dönüşü kullanılan 9 mutasyon. Kural: yeni ekran `readData()` yerine uygun dilimi kullanır.

## Güncel snapshot — 2026-09-30 (%100 burslu kayıt + 0 TL ilk tahsilat, Odalar filtreleri)
- Kök neden: `studentSchema.firstPaymentCollected.amount` `positive()` → 0 reddediliyor, hata `firstPaymentCollected`
  anahtarına düşüp formda alan mesajı olmadan genel "Formda düzeltilmesi gereken alanlar var" çıkıyordu. Sözleşmede de
  `monthlyAmount <= 0` + "ilk tahsilat > 0" engeli vardı.
- Kural: boş tutar ≠ 0 (`parseRegistrationFirstPaymentForm`). 0 yalnız önerilen ilk tahsilat 0 iken geçerli; Payment
  satırı YAZILMAZ (audit `student.first_payment_waived`), yöntem/tarih istenmez. Tutar > 0 → yöntem+tarih zorunlu (alan bazlı).
- Sözleşme: aylık 0 kabul; toplam 0 ve kayıt ödemesi yoksa (`fullyWaived`) ilk tahsilat istenmez, taksit Payment satırı yok.
- Ödeme Profili: `isPercentDiscount` — kayıt motorunun "percent" indirimi TL sanılıyordu (%100 → "₺100, net 6.900").
- Odalar: GET filtreleri (ad, şube, durum aktif/pasif/tümü, enstrüman), boş durum + temizle; ayrı "Pasif Odalar" kartı kaldırıldı.
- Migration YOK. Test: `scholarship-zero-first-payment.test.ts`, `room-filters.test.ts`.

## Güncel snapshot — 2026-09-30 (geçmiş tarihe telafi, gerekçe opsiyonel)
- Owner kararı: telafi geçmiş tarihe planlanabilir, ALT SINIR YOK (kaçan dersten önce de); üst sınır talebin son
  kullanım günü; süresi dolmuş talep planlanamaz (`REQUEST_EXPIRED`, validateLessonSlot — eskiden PAST_START dolaylı kapatıyordu).
- Onayda planlama gerekçesi isteğe bağlı (boş → saklanmaz, ekranda "—"); iptal/ret notu zorunlu kalır.
- Telafi önerisi yalnız talebin şubesindeki aktif odalar (başka şubeye düşme kaldırıldı). Test: `makeup-past-date.test.ts`.

## Güncel snapshot — 2026-09-30 (zorla açık gün, Telafi Merkezi, planlanan telafi, sözleşme bitiş bildirimi)
- Zorla açık gün: istisnalar artık her store modunun readData'sında + dar dilimde (`withClosedDayOverrides`);
  öneri motorları `isSuggestableWorkDay` (çalışma günü tercihi + zorla açık gün her zaman aday).
- Oda: `validateLessonSlot` → `ROOM_INACTIVE`; telafi önerisi yalnız aktif oda, şubede yoksa gerekçeli diğer şube.
- Statü: `makeup_planned` (turuncu #ea580c) = Telafi Merkezi'nden planlanan ders; kaçan ders `makeup` (sarı);
  işlenen telafi dersi yoklama statüsünü gösterir. Hakediş/yoklama verisi değişmedi.
- Telafi Merkezi yeniden tasarım: aciliyet sıralı, filtre şeridi, öneri ekranda yeniden doğrulanır, "slot" yok.
- Sözleşme bitiş: kategori `student_contract_expiring`, süre `notifications.studentContractExpiryDays` (SettingOverride,
  varsayılan 15, migration YOK). Tetik: `notifications/tick` + yönetici bildirim listesini açınca günde bir kez.
- Açık: `attendance-calendar-tools` tahsilat testleri sıra-bağımlı kararsız (temel sürümde de kırılıyor);
  `trial-edit-notes-dashboard` 2 test temel sürümde de kırmızı.

## Güncel snapshot — 2026-09-30 (KRİTİK: Geldi/tamamlanmış dersler hakedişe girmiyordu)
- Kök neden: tek statü modelinde "Geldi" seçilen ders İşlendi olamıyor, hakediş yalnız İşlendi sayıyordu; DB'de
  `lessonProcessed=false` varsayılanı "Dersi bitir" (completed) dersleri de düşürüyordu (json/db parity).
- Owner kararı: hakediş = İşlendi ∪ Geldi ∪ completed; Telafi/Gelmedi/Mazeretli/iptal hariç. Tek nokta
  `isLessonProcessedForPayout` (lesson-ops.ts). Kayıtlı hakedişteki dersin Geldi'si de geri alınamaz (tools.ts).
- Veri değişikliği YOK, migration YOK. Testte mevcut 3 ödemesiz Eylül kaydı (Turgay/Olcay/DEMO) "güncel hesapla
  fark" gösterir — sessizce yeniden yazılmaz. Test: `payout-attended-lessons.test.ts`.
- Açık: İşlendi/Geldi → Telafi geçişi kayıtlı hakediş döneminde engellenmiyor (donmuş kayıt değişmez, fark uyarısı çıkar).

## Güncel snapshot — 2026-09-30 (hakediş DEFTERİ yeniden tasarım + deneme enstrüman/veli adı)
- Model: `payout-ledger.ts` (saf) — net = döküm + düzeltmeler; kalan = net − ödemeler; durum türetilir
  (pending/partial/paid/cancelled). Ödeme/düzeltme silinmez → ters kayıt. `replaceTeacherPayout` sürüm kontrollü
  (`STALE_PAYOUT`). Kayıt `lineSnapshot` ile donar; `payoutDrift` = güncel hesap − kayıt.
- Politika kilidi KALDIRILDI: ödemesiz kayıt yeniden hesaplanır, ödemeli kayıt değişmez (fark → "recalc" düzeltme).
- Hariç tutma: `TeacherPayoutExclusion` (ders verisine dokunmaz). Ücret kuralı: kullanılmadıysa sil, yoksa devre dışı.
- 30/40/50 dışı süre bloklamaz (orantılı + "süre istisnası"). Deneme: enstrüman = katalog, `TrialLesson.parentName`.
- Migration (additive): `20260930090000_teacher_payout_ledger`. UAT: `docs/testing/UAT_2026_09_30_PAYOUT_LEDGER.md`.

## Güncel snapshot — 2026-09-29 (hakediş politikası + yoklama geri alma + MEB opsiyonel + deneme etiketleri)
- Hakediş: ay bazlı `TeacherPayoutPolicyPeriod` (mevcut / süreye göre sabit 30-40-50 TL). Kayıt yoksa mevcut politika;
  ayla kesişen hakediş kaydı varsa değişiklik kilitli. `TeacherPayout.pricingPolicy/pricingSnapshot` iz.
  Motor: `teacher-payout.ts` (`resolvePayoutPolicy`, `setPayoutPolicyForMonthData`); UI `/panel/hakedisler` kartı.
- Yoklama geri alma: `clearLessonOpsFlag` (lesson-ops.ts) + `clearLessonOpsFlagTool`, route `{action:"clear"}`.
- MEB alanları opsiyonel (`validateMebFields` yalnız biçim). Deneme etiketleri: Tekrar planlanacak / Kayıt olmayacak.
- Migration (additive): `20260929180000_teacher_payout_policy` — test DB'ye uygulandı. UAT:
  `docs/testing/UAT_2026_09_29_PAYOUT_POLICY_ATTENDANCE_UNDO.md`.

## Güncel snapshot — 2026-09-29 (güvenli silme standardı + ders planlama tarih çökmesi)
- **Kural (owner):** kullanıcıya "Sil" olarak sunulan her eylem sunucuda `guardCriticalDelete` (tools.ts) —
  SUPER_ADMIN/SCHOOL_ADMIN + kritik şifre + ≥5 karakter gerekçe; reddedilen deneme audit'e `denied`.
- Yeni: kampanya Sil (soft, `DiscountCampaign.deletedAt/deletedByUserId/deletionReason`), evrak Sil (yalnız
  arşivli + sözleşmesiz, `status=deleted`, dosya DB'de kalır). Gate eklenen: ders programdan sil, oda, deneme
  (öğretmen/şube müdürü artık silemez), imzalı sürüm kaldır, AI hafıza, İK KVKK anonimleştir.
- Migration (additive): `20260929100000_discount_campaign_soft_delete` — test DB'ye uygulanması push'tan önce.
- Tarih çökmesi: Ders Programı planlayıcısı, `toYmd` yıl dolgusu + `isCompleteDateOnlyInput`. Envanter/UAT:
  `docs/testing/UAT_2026_09_29_CRITICAL_DELETE.md`.
- Açık: imzalı sürüm "Kaldır" güncel dosya baytını siler (mevcut tasarım, yalnız güncel bayt saklanır) —
  yasal saklama için bayt-koruyan sürüm modeli ayrı karar. Platform (HYPER_ADMIN) silmeleri kurum şifresi dışı.

## Güncel snapshot — 2026-09-28 (MEB hub rework, TESTE YOLLANDI)
- **Dal:** `test` = `10026e5`, `origin/test`'e push edildi (fast-forward ace776d→10026e5).
  İçinde: MEB hub rework (4 dosya) + `c3d8e05` guardrails (owner'ın, 9 dosya no-store).
- **Migration yok (bu push):** `20260928180000_meb_student_fields` daha önce test DB'ye uygulandı (86/86).
- Kapı: typecheck temiz, MEB ESLint 0 hata. `test.neviihub.com` 200 (yeni deploy build'de; Vercel READY dashboard'dan).
- Kapsam-dışı kirli dosyalar el değmeden bırakıldı (apps/mobile, notion-export, .playwright-mcp vb.).
- UAT: `/panel/meb` hub + `/panel/meb/ogrenciler` alt ekran — tek parça liste tur kapanış mesajında.

## Ürün / kalıcı kararlar (yeniden tartışma)
- Çok kiracılı müzik okulu SaaS; Next.js 16 + Prisma/PostgreSQL; json/memory/db store parity (bkz. CLAUDE.md).
- Telafi: eğitim yılı başına 2 hak, kaçan dersten itibaren 30 gün. Ödeme penceresi: kart 1–5, havale/nakit 1–15, merkezi.
- KDV: fiyatlar KDV dahil ("Tüm eğitim ücretleri KDV dahildir."). Gerekçe: `docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`.
- Kritik işlem kapısı TEK: `checkCriticalPassword` + `canRunCriticalActions` (tools.ts).
- Rol modeli: tek HYPER_ADMIN platform sahibi; kurum sahibi SUPER_ADMIN.

## Güncel snapshot — 2026-09-28 (NeviiOS Control Center)
- **Dal:** `feat/neviios-control-recovery` → `test` (`e73aee9`). **Migration yok.**
  6 commit: mobil kontrol matrisi + marka doğrulama; Expo policy kapısı;
  kurum karşılama/logo-sanitize/önizleme; Homebrew Hacker + Gloock + control room;
  ayrı `/platform/giris` kapısı; kapı döngü düzeltmesi.
- Test deployment: Vercel Preview Ready, `test.neviihub.com` `e73aee9` sunuyor
  (`/platform/giris` 200 + kapı görünümü, `/platform` → kapıya, `/login` 200 aynen).
- Web: typecheck/lint temiz, hedefli 267 test + mobil 215 test geçti; tam suitte
  7 test 4 dosyada başarısız — temiz HEAD'de de kırık (önceden var): password-reset-ui,
  staff-onboarding, portal-access-management (6-8), seed-demo-schedule.
- Mobil: `apps/mobile` typecheck temiz (dep'ler kuruldu), cihaz/mağaza/EAS/push YOK.
- UAT: `docs/testing/UAT_2026_09_28_NEVIIOS_CONTROL_CENTER.md` (12 adım).
- Bulgu: route group üst layout'u devre dışı bırakmaz — kapı döngüsü yol başlığı
  (`x-neviios-path`) + kabuk muafiyetiyle çözüldü; Preview'da canlı doğrulandı.

## Güncel snapshot — 2026-09-28 (10. tur, DEPLOY EDİLDİ — site UAT sahibi bekliyor)
- **Dal:** `test` = `af25728` (10. tur 12 commit + 8 peer commit + 2 doc), `origin/test`'e push edildi.
  `20260928120000_email_templates` sahip tarafından test DB'ye uygulandı (`Database schema is up to date!`).
- **Deploy doğrulandı (public):** `test.neviihub.com` yeni sürümü sunuyor — yeni başlık + "Ders kaçmaz"
  işareti; `/login` 200; `/api/v1/health` 200 `healthy:true`; `/robots.txt`, `/sitemap.xml`,
  `/opengraph-image` (1200×630 PNG) 200. Kesin Vercel deployment SHA'sı dashboard'dan görülür; sunulan
  kod `af25728` ağacıyla eşleşiyor (son 2 commit yalnız doc).
- **Site UAT yapılamadı:** test hesabım yok — giriş gerektiren 4 akış (Demo A davet/çoklu seçim, gerçek
  davet e-postası logo+kod, sözleşme geri dönüşü, şablon yönetimi) denenemedi; tek parça UAT talimatı
  tur kapanış mesajında.
- Kalite: typecheck temiz, lint 0 hata, prisma validate geçerli; tam paket 3778 geçti, kalan 3 kırmızı
  tur-dışı (1 login-link tabanda kırık, 2 seed-demo sandbox `tsx EPERM`).
- UAT: `docs/testing/UAT_2026_09_28_ROUND_10.md`.

## Güncel snapshot — 2026-09-28 (9. tur)
- **Dal:** `feat/uat-round-9` → `test` (NeviiOS `05c172d` üstüne rebase). **Migration (additive):**
  `20260928090000_lesson_disruption_task_soft_delete` — **test DB'ye uygulandı 2026-09-28** (owner onayı; kayıt sayıları ve
  Lesson/Task parmak izleri önce/sonra aynı). UAT: `docs/testing/UAT_2026_09_28_ROUND_9.md`.
- Owner 2026-09-28: "Diğer" kaynaklı telafi öğrenci kotasından düşer; kaynak düzeltilince kota canlı yeniden hesaplanır
  (sayaç yok); "Diğer" öğretmen devamsızlığı yazmaz.
- Owner kararları (2026-09-27): paket/iş silme = mevcut kritik işlem şifresi, SUPER_ADMIN+SCHOOL_ADMIN; öğretmen/kurum
  kaynaklı telafi öğrencinin kişisel hakkından düşmez; öğretmen devamsızlığında otomatik hakediş kesintisi yok;
  **tahsil edilen = `collectedAmountOf` (kısmi dahil)** — tüm finans ekranları bu tek fonksiyon.
- Koyu tema token düzeyinde: obsidyende Tailwind palet değişkenleri yeniden eşlenir (globals.css); yazdırma sayfaları
  `.print-light-palette` ile açık palete sabit. axe (11 sayfa): koyu 35→0, açık 12→10 (kalan 10 eski).
- Kapsamlar: `payment-scope.ts` (Ödemeler aktif/pasif/tüm), `payout-overview.ts` (Hakediş). Geri dönüş: `withReturnTo`/`returnToLabel`.
- İptal/Telafi kaynağı: `lesson-disruption.ts` (öğretmen katılımından ayrı); öğretmen raporu `teacher-attendance-report.ts`.
- Oda düzenleme (owner ek isteği): `room-revision.ts` + `RoomEditDialog`.

## Güncel snapshot — 2026-09-27 (NeviiOS erişim)
- **Dal:** `feat/neviios-control-recovery` → `test`. Yeni migration yok. HYPER_ADMIN satırı YAZILMADI: canlı deployment'ın Supabase kimliği Vercel Secret olduğu için doğrulanamadı. Yerel `~/Projects/nevii-hub/.env` production ref'ine gider; ona sorgu/yazım yok.
- Platform kabuğu, kayıtlı tema yoksa koyu yeşil token kullanır (`neviios-theme.css`). `globals.css`, `ui.tsx`, `sidebar.tsx` bu turda değişmedi.
- Kurum özeti tenant kimliğiyle okul kaydını yan yana gösterir; ad farkını yazar, düzeltmez. Dil: `locale.language` tenant override + `Tenant.language`. Giriş, sıfırlama sayfası ve sıfırlama e-postası bu dili izler. Panelin geri kalanı Türkçe.
- Şifre yazımı `sessionsRevokedAt` basar. SMTP canlıda doğrulanamadı; anahtarlar `.env.example` içinde. SPF `include:_spf.mx.cloudflare.net`. DKIM/DMARC bu oturumda doğrulanamadı.
- Önceki 8. tur notu: `feat/uat-round-8` migration `20260927090000_room_soft_delete` test DB'ye uygulandı (owner). Claude'un 9. tur kirli paneli ayrı worktree'de duruyor.

## Ortamlar
- Canlı: `main` → Vercel `neviihub` (Hobby, `fra1`) → `neviihub.com`; DB Supabase `wsbucznpujcfzhitzrbl` (eu-central-1).
- Test: sürekli test ortamı YOK (local-first). `test.neviihub.com` geçici olarak canlıya yönlenir; `test` dalı
  preview'ları eski test DB'sini (salt-okunur) kullanır ve Vercel Authentication ile korunur. Yerel DB `neviihub_dev`.
- Yerel `.env` artık olmayan bir projeyi veya canlıyı gösterebilir — DB komutundan önce hedefi kanıtla.
- Vercel Cron: günlük 00:30 UTC retention (`vercel.json`, `CRON_SECRET`).

## Açık iş
- Öğretmen e-posta senkronizasyonu PR'ı için owner incelemesi; migration ve yayın ayrıca onay bekler.
- Owner UAT: 9. tur (`UAT_2026_09_28_ROUND_9.md`).
- Mobil panel: yan menü 390 px'te de 256 px sabit (çekmece yok) — ayrı tur önerisi.
- Açık temada 10 eski kontrast ihlali (Evraklar küçük altın link, Öğrenciler soluk sayfalama, Özet gri alt yazı).
- Önceki turlardan: owner UAT 4–8; Pınar/Olcay Evka 3; geçmiş sözleşmeler (hukuki); `[neviios] platform store` timeout; mobil EAS build.

## Riskler / bilinen durum
- Tam paket 2026-10-01 (`390978b`): 386 dosya / 4053 test, 7 başarısız = bilinen taban (13'lük kümenin alt kümesi).
- Denetim kaydı json modunda da Prisma'ya yazmaya çalışır; yerel tarayıcı testinde `DATABASE_URL`'i geçersiz adrese
  yönlendirin (bu turda böyle yapıldı — gerçek DB'ye yazım olmadı).
- `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş; güncel durum burası.
