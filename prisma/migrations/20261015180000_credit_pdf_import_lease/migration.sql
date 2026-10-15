-- Lease + intentos para recuperación de CreditPdfImportJob (cron).
-- No aplicar a producción desde el agente; `prisma migrate deploy` en el flujo habitual.

ALTER TABLE `CreditPdfImportJob`
  ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `leaseToken` VARCHAR(191) NULL,
  ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `heartbeatAt` DATETIME(3) NULL;

CREATE INDEX `CreditPdfImportJob_status_leaseExpiresAt_idx` ON `CreditPdfImportJob`(`status`, `leaseExpiresAt`);
CREATE INDEX `CreditPdfImportJob_status_createdAt_idx` ON `CreditPdfImportJob`(`status`, `createdAt`);
