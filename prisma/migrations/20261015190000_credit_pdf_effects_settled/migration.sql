-- Efectos post-SUCCEEDED recuperables (auditoría + notificación) sin re-analizar el PDF.
ALTER TABLE `CreditPdfImportJob`
  ADD COLUMN `effectsSettledAt` DATETIME(3) NULL;

CREATE INDEX `CreditPdfImportJob_status_effectsSettledAt_idx`
  ON `CreditPdfImportJob`(`status`, `effectsSettledAt`);
