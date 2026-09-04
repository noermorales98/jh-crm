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
  'OTHER'
) NOT NULL;

-- CreateTable CreditReport
CREATE TABLE `CreditReport` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `documentId` VARCHAR(191) NULL,
  `provider` VARCHAR(191) NULL,
  `externalReportId` VARCHAR(191) NULL,
  `reportDate` DATE NOT NULL,
  `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `type` ENUM('INITIAL', 'UPDATE', 'MANUAL') NOT NULL DEFAULT 'MANUAL',
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `CreditReport_organizationId_caseId_idx`(`organizationId`, `caseId`),
  INDEX `CreditReport_organizationId_clientId_idx`(`organizationId`, `clientId`),
  INDEX `CreditReport_caseId_reportDate_idx`(`caseId`, `reportDate`),
  INDEX `CreditReport_organizationId_type_idx`(`organizationId`, `type`),
  INDEX `CreditReport_documentId_idx`(`documentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable CreditBureauSnapshot
CREATE TABLE `CreditBureauSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `reportId` VARCHAR(191) NOT NULL,
  `bureau` ENUM('EXPERIAN', 'EQUIFAX', 'TRANSUNION') NOT NULL,
  `score` INTEGER NULL,
  `totalAccounts` INTEGER NULL,
  `openAccounts` INTEGER NULL,
  `closedAccounts` INTEGER NULL,
  `negativeAccounts` INTEGER NULL,
  `collections` INTEGER NULL,
  `inquiries` INTEGER NULL,
  `totalBalance` DECIMAL(12, 2) NULL,
  `utilization` DECIMAL(5, 2) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `CreditBureauSnapshot_reportId_bureau_key`(`reportId`, `bureau`),
  INDEX `CreditBureauSnapshot_reportId_idx`(`reportId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable CreditItem
CREATE TABLE `CreditItem` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `reportId` VARCHAR(191) NOT NULL,
  `creditorName` VARCHAR(191) NOT NULL,
  `accountNumberMasked` VARCHAR(191) NULL,
  `accountType` VARCHAR(191) NULL,
  `bureau` ENUM('EXPERIAN', 'EQUIFAX', 'TRANSUNION') NOT NULL,
  `balance` DECIMAL(12, 2) NULL,
  `creditLimit` DECIMAL(12, 2) NULL,
  `monthlyPayment` DECIMAL(12, 2) NULL,
  `dateOpened` DATE NULL,
  `dateReported` DATE NULL,
  `accountStatus` VARCHAR(191) NULL,
  `paymentStatus` VARCHAR(191) NULL,
  `negativeType` ENUM('COLLECTION', 'CHARGE_OFF', 'LATE_PAYMENT', 'REPOSSESSION', 'BANKRUPTCY', 'HARD_INQUIRY', 'FORECLOSURE', 'OTHER') NULL,
  `remarks` TEXT NULL,
  `isNegative` BOOLEAN NOT NULL DEFAULT false,
  `disputeEligible` BOOLEAN NOT NULL DEFAULT true,
  `lifecycleStatus` ENUM('IDENTIFIED', 'UNDER_REVIEW', 'SELECTED', 'DISPUTED', 'RESOLVED', 'EXCLUDED') NOT NULL DEFAULT 'IDENTIFIED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `CreditItem_organizationId_caseId_idx`(`organizationId`, `caseId`),
  INDEX `CreditItem_organizationId_clientId_idx`(`organizationId`, `clientId`),
  INDEX `CreditItem_reportId_idx`(`reportId`),
  INDEX `CreditItem_caseId_isNegative_idx`(`caseId`, `isNegative`),
  INDEX `CreditItem_organizationId_lifecycleStatus_idx`(`organizationId`, `lifecycleStatus`),
  INDEX `CreditItem_caseId_bureau_idx`(`caseId`, `bureau`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CreditReport`
  ADD CONSTRAINT `CreditReport_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CreditReport`
  ADD CONSTRAINT `CreditReport_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CreditReport`
  ADD CONSTRAINT `CreditReport_caseId_fkey`
  FOREIGN KEY (`caseId`) REFERENCES `CreditCase`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CreditReport`
  ADD CONSTRAINT `CreditReport_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `CreditBureauSnapshot`
  ADD CONSTRAINT `CreditBureauSnapshot_reportId_fkey`
  FOREIGN KEY (`reportId`) REFERENCES `CreditReport`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CreditItem`
  ADD CONSTRAINT `CreditItem_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CreditItem`
  ADD CONSTRAINT `CreditItem_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CreditItem`
  ADD CONSTRAINT `CreditItem_caseId_fkey`
  FOREIGN KEY (`caseId`) REFERENCES `CreditCase`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CreditItem`
  ADD CONSTRAINT `CreditItem_reportId_fkey`
  FOREIGN KEY (`reportId`) REFERENCES `CreditReport`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
