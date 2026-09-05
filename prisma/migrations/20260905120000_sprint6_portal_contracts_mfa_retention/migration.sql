-- SPRINT 6: portal cliente, contratos, MFA, retención documentos

ALTER TABLE `ActivityLog` MODIFY COLUMN `type` ENUM(
  'CREATED','NOTE','STATUS_CHANGE','STAGE_CHANGE','DOCUMENT_UPLOAD','DOCUMENT_DELETE',
  'ROUND_CREATED','ROUND_SENT','ROUND_REVIEWED','TASK_CREATED','TASK_COMPLETED',
  'QUOTE_CREATED','QUOTE_SENT','PAYMENT_RECORDED','RECEIPT_CREATED','MAIL_SENT','MAIL_RECEIVED',
  'CREDIT_REPORT_CREATED','CREDIT_REPORT_UPDATED','DISPUTE_ITEM_ADDED','DISPUTE_ITEM_UPDATED',
  'COMPARISON_CREATED','COMPARISON_UPDATED','LETTER_CREATED','LETTER_UPDATED','LETTER_FINALIZED',
  'PROGRESS_REPORT_GENERATED','OPPORTUNITY_CREATED','OPPORTUNITY_STAGE_CHANGED','OPPORTUNITY_WON',
  'PROCESSOR_LINKED','PAYMENT_PLAN_CREATED','CONSULTATION_REQUESTED',
  'PORTAL_ACCESS_INVITED','PORTAL_ACCESS_REVOKED','CONTRACT_CREATED','CONTRACT_SIGNED',
  'DOCUMENT_HARD_DELETED','OTHER'
) NOT NULL;

ALTER TABLE `Notification` MODIFY COLUMN `type` ENUM(
  'TASK_DUE','TASK_OVERDUE','CASE_REVIEW_DUE','ROUND_REVIEW_DUE','PAYMENT_DUE','SYSTEM',
  'DAILY_DIGEST','MAIL_RECEIVED','CONTACT_FORM','INTAKE_SUBMITTED','CONSULTATION_REQUESTED',
  'PORTAL_MESSAGE','CONTRACT_READY'
) NOT NULL;

ALTER TABLE `User`
  ADD COLUMN `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `mfaSecretEncrypted` TEXT NULL,
  ADD COLUMN `mfaRecoveryCodesEncrypted` TEXT NULL,
  ADD COLUMN `mfaVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `mfaFailedAttempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `mfaLockedUntil` DATETIME(3) NULL;

ALTER TABLE `OrganizationSettings`
  ADD COLUMN `documentSoftDeleteRetentionDays` INTEGER NULL,
  ADD COLUMN `documentMaxRetentionDays` INTEGER NULL;

ALTER TABLE `Document`
  ADD COLUMN `purgeAfter` DATETIME(3) NULL,
  ADD COLUMN `hardDeletedAt` DATETIME(3) NULL;

CREATE INDEX `Document_organizationId_purgeAfter_idx` ON `Document`(`organizationId`, `purgeAfter`);
CREATE INDEX `Document_organizationId_hardDeletedAt_idx` ON `Document`(`organizationId`, `hardDeletedAt`);

CREATE TABLE `ClientPortalAccess` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `sessionVersion` INTEGER NOT NULL DEFAULT 1,
  `lastLoginAt` DATETIME(3) NULL,
  `invitedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `invitedById` VARCHAR(191) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ClientPortalAccess_clientId_key`(`clientId`),
  UNIQUE INDEX `ClientPortalAccess_organizationId_email_key`(`organizationId`, `email`),
  INDEX `ClientPortalAccess_organizationId_isActive_idx`(`organizationId`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ContractTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `version` VARCHAR(191) NOT NULL DEFAULT '1.0',
  `contentHtml` LONGTEXT NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ContractTemplate_organizationId_active_idx`(`organizationId`, `active`),
  INDEX `ContractTemplate_organizationId_name_idx`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ClientContract` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NULL,
  `templateId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `version` VARCHAR(191) NOT NULL,
  `contentSnapshot` LONGTEXT NOT NULL,
  `status` ENUM('DRAFT','SENT','SIGNED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'DRAFT',
  `signerName` VARCHAR(191) NULL,
  `signerIp` VARCHAR(191) NULL,
  `userAgent` TEXT NULL,
  `signatureData` LONGTEXT NULL,
  `signedAt` DATETIME(3) NULL,
  `cancellationDeadline` DATETIME(3) NULL,
  `documentId` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ClientContract_organizationId_status_createdAt_idx`(`organizationId`, `status`, `createdAt`),
  INDEX `ClientContract_clientId_status_idx`(`clientId`, `status`),
  INDEX `ClientContract_caseId_status_idx`(`caseId`, `status`),
  INDEX `ClientContract_templateId_idx`(`templateId`),
  INDEX `ClientContract_documentId_idx`(`documentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ClientPortalAccess`
  ADD CONSTRAINT `ClientPortalAccess_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ClientPortalAccess_clientId_fkey`
    FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ClientPortalAccess_invitedById_fkey`
    FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ContractTemplate`
  ADD CONSTRAINT `ContractTemplate_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ClientContract`
  ADD CONSTRAINT `ClientContract_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ClientContract_clientId_fkey`
    FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ClientContract_caseId_fkey`
    FOREIGN KEY (`caseId`) REFERENCES `CreditCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `ClientContract_templateId_fkey`
    FOREIGN KEY (`templateId`) REFERENCES `ContractTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `ClientContract_documentId_fkey`
    FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `ClientContract_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
