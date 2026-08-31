# KNOWN_GAPS.md

Kodda doğrulanmış eksikler, teknik borçlar, çelişkiler. Tahmin yazılmaz.
Son büyük tarama: 2026-08-31 (CEO'nun canlıya alma önceliği talebi üzerine).

## 🔴 KRİTİK — Canlıya almayı doğrudan engeller

1. **Supabase production veritabanı BOŞ.** `list_tables` ile DOĞRULANDI: proje
   `uqkafczrplqitzumtrqy` ("Maestron Project", Postgres 17, ap-southeast-1)
   `public` şemasında SIFIR tablo içeriyor — hiçbir Prisma migration
   uygulanmamış. `.env` dosyasında `NEXT_PUBLIC_SUPABASE_URL` bile TANIMLI
   DEĞİL, `DATABASE_URL` yerel `localhost:5432`'ye işaret ediyor (Supabase
   değil). **Sonuç: Nevii Hub şu an teknik olarak canlıda DEĞİL — gerçek bir
   üretim veritabanına hiç bağlı olmadı.** **Tekrar doğrulandı
   (2026-08-31, ikinci tur):** `mcp__Supabase__list_tables` aynı proje
   için tekrar çağrıldı, sonuç yine `public` şemasında sıfır tablo —
   durum değişmemiş, ama bu her go-live denemesinden hemen önce TEKRAR
   kontrol edilmeli (statik bir gerçek değil, kritik ve değişebilir bir
   durum olarak ele alınmalı — bkz. `TASK_BOARD.md` go-live sırası
   adım 2).
2. **Nilüfer Acar'ın 94 öğrencisi + 8 öğretmeni yalnızca yerel bir dosyada
   yaşıyor.** `STORE_MODE=json` (`.env.local`), veri
   `data/store.json`'da — CEO'nun bilgisayarındaki bu proje klasöründe.
   Supabase'e hiç taşınmadı. Bu makine kaybolursa/klasör silinirse VERİ
   KAYBOLUR — hiçbir bulut yedeği yok (bkz. Karar gereken §aşağıda).
3. **Vercel projesi mevcut ("notaplan", `notaplan.vercel.app`) ama takım
   planı "hobby".** Vercel Hobby planı ticari kullanım için tasarlanmamıştır
   — CEO bunu bilerek, go-live'a daha yakın bir zamana ERTELEMEYE karar
   verdi (2026-08-31, bkz. DECISIONS.md). Durum: Açık, bilinçli erteleme.
   Ayrıca: **neviihub.com domaini CEO tarafından Cloudflare'den satın
   alındı** (Vercel'den değil) — DNS henüz Vercel'e yönlendirilmedi.

## 🟠 Yüksek — CEO kararı gerekli

4. **`AGENTS.md` eksikliği — ÇÖZÜLDÜ (2026-08-31).** Commit `4ab2f3d`'de
   (ilgisiz bir bugfix'in içinde, muhtemelen kazara) 383 satır komple
   silinmişti. `f2fe8d8`'den geri getirildi, marka adı ve MySQL atfı
   güncellendi. Durum: Çözüldü.
5. **`DATABASE_ARCHITECTURE.md` MySQL/MariaDB anlatısı — ÇÖZÜLDÜ (2026-08-31,
   §1/§2/§7.4/§15/§18).** Gerçek: `provider = "postgresql"`, `@prisma/adapter-pg`,
   Supabase Postgres 17 — koddan DOĞRULANDI. Bazı alt bölümler (mysqldump/CI
   detayları) hâlâ DOĞRULANMADI etiketli, DevOps tarafından tamamlanmalı.
6. **`PROJECT.md` §12 ve `DEVOPS_GUIDE.md` AYNI eski MySQL/MariaDB varsayımını
   taşıyor olabilir** — bu turda düzeltilmedi (kapsam: yalnızca
   DATABASE_ARCHITECTURE.md + .env.example istendiği için). Durum: Açık,
   ayrı görev.
7. **Yeni öğrenci kaydında "davet e-postası gönder" sessizce başarısız
   oluyordu — ÇÖZÜLDÜ (2026-08-31).** Kök neden: `actions.ts`
   `actionAddStudent`, `inviteStudentPortalAccessTool`'un `ServiceResult`
   dönüşünü HİÇ kontrol etmiyordu (`ok`/`fail` deseni throw etmez, bu yüzden
   `try/catch` hiçbir şey yakalamıyordu) VE başarı durumunda hemen
   `redirect()` çalıştığı için sonucu UI'a taşıyacak bir mekanizma da yoktu.
   Düzeltme: sonuç yakalanıp `davetUyari` query param'ıyla başarı paneline
   taşınıyor, admin artık "davet gönderilemedi: <sebep>" uyarısı görüyor.
   Değişen dosyalar: `src/lib/actions.ts`,
   `src/components/registration-success-panel.tsx`,
   `src/app/panel/ogrenciler/[studentId]/page.tsx`,
   `src/app/panel/ogrenciler/[studentId]/sozlesmeler/page.tsx`. `tsc --noEmit`
   temiz; `vitest`/`tsx` bu ortamda native-binding hatası verdiği için
   ÇALIŞTIRILAMADI (bkz. madde 10) — CEO'nun kendi makinesinde
   `npm test src/lib/__tests__/account-invitation.test.ts` ile teyit
   edilmeli.
8. **Öğrenci/öğretmen numaralandırma (displayId) — ÇÖZÜLDÜ (2026-08-31).**
   78 öğrenci (S00017–S00094) ve 7 öğretmen (T00002–T00008) geriye dönük
   numaralandırıldı — `scripts/backfill-display-ids.ts` ile AYNI mantık,
   idempotent, yalnızca boş `displayId` alanlarına dokunuldu. Yeni kayıtlar
   zaten otomatik numara alıyor (`store-json.ts`/`store-db.ts`/
   `store-memory.ts`'te DOĞRULANDI, backfill'den önce de böyleydi).
9. **KVKK + fotoğraf/video rızası ana sözleşmeyle birleşik sunum + e-postaya
   PDF/link ekleme** — henüz UYGULANMADI, plan CEO'ya sunuldu (bkz.
   `docs/project-brain/FINANCE_CONTRACTS.md` ve bu oturumun sohbet
   raporu). Kaynak metin (`student-enrollment-3008.md`) zaten üç bölümü
   (sözleşme+KVKK aydınlatma+foto-video rıza) TEK dosyada birleşik
   içeriyor — CEO'nun tarif ettiğiyle DOĞRULANDI eşleşiyor. PDF eki için
   Puppeteer altyapısı hâlâ YOK (önceden de biliniyordu, bkz. TASK_BOARD.md)
   — "ayrı link" alternatifi altyapısal olarak daha ucuz/hızlı.
10. **Bu ajan ortamında `vitest`/`tsx` çalıştırılamıyor** (`Cannot find
    native binding` — rolldown/esbuild, muhtemelen Mac↔Linux VM mimari
    uyuşmazlığı). `tsc --noEmit` ÇALIŞIYOR (native binding gerektirmiyor).
    Bu, Chrome/Playwright kısıtıyla AYNI kategoriden bir ortam sınırı — kod
    hatası DEĞİL. CEO'nun kendi Mac terminalinde bu komutlar normal
    çalışıyor olmalı.

16. **Portal Erişim Yönetimi eklendi + ÜÇ gerçek hata düzeltildi
    (2026-08-31) — ÇÖZÜLDÜ.** (a) `authenticateUser`'ın json/memory modu
    (bugün production'ın kullandığı mod) yeni `User.active`/`activeOverrides`
    kontrolünü hiç yapmıyordu — erişimi kapatmak yalnızca ekranda
    gösteriliyordu, girişi GERÇEKTEN engellemiyordu; düzeltildi. (b)
    `POST /api/v1/auth/forgot-password` (self-servis "şifremi unuttum")
    token üretiyordu ama GERÇEKTEN e-posta göndermiyordu; düzeltildi. (c)
    **EN KRİTİK (CEO'nun gerçek panelde bizzat karşılaştığı hata):**
    `provisionEntityLogin` (`src/lib/auth/users.ts`) yalnızca `STORE_MODE=db`'de
    yeni bir `User` satırı oluşturabiliyordu — "json/memory üretimde
    kullanılmıyor" yanlış varsayımına dayanıyordu. Gerçekte bugünkü tek
    üretim modu `json` (bkz. madde 1-2) ve `HASHED`/BOOTSTRAP dizisi yalnızca
    ~15 demo hesabı kapsıyor — yani BOOTSTRAP'te olmayan (neredeyse TÜM
    gerçek) öğrenci/öğretmen için "Portal daveti gönder" HER ZAMAN "Kullanıcı
    hesabı oluşturulamadı/bulunamadı" hatasıyla başarısız oluyordu. Düzeltme:
    yeni `src/lib/auth/dynamic-users.ts` — `StudentPortalAccess`/
    `PasswordResetToken` ile AYNI dosya-tabanlı kalıcı depo deseni — json/memory
    modunda ÇALIŞMA ZAMANINDA gerçek `User` satırı oluşturabiliyor artık.
    `authenticateUser`, `getUserIdByEmail`, `getUserById`,
    `getUserAccountStatus(ForTeacher)`, `setUserActive`, `updatePasswordHash`,
    `changeOwnPassword`, `findUserByEmail`, `getUserIdByTeacherId`,
    `getUserIdByStudentId` bu yeni depoyu da kontrol edecek şekilde
    güncellendi. Ayrıca: eski/bozuk `StudentPortalAccess` ilişkileri (User
    kaydı hiç yoksa) artık admin yeniden davet gönderdiğinde additive/idempotent
    biçimde "revoked" olarak onarılıyor (veri SİLİNMEZ). Detay:
    `DECISIONS.md` "Portal Erişim Yönetimi" bölümü,
    `AUTH_SECURITY_RBAC.md`, `COMMUNICATIONS.md`. `tsc --noEmit` temiz;
    `vitest` bu ortamda madde 10'daki native-binding kısıtı nedeniyle
    ÇALIŞTIRILAMADI — CEO'nun kendi makinesinde
    `npm test src/lib/__tests__/portal-access-management.test.ts` ile
    teyit edilmeli (CEO'nun kendi çalıştırmasında bulduğu 4 başarısız test
    de bu turda ayrıca düzeltildi — bkz. DECISIONS.md).

## 🟡 Orta — koddan doğrulanmış, iş kararı bekliyor

11. "Ödeme Şekli" sütunu, Puppeteer PDF sayfa numaraları, aynı-gün iptal UI,
    tam ZIP+CSV içe aktarma — değişmedi, bkz. TASK_BOARD.md.
12. Supabase projesinin görünen adı hâlâ "Maestron Project" (eski marka) —
    kozmetik, Supabase panelinden yeniden adlandırılabilir, kod etkilenmez.
13. `.docx` dışında `.doc`/`.pdf`/`.md` şablon yükleme desteklenmiyor
    (`uploadDocumentTemplateDocxTool` yalnızca `.docx` kabul ediyor,
    DOĞRULANDI) — CEO'nun md/pdf yükleme isteği için genişletme gerekiyor.

## 🟢 Düşük

14. 9 adet prunable worktree, kimin elinde belirsiz — CEO onayı gerektirir.
15. `.git/index.lock` bir kez anlık görüldü (bu turda git komutları yine de
    sorunsuz çalıştı) — izlemeye değer, aksiyon alınmadı.
