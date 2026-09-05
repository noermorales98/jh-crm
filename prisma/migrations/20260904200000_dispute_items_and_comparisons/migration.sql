-- AlterEnum ActivityType
ALTER TABLE `ActivityLog` MODIFY COLUMN `type` ENUM(
  'CREATED',
  'NOTE',
  'STATUS_CHANGE',
  'STAGE_CHANGE',
  'DOCUMENT_UPLOAD',
  'DOCUMENT_DELETE',
  'ROUND_CREATED',
  'ROUND_SENT',
  'ROUND_REVIEWED',
  'TASK_CREATED',
  'TASK_COMPLETED',
  'QUOTE_CREATED',
  'QUOTE_SENT',
  'PAYMENT_RECORDED',
  'RECEIPT_CREATED',
  'MAIL_SENT',
  'MAIL_RECEIVED',
  'CREDIT_REPORT_CREATED',
  'CREDIT_REPORT_UPDATED',
  'DISPUTE_ITEM_ADDED',
  'DISPUTE_ITEM_UPDATED',
  'COMPARISON_CREATED',
  'COMPARISON_UPDATED',
  'OTHER'
) NOT NULL;

-- CreateTable DisputeItem
CREATE TABLE `DisputeItem` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `roundId` VARCHAR(191) NOT NULL,
  `creditItemId` VARCHAR(191) NOT NULL,
  `bureau` ENUM('EXPERIAN', 'EQUIFAX', 'TRANSUNION') NOT NULL,
  `disputeReason` VARCHAR(191) NOT NULL,
  `disputeDetails` TEXT NULL,
  `status` ENUM('DRAFT', 'SELECTED', 'LETTER_GENERATED', 'SENT', 'WAITING', 'RESPONDED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SELECTED',
  `outcome` ENUM('DELETED', 'UPDATED', 'VERIFIED', 'NO_CHANGE', 'NOT_RESPONDED', 'NEW_INFORMATION', 'OTHER') NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `DisputeItem_roundId_creditItemId_key`(`roundId`, `creditItemId`),
  INDEX `DisputeItem_organizationId_roundId_idx`(`organizationId`, `roundId`),
  INDEX `DisputeItem_creditItemId_idx`(`creditItemId`),
  INDEX `DisputeItem_roundId_status_idx`(`roundId`, `status`),
  INDEX `DisputeItem_roundId_outcome_idx`(`roundId`, `outcome`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ReportComparison
CREATE TABLE `ReportComparison` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `baseReportId` VARCHAR(191) NOT NULL,
  `compareReportId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ReportComparison_baseReportId_compareReportId_key`(`baseReportId`, `compareReportId`),
  INDEX `ReportComparison_organizationId_caseId_idx`(`organizationId`, `caseId`),
  INDEX `ReportComparison_caseId_createdAt_idx`(`caseId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ReportComparisonItem
CREATE TABLE `ReportComparisonItem` (
  `id` VARCHAR(191) NOT NULL,
  `comparisonId` VARCHAR(191) NOT NULL,
  `baseItemId` VARCHAR(191) NULL,
  `compareItemId` VARCHAR(191) NULL,
  `autoResult` ENUM('DELETED', 'UPDATED', 'VERIFIED', 'UNCHANGED', 'NEW') NOT NULL,
  `manualResult` ENUM('DELETED', 'UPDATED', 'VERIFIED', 'UNCHANGED', 'NEW') NULL,
  `matchKey` VARCHAR(191) NOT NULL,
  `creditorName` VARCHAR(191) NOT NULL,
  `bureau` ENUM('EXPERIAN', 'EQUIFAX', 'TRANSUNION') NOT NULL,
  `accountNumberMasked` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ReportComparisonItem_comparisonId_idx`(`comparisonId`),
  INDEX `ReportComparisonItem_comparisonId_autoResult_idx`(`comparisonId`, `autoResult`),
  INDEX `ReportComparisonItem_matchKey_idx`(`matchKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey DisputeItem
ALTER TABLE `DisputeItem`
  ADD CONSTRAINT `DisputeItem_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DisputeItem`
  ADD CONSTRAINT `DisputeItem_roundId_fkey`
  FOREIGN KEY (`roundId`) REFERENCES `CreditRound`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DisputeItem`
  ADD CONSTRAINT `DisputeItem_creditItemId_fkey`
  FOREIGN KEY (`creditItemId`) REFERENCES `CreditItem`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey ReportComparison
ALTER TABLE `ReportComparison`
  ADD CONSTRAINT `ReportComparison_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportComparison`
  ADD CONSTRAINT `ReportComparison_caseId_fkey`
  FOREIGN KEY (`caseId`) REFERENCES `CreditCase`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportComparison`
  ADD CONSTRAINT `ReportComparison_baseReportId_fkey`
  FOREIGN KEY (`baseReportId`) REFERENCES `CreditReport`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportComparison`
  ADD CONSTRAINT `ReportComparison_compareReportId_fkey`
  FOREIGN KEY (`compareReportId`) REFERENCES `CreditReport`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportComparison`
  ADD CONSTRAINT `ReportComparison_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey ReportComparisonItem
ALTER TABLE `ReportComparisonItem`
  ADD CONSTRAINT `ReportComparisonItem_comparisonId_fkey`
  FOREIGN KEY (`comparisonId`) REFERENCES `ReportComparison`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportComparisonItem`
  ADD CONSTRAINT `ReportComparisonItem_baseItemId_fkey`
  FOREIGN KEY (`baseItemId`) REFERENCES `CreditItem`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ReportComparisonItem`
  ADD CONSTRAINT `ReportComparisonItem_compareItemId_fkey`
  FOREIGN KEY (`compareItemId`) REFERENCES `CreditItem`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
