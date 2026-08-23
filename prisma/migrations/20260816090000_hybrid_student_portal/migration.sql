-- Karma Öğrenci Portalı (GUARDIAN/SELF erişim modeli). Additive, idempotent
-- (IF NOT EXISTS). Ayrı "Veli Portalı" ürünü kaldırılıyor ama User.role='PARENT'
-- satırları SİLİNMİYOR — bu migration onları STUDENT'a çevirip karşılığında
-- StudentPortalAccess(accessType=GUARDIAN, status=active) oluşturuyor.

-- ============================================================
-- 1) Student — sorumluluk tipi + parentName/parentPhone nullable
-- ============================================================

ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "accountResponsibility" TEXT NOT NULL DEFAULT 'PARENT_MANAGED';

ALTER TABLE "Student" ALTER COLUMN "parentName" DROP NOT NULL;
ALTER TABLE "Student" ALTER COLUMN "parentPhone" DROP NOT NULL;

-- Backfill: veli telefonu/adı olmayan (görünürde velisiz) mevcut kayıtlar
-- SELF_MANAGED işaretlenir — veri kaybı yok, yönetici panelden düzeltebilir.
UPDATE "Student"
SET "accountResponsibility" = 'SELF_MANAGED'
WHERE (COALESCE("parentPhone", '') = '' AND COALESCE("parentName", '') = '')
  AND "accountResponsibility" = 'PARENT_MANAGED';

-- ============================================================
-- 2) StudentPortalAccess — yeni erişim tablosu
-- ============================================================

CREATE TABLE IF NOT EXISTS "StudentPortalAccess" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "accessType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'invited',
  "invitedBy" TEXT,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudentPortalAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudentPortalAccess_tenantId_userId_studentId_key"
  ON "StudentPortalAccess"("tenantId", "userId", "studentId");

CREATE INDEX IF NOT EXISTS "StudentPortalAccess_tenantId_studentId_idx"
  ON "StudentPortalAccess"("tenantId", "studentId");

CREATE INDEX IF NOT EXISTS "StudentPortalAccess_tenantId_userId_idx"
  ON "StudentPortalAccess"("tenantId", "userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentPortalAccess_tenantId_fkey'
  ) THEN
    ALTER TABLE "StudentPortalAccess"
      ADD CONSTRAINT "StudentPortalAccess_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 3) Mevcut STUDENT rolündeki kullanıcılar için SELF backfill
--    KRİTİK: canAccessStudent artık STUDENT rolü için StudentPortalAccess
--    ZORUNLU KILIYOR (eskiden ctx.studentId karşılaştırması yeterliydi).
--    Bu backfill YOKSA, migration sonrası TÜM mevcut öğrenci-kendisi
--    hesapları kendi verilerine erişimi KAYBEDER.
-- ============================================================

INSERT INTO "StudentPortalAccess"
  ("id", "tenantId", "userId", "studentId", "accessType", "status", "invitedAt", "activatedAt", "createdAt", "updatedAt")
SELECT
  'spa_' || substr(md5(u."id" || ':' || u."studentId" || ':self'), 1, 20),
  u."tenantId",
  u."id",
  u."studentId",
  'SELF',
  'active',
  u."createdAt",
  u."createdAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'STUDENT'
  AND u."studentId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Student" s WHERE s."id" = u."studentId" AND s."tenantId" = u."tenantId"
  )
ON CONFLICT ("tenantId", "userId", "studentId") DO NOTHING;

-- ============================================================
-- 4) PARENT -> STUDENT backfill + StudentPortalAccess oluşturma
--    (yalnızca User tablosu zaten var ve role sütunu mevcutsa çalışır)
--
--    GÜVENLİK: yalnızca studentId GEÇERLİ (NULL değil VE aynı tenant'ta
--    var olan bir Student'a işaret ediyor) olan PARENT satırları
--    dönüştürülür. studentId'si boş/geçersiz bir PARENT satırı için hangi
--    öğrenciye GUARDIAN erişimi verileceği bilinmez — bu satırlar
--    role='PARENT' olarak BIRAKILIR (dönüştürülmez) ve migration ÖNCESİ
--    preflight sorgusuyla (bkz. final rapor §3) manuel incelemeye
--    ayrılmalıdır. STUDENT rolüne geçiş, o kullanıcı için
--    StudentPortalAccess kaydının BAŞARIYLA oluşmuş/var olmuş olması
--    şartına bağlıdır — bir kullanıcı hiçbir zaman "erişimi olmayan
--    STUDENT" olarak bırakılmaz.
-- ============================================================

INSERT INTO "StudentPortalAccess"
  ("id", "tenantId", "userId", "studentId", "accessType", "status", "invitedAt", "activatedAt", "createdAt", "updatedAt")
SELECT
  'spa_' || substr(md5(u."id" || ':' || u."studentId"), 1, 20),
  u."tenantId",
  u."id",
  u."studentId",
  'GUARDIAN',
  'active',
  u."createdAt",
  u."createdAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'PARENT'
  AND u."studentId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Student" s WHERE s."id" = u."studentId" AND s."tenantId" = u."tenantId"
  )
ON CONFLICT ("tenantId", "userId", "studentId") DO NOTHING;

UPDATE "User" u
SET "role" = 'STUDENT'
WHERE u."role" = 'PARENT'
  AND u."studentId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Student" s WHERE s."id" = u."studentId" AND s."tenantId" = u."tenantId"
  )
  AND EXISTS (
    SELECT 1 FROM "StudentPortalAccess" spa
    WHERE spa."tenantId" = u."tenantId"
      AND spa."userId" = u."id"
      AND spa."studentId" = u."studentId"
      AND spa."status" = 'active'
  );

-- Bilinçli olarak DOKUNULMAYAN satırlar: studentId NULL/geçersiz olduğu
-- için hâlâ role='PARENT' olan kullanıcılar — bkz. yukarıdaki yorum.
-- Bu migration onları SESSİZCE atlar (uygulamada hatalı davranışa yol
-- açmaz, sadece o hesap eski haliyle kalır); admin preflight raporuyla
-- bunları migration'dan ÖNCE tespit edip stüdentId'lerini düzeltmeli veya
-- hesabı devre dışı bırakmalıdır.

-- ============================================================
-- 5) PaymentCheckoutAttempt — online kredi kartı checkout izleme
--    (Payment tablosuna hiçbir alan eklenmiyor, ayrı tablo)
-- ============================================================

CREATE TABLE IF NOT EXISTS "PaymentCheckoutAttempt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "initiatedByUserId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerReference" TEXT,
  "checkoutUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentCheckoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentCheckoutAttempt_tenantId_idempotencyKey_key"
  ON "PaymentCheckoutAttempt"("tenantId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "PaymentCheckoutAttempt_tenantId_paymentId_idx"
  ON "PaymentCheckoutAttempt"("tenantId", "paymentId");

CREATE INDEX IF NOT EXISTS "PaymentCheckoutAttempt_tenantId_studentId_idx"
  ON "PaymentCheckoutAttempt"("tenantId", "studentId");

CREATE INDEX IF NOT EXISTS "PaymentCheckoutAttempt_tenantId_providerReference_idx"
  ON "PaymentCheckoutAttempt"("tenantId", "providerReference");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaymentCheckoutAttempt_tenantId_fkey'
  ) THEN
    ALTER TABLE "PaymentCheckoutAttempt"
      ADD CONSTRAINT "PaymentCheckoutAttempt_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
