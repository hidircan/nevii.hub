ALTER TABLE "User"
ADD COLUMN "invitationPending" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PasswordResetToken"
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'password_reset';

UPDATE "PasswordResetToken"
SET "purpose" = 'invitation'
WHERE "expiresAt" > "createdAt" + INTERVAL '6 days';

UPDATE "User" AS u
SET "invitationPending" = true
WHERE u."role" = 'TEACHER'
  AND EXISTS (
    SELECT 1
    FROM "PasswordResetToken" AS token
    WHERE token."tenantId" = u."tenantId"
      AND token."userId" = u."id"
      AND token."purpose" = 'invitation'
      AND token."usedAt" IS NULL
  );
