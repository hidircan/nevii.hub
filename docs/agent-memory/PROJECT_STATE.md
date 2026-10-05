# NeviiHub — Güncel snapshot (resume-from-here)

Kısa tutulur (~50 satır): oturum sonunda yalnız "Güncel snapshot" bölümünün ÜZERİNE yazılır; eski snapshot
`archive/`'e taşınır. Ayrıntı → ilgili `docs/testing/UAT_*.md`, `docs/operations/*`. Yönlendirici: `nevii-hub` skill.
Tam tarihçe (2026-08-30 → 09-24): `archive/PROJECT_STATE_LOG_2026-08-30_to_2026-09-24.md`.

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
- Owner UAT: 9. tur (`UAT_2026_09_28_ROUND_9.md`).
- Mobil panel: yan menü 390 px'te de 256 px sabit (çekmece yok) — ayrı tur önerisi.
- Açık temada 10 eski kontrast ihlali (Evraklar küçük altın link, Öğrenciler soluk sayfalama, Özet gri alt yazı).
- Önceki turlardan: owner UAT 4–8; Pınar/Olcay Evka 3; geçmiş sözleşmeler (hukuki); `[neviios] platform store` timeout; mobil EAS build.

## Riskler / bilinen durum
- Tam paket 2026-10-01 (`390978b`): 386 dosya / 4053 test, 7 başarısız = bilinen taban (13'lük kümenin alt kümesi).
- Denetim kaydı json modunda da Prisma'ya yazmaya çalışır; yerel tarayıcı testinde `DATABASE_URL`'i geçersiz adrese
  yönlendirin (bu turda böyle yapıldı — gerçek DB'ye yazım olmadı).
- `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş; güncel durum burası.
