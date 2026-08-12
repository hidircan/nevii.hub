-- Yönetici bildirim tercihleri (kategori bazlı in-app / push bayrakları).
-- Additive: yalnızca yeni tablo. Mevcut Notification tablosuna dokunulmaz.
-- pushEnabled şimdilik ileriye dönük alan — gerçek push altyapısı yok.
--
-- Uygulamak için (canlıya bu sprintte otomatik uygulanmaz):
--   npx prisma migrate deploy
-- veya geliştirmede:
--   npx prisma migrate dev

CREATE TABLE `NotificationPreference` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `inAppEnabled` BOOLEAN NOT NULL DEFAULT true,
  `pushEnabled` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
);

CREATE UNIQUE INDEX `NotificationPreference_tenantId_userId_category_key`
  ON `NotificationPreference`(`tenantId`, `userId`, `category`);
CREATE INDEX `NotificationPreference_tenantId_userId_idx`
  ON `NotificationPreference`(`tenantId`, `userId`);

ALTER TABLE `NotificationPreference`
  ADD CONSTRAINT `NotificationPreference_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
