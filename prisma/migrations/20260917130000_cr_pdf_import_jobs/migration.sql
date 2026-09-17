-- CR-PDF-001: jobs de análisis PDF + tipo de notificación
ALTER TABLE `Notification` MODIFY COLUMN `type` ENUM(
  'TASK_DUE',
  'TASK_OVERDUE',
  'CASE_REVIEW_DUE',
  'ROUND_REVIEW_DUE',
  'PAYMENT_DUE',
  'SYSTEM',
  'DAILY_DIGEST',
  'MAIL_RECEIVED',
  'CONTACT_FORM',
  'INTAKE_SUBMITTED',
  'CONSULTATION_REQUESTED',
  'PORTAL_MESSAGE',
  'CONTRACT_READY',
  'META_LEAD',
  'CREDIT_PDF_IMPORT'
) NOT NULL;

CREATE TABLE `CreditPdfImportJob` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `documentId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
  `phase` VARCHAR(191) NULL,
  `progress` INTEGER NOT NULL DEFAULT 0,
  `fileName` VARCHAR(191) NULL,
  `errorMessage` TEXT NULL,
  `proposalJson` JSON NULL,
  `extractMode` VARCHAR(191) NULL,
  `pageCount` INTEGER NULL,
  `suggestedReportType` VARCHAR(191) NULL,
  `currentClientJson` JSON NULL,
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `CreditPdfImportJob_organizationId_createdById_status_idx`(`organizationId`, `createdById`, `status`),
  INDEX `CreditPdfImportJob_organizationId_caseId_status_idx`(`organizationId`, `caseId`, `status`),
  INDEX `CreditPdfImportJob_documentId_idx`(`documentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CreditPdfImportJob`
  ADD CONSTRAINT `CreditPdfImportJob_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CreditPdfImportJob_caseId_fkey`
    FOREIGN KEY (`caseId`) REFERENCES `CreditCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CreditPdfImportJob_clientId_fkey`
    FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CreditPdfImportJob_documentId_fkey`
    FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CreditPdfImportJob_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
