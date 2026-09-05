-- SPRINT 5: PaymentPlan + Installments, Consultation, automation activity/notify types

ALTER TABLE `ActivityLog` MODIFY COLUMN `type` ENUM(
  'CREATED','NOTE','STATUS_CHANGE','STAGE_CHANGE','DOCUMENT_UPLOAD','DOCUMENT_DELETE',
  'ROUND_CREATED','ROUND_SENT','ROUND_REVIEWED','TASK_CREATED','TASK_COMPLETED',
  'QUOTE_CREATED','QUOTE_SENT','PAYMENT_RECORDED','RECEIPT_CREATED','MAIL_SENT','MAIL_RECEIVED',
  'CREDIT_REPORT_CREATED','CREDIT_REPORT_UPDATED','DISPUTE_ITEM_ADDED','DISPUTE_ITEM_UPDATED',
  'COMPARISON_CREATED','COMPARISON_UPDATED','LETTER_CREATED','LETTER_UPDATED','LETTER_FINALIZED',
  'PROGRESS_REPORT_GENERATED','OPPORTUNITY_CREATED','OPPORTUNITY_STAGE_CHANGED','OPPORTUNITY_WON',
  'PROCESSOR_LINKED','PAYMENT_PLAN_CREATED','CONSULTATION_REQUESTED','OTHER'
) NOT NULL;

ALTER TABLE `Notification` MODIFY COLUMN `type` ENUM(
  'TASK_DUE','TASK_OVERDUE','CASE_REVIEW_DUE','ROUND_REVIEW_DUE','PAYMENT_DUE','SYSTEM',
  'DAILY_DIGEST','MAIL_RECEIVED','CONTACT_FORM','INTAKE_SUBMITTED','CONSULTATION_REQUESTED'
) NOT NULL;

CREATE TABLE `PaymentPlan` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NULL,
  `quoteId` VARCHAR(191) NULL,
  `totalAmount` DECIMAL(12, 2) NOT NULL,
  `installmentAmount` DECIMAL(12, 2) NOT NULL,
  `frequency` ENUM('WEEKLY','BIWEEKLY','MONTHLY','CUSTOM') NOT NULL,
  `numberOfInstallments` INTEGER NOT NULL,
  `startDate` DATETIME(3) NOT NULL,
  `status` ENUM('ACTIVE','COMPLETED','CANCELLED','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `notes` TEXT NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `PaymentPlan_organizationId_status_startDate_idx`(`organizationId`, `status`, `startDate`),
  INDEX `PaymentPlan_clientId_status_idx`(`clientId`, `status`),
  INDEX `PaymentPlan_caseId_status_idx`(`caseId`, `status`),
  INDEX `PaymentPlan_quoteId_idx`(`quoteId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaymentInstallment` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `sequence` INTEGER NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `dueAt` DATETIME(3) NOT NULL,
  `status` ENUM('PENDING','PAID','CANCELLED','OVERDUE') NOT NULL DEFAULT 'PENDING',
  `paymentId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PaymentInstallment_paymentId_key`(`paymentId`),
  UNIQUE INDEX `PaymentInstallment_planId_sequence_key`(`planId`, `sequence`),
  INDEX `PaymentInstallment_organizationId_status_dueAt_idx`(`organizationId`, `status`, `dueAt`),
  INDEX `PaymentInstallment_planId_status_idx`(`planId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Consultation` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL DEFAULT 1,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `status` ENUM('REQUESTED','PAYMENT_PENDING','PAID','SCHEDULED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  `paymentId` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `scheduledAt` DATETIME(3) NULL,
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Consultation_paymentId_key`(`paymentId`),
  INDEX `Consultation_organizationId_status_requestedAt_idx`(`organizationId`, `status`, `requestedAt`),
  INDEX `Consultation_clientId_status_idx`(`clientId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PaymentPlan`
  ADD CONSTRAINT `PaymentPlan_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PaymentPlan`
  ADD CONSTRAINT `PaymentPlan_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PaymentPlan`
  ADD CONSTRAINT `PaymentPlan_caseId_fkey`
  FOREIGN KEY (`caseId`) REFERENCES `CreditCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `PaymentPlan`
  ADD CONSTRAINT `PaymentPlan_quoteId_fkey`
  FOREIGN KEY (`quoteId`) REFERENCES `Quote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `PaymentPlan`
  ADD CONSTRAINT `PaymentPlan_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PaymentInstallment`
  ADD CONSTRAINT `PaymentInstallment_planId_fkey`
  FOREIGN KEY (`planId`) REFERENCES `PaymentPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PaymentInstallment`
  ADD CONSTRAINT `PaymentInstallment_paymentId_fkey`
  FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Consultation`
  ADD CONSTRAINT `Consultation_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Consultation`
  ADD CONSTRAINT `Consultation_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Consultation`
  ADD CONSTRAINT `Consultation_paymentId_fkey`
  FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
