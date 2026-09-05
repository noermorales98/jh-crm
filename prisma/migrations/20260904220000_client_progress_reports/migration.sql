-- Snapshot de reportes de progreso (HTML en BD; PDF on-demand sin S3).
CREATE TABLE `ClientProgressReport` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `roundId` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NULL,
  `clientName` VARCHAR(191) NOT NULL,
  `caseCode` VARCHAR(191) NOT NULL,
  `periodLabel` VARCHAR(191) NOT NULL,
  `roundLabel` VARCHAR(191) NOT NULL,
  `reportDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `scoresJson` JSON NOT NULL,
  `resultsJson` JSON NOT NULL,
  `resultLinesJson` JSON NOT NULL,
  `nextSteps` TEXT NOT NULL,
  `nextReviewAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ClientProgressReport_organizationId_caseId_createdAt_idx`(`organizationId`, `caseId`, `createdAt`),
  INDEX `ClientProgressReport_roundId_createdAt_idx`(`roundId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ClientProgressReport`
  ADD CONSTRAINT `ClientProgressReport_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ClientProgressReport`
  ADD CONSTRAINT `ClientProgressReport_caseId_fkey`
  FOREIGN KEY (`caseId`) REFERENCES `CreditCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ClientProgressReport`
  ADD CONSTRAINT `ClientProgressReport_roundId_fkey`
  FOREIGN KEY (`roundId`) REFERENCES `CreditRound`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ClientProgressReport`
  ADD CONSTRAINT `ClientProgressReport_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
