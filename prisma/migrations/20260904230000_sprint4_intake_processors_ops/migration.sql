-- SPRINT 4: intake payload, attribution, processors, commercial pipeline

ALTER TABLE `ActivityLog` MODIFY COLUMN `type` ENUM(
  'CREATED','NOTE','STATUS_CHANGE','STAGE_CHANGE','DOCUMENT_UPLOAD','DOCUMENT_DELETE',
  'ROUND_CREATED','ROUND_SENT','ROUND_REVIEWED','TASK_CREATED','TASK_COMPLETED',
  'QUOTE_CREATED','QUOTE_SENT','PAYMENT_RECORDED','RECEIPT_CREATED','MAIL_SENT','MAIL_RECEIVED',
  'CREDIT_REPORT_CREATED','CREDIT_REPORT_UPDATED','DISPUTE_ITEM_ADDED','DISPUTE_ITEM_UPDATED',
  'COMPARISON_CREATED','COMPARISON_UPDATED','LETTER_CREATED','LETTER_UPDATED','LETTER_FINALIZED',
  'PROGRESS_REPORT_GENERATED','OPPORTUNITY_CREATED','OPPORTUNITY_STAGE_CHANGED','OPPORTUNITY_WON',
  'PROCESSOR_LINKED','OTHER'
) NOT NULL;

ALTER TABLE `Client`
  ADD COLUMN `leadChannel` ENUM('FACEBOOK','INSTAGRAM','GOOGLE','WEBSITE','REFERRAL','MANUAL','OTHER') NULL,
  ADD COLUMN `serviceRequested` VARCHAR(191) NULL,
  ADD COLUMN `preferredContactMethod` VARCHAR(191) NULL,
  ADD COLUMN `preferredContactTime` VARCHAR(191) NULL,
  ADD COLUMN `attribution` JSON NULL;

CREATE INDEX `Client_organizationId_leadChannel_idx` ON `Client`(`organizationId`, `leadChannel`);

ALTER TABLE `IntakeSubmission`
  ADD COLUMN `payloadJson` JSON NULL;

CREATE TABLE `CreditProcessor` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'CREDIT_MONITOR',
  `websiteUrl` VARCHAR(191) NULL,
  `affiliateUrl` TEXT NULL,
  `monthlyPrice` DECIMAL(10, 2) NULL,
  `commission` DECIMAL(10, 2) NULL,
  `instructions` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `CreditProcessor_organizationId_active_idx`(`organizationId`, `active`),
  INDEX `CreditProcessor_organizationId_name_idx`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ClientProcessorAccount` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `processorId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NULL,
  `externalMemberId` VARCHAR(191) NULL,
  `externalUrl` TEXT NULL,
  `status` ENUM('PLANNED','ACTIVE','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `startedAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ClientProcessorAccount_organizationId_clientId_idx`(`organizationId`, `clientId`),
  INDEX `ClientProcessorAccount_processorId_status_idx`(`processorId`, `status`),
  INDEX `ClientProcessorAccount_caseId_idx`(`caseId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Opportunity` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NULL,
  `stage` ENUM('NEW_LEAD','CONTACTED','CONSULTATION','INTAKE_SENT','INTAKE_COMPLETED','PROPOSAL','WAITING_PAYMENT','WON','LOST') NOT NULL DEFAULT 'NEW_LEAD',
  `estimatedValue` DECIMAL(12, 2) NULL,
  `source` VARCHAR(191) NULL,
  `campaign` VARCHAR(191) NULL,
  `lostReason` TEXT NULL,
  `nextFollowUpAt` DATETIME(3) NULL,
  `wonCaseId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Opportunity_organizationId_stage_updatedAt_idx`(`organizationId`, `stage`, `updatedAt`),
  INDEX `Opportunity_organizationId_ownerId_idx`(`organizationId`, `ownerId`),
  INDEX `Opportunity_clientId_stage_idx`(`clientId`, `stage`),
  INDEX `Opportunity_organizationId_nextFollowUpAt_idx`(`organizationId`, `nextFollowUpAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CreditProcessor`
  ADD CONSTRAINT `CreditProcessor_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ClientProcessorAccount`
  ADD CONSTRAINT `ClientProcessorAccount_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ClientProcessorAccount`
  ADD CONSTRAINT `ClientProcessorAccount_processorId_fkey`
  FOREIGN KEY (`processorId`) REFERENCES `CreditProcessor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ClientProcessorAccount`
  ADD CONSTRAINT `ClientProcessorAccount_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ClientProcessorAccount`
  ADD CONSTRAINT `ClientProcessorAccount_caseId_fkey`
  FOREIGN KEY (`caseId`) REFERENCES `CreditCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Opportunity`
  ADD CONSTRAINT `Opportunity_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Opportunity`
  ADD CONSTRAINT `Opportunity_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Opportunity`
  ADD CONSTRAINT `Opportunity_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Opportunity`
  ADD CONSTRAINT `Opportunity_wonCaseId_fkey`
  FOREIGN KEY (`wonCaseId`) REFERENCES `CreditCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
