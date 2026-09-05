-- SPRINT 7: Meta Lead Ads dedupe + META_LEAD notification

ALTER TABLE `Notification` MODIFY COLUMN `type` ENUM(
  'TASK_DUE','TASK_OVERDUE','CASE_REVIEW_DUE','ROUND_REVIEW_DUE','PAYMENT_DUE','SYSTEM',
  'DAILY_DIGEST','MAIL_RECEIVED','CONTACT_FORM','INTAKE_SUBMITTED','CONSULTATION_REQUESTED',
  'PORTAL_MESSAGE','CONTRACT_READY','META_LEAD'
) NOT NULL;

CREATE TABLE `MetaLeadEvent` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `externalLeadId` VARCHAR(191) NOT NULL,
  `pageId` VARCHAR(191) NULL,
  `formId` VARCHAR(191) NULL,
  `adId` VARCHAR(191) NULL,
  `adsetId` VARCHAR(191) NULL,
  `campaignId` VARCHAR(191) NULL,
  `clientId` VARCHAR(191) NULL,
  `opportunityId` VARCHAR(191) NULL,
  `payloadJson` JSON NULL,
  `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `MetaLeadEvent_organizationId_externalLeadId_key`(`organizationId`, `externalLeadId`),
  INDEX `MetaLeadEvent_organizationId_processedAt_idx`(`organizationId`, `processedAt`),
  INDEX `MetaLeadEvent_clientId_idx`(`clientId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MetaLeadEvent`
  ADD CONSTRAINT `MetaLeadEvent_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
