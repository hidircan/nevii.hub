-- 1-2 aylık "tanışma" (trial) kayıt sözleşmelerinde formal PDF/DocumentInstance
-- üretilmez (kural: yalnızca 3-12 ay resmi sözleşme gerektirir). Bu satırlarda
-- documentInstanceId/templateVersion NULL kalır.
ALTER TABLE "StudentContract" ALTER COLUMN "documentInstanceId" DROP NOT NULL;
ALTER TABLE "StudentContract" ALTER COLUMN "templateVersion" DROP NOT NULL;
