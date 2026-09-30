# NeviiHub — Güncel snapshot (resume-from-here)

Kısa tutulur (~50 satır): oturum sonunda yalnız "Güncel snapshot" bölümünün ÜZERİNE yazılır; eski snapshot
`archive/`'e taşınır. Ayrıntı → ilgili `docs/testing/UAT_*.md`, `docs/operations/*`. Yönlendirici: `nevii-hub` skill.
Tam tarihçe (2026-08-30 → 09-24): `archive/PROJECT_STATE_LOG_2026-08-30_to_2026-09-24.md`.

## Güncel snapshot — 2026-09-30 (Supabase Database egress: hedefli okumalar)
- Kanıt (test DB `pg_stat_statements`, 09-05→09-30): egress'in çoğu `readData()` tam hidrasyonu (Payment/Lesson/Student)
  + `School.logoUrl` ~79 KB data-URI'nin panel isteği başına ~5 kez okunması (`listTenants`, `getPlatformTenant`, `readData`).
- Dilimler tek yerde: `src/lib/reference-data.ts` (Reference / StudentScope / LessonWindow / StudentList / PaymentsPage);
  store-db Prisma ile ÜRETİR, json/memory tam veriden TÜRETİR. Ağır koleksiyonu olmayan tip → yanlış kullanım DERLENMEZ.
- Yeni okuma API'leri: `readStudentById`, `readReferenceData`, `readStudentScope`, `readLessonWindow`,
  `readStudentListData`, `readPaymentsPageData` (+ `institution/context` `readScoped*` karşılıkları). Bildirim zili db'de SQL sayfalı.
- Bench (yerel, test hacmi, 21 akış): 43.6 MB → 7.3 MB (−%83), görünen içerik aynı. Rapor: `docs/performance/DB_EGRESS_2026_09_30.md`.
- Doğrulama: `scripts/bench/verify-db-slices.ts` (2 081 kontrol, 0 hata), `db-egress-slices.test.ts`. Migration YOK.
- Açık (öncelik): Panel özeti, Hakedişler, Telafi, Öğretmenler (kart TÜM ZAMAN ders sayısı gösterir — pencere yasak),
  öğretmen detay sekmeleri, portal duyuru aracı. Kural: yeni ekran `readData()` yerine uygun dilimi kullanır.

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
- Test: `test` dalı → Vercel → `test.neviihub.com`; test DB Supabase `vxzewyiwfshobjizzetw` (repo migration'ları uygulandı,
  son kontrol 2026-09-21; 22–23.09 additive migration'ları için `docs/operations/RUNBOOK_2026_09_22_CSV_CONTRACT_DELETE.md`).
- Production: dokunulmaz (owner kararı). Yerel `.env` production'ı gösterebilir — DB komutundan önce hedefi kanıtla.
- Vercel Cron: günlük 00:30 UTC retention (`vercel.json`, `CRON_SECRET`).

## Açık iş
- Owner UAT: 9. tur (`UAT_2026_09_28_ROUND_9.md`).
- Mobil panel: yan menü 390 px'te de 256 px sabit (çekmece yok) — ayrı tur önerisi.
- Açık temada 10 eski kontrast ihlali (Evraklar küçük altın link, Öğrenciler soluk sayfalama, Özet gri alt yazı).
- Önceki turlardan: owner UAT 4–8; Pınar/Olcay Evka 3; geçmiş sözleşmeler (hukuki); `[neviios] platform store` timeout; mobil EAS build.

## Riskler / bilinen durum
- Tam paket 2026-09-28: 345 dosya / 3653 test, 0 başarısız (J2 tarihe bağlı kırmızısı kök nedeniyle düzeltildi).
- Denetim kaydı json modunda da Prisma'ya yazmaya çalışır; yerel tarayıcı testinde `DATABASE_URL`'i geçersiz adrese
  yönlendirin (bu turda böyle yapıldı — gerçek DB'ye yazım olmadı).
- `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş; güncel durum burası.
