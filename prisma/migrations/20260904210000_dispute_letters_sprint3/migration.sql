-- AlterEnum ActivityType
ALTER TABLE `ActivityLog` MODIFY COLUMN `type` ENUM(
  'CREATED','NOTE','STATUS_CHANGE','STAGE_CHANGE','DOCUMENT_UPLOAD','DOCUMENT_DELETE',
  'ROUND_CREATED','ROUND_SENT','ROUND_REVIEWED','TASK_CREATED','TASK_COMPLETED',
  'QUOTE_CREATED','QUOTE_SENT','PAYMENT_RECORDED','RECEIPT_CREATED','MAIL_SENT','MAIL_RECEIVED',
  'CREDIT_REPORT_CREATED','CREDIT_REPORT_UPDATED','DISPUTE_ITEM_ADDED','DISPUTE_ITEM_UPDATED',
  'COMPARISON_CREATED','COMPARISON_UPDATED','LETTER_CREATED','LETTER_UPDATED','LETTER_FINALIZED',
  'PROGRESS_REPORT_GENERATED','OTHER'
) NOT NULL;

CREATE TABLE `DisputeLetterTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `bureau` ENUM('EXPERIAN','EQUIFAX','TRANSUNION') NULL,
  `subject` VARCHAR(191) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `DisputeLetterTemplate_organizationId_active_idx`(`organizationId`, `active`),
  INDEX `DisputeLetterTemplate_organizationId_bureau_idx`(`organizationId`, `bureau`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DisputeLetter` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `roundId` VARCHAR(191) NOT NULL,
  `bureau` ENUM('EXPERIAN','EQUIFAX','TRANSUNION') NOT NULL,
  `templateId` VARCHAR(191) NULL,
  `recipient` VARCHAR(191) NOT NULL,
  `subjectSnapshot` VARCHAR(191) NOT NULL,
  `contentSnapshot` LONGTEXT NOT NULL,
  `status` ENUM('DRAFT','READY_FOR_REVIEW','FINAL','SENT','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finalizedAt` DATETIME(3) NULL,
  `sentAt` DATETIME(3) NULL,
  `trackingNumber` VARCHAR(191) NULL,
  `documentId` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `DisputeLetter_organizationId_roundId_idx`(`organizationId`, `roundId`),
  INDEX `DisputeLetter_roundId_bureau_idx`(`roundId`, `bureau`),
  INDEX `DisputeLetter_roundId_status_idx`(`roundId`, `status`),
  INDEX `DisputeLetter_documentId_idx`(`documentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DisputeLetterItem` (
  `id` VARCHAR(191) NOT NULL,
  `letterId` VARCHAR(191) NOT NULL,
  `disputeItemId` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `DisputeLetterItem_letterId_disputeItemId_key`(`letterId`, `disputeItemId`),
  INDEX `DisputeLetterItem_disputeItemId_idx`(`disputeItemId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DisputeLetterTemplate`
  ADD CONSTRAINT `DisputeLetterTemplate_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DisputeLetter`
  ADD CONSTRAINT `DisputeLetter_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DisputeLetter`
  ADD CONSTRAINT `DisputeLetter_roundId_fkey`
  FOREIGN KEY (`roundId`) REFERENCES `CreditRound`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DisputeLetter`
  ADD CONSTRAINT `DisputeLetter_templateId_fkey`
  FOREIGN KEY (`templateId`) REFERENCES `DisputeLetterTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DisputeLetter`
  ADD CONSTRAINT `DisputeLetter_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `DisputeLetterItem`
  ADD CONSTRAINT `DisputeLetterItem_letterId_fkey`
  FOREIGN KEY (`letterId`) REFERENCES `DisputeLetter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DisputeLetterItem`
  ADD CONSTRAINT `DisputeLetterItem_disputeItemId_fkey`
  FOREIGN KEY (`disputeItemId`) REFERENCES `DisputeItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
