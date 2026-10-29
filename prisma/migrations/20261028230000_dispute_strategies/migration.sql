-- AlterTable
ALTER TABLE `DisputeItem` ADD COLUMN `inquiryId` VARCHAR(191) NULL,
    ADD COLUMN `strategy` VARCHAR(191) NULL,
    ADD COLUMN `targetKind` ENUM('ACCOUNT', 'INQUIRY', 'PERSONAL_INFO') NOT NULL DEFAULT 'ACCOUNT',
    ADD COLUMN `targetLabel` VARCHAR(191) NULL,
    MODIFY `creditItemId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `DisputeLetterTemplate` ADD COLUMN `strategy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `DisputeLetter` ADD COLUMN `channel` VARCHAR(191) NOT NULL DEFAULT 'MAIL',
    ADD COLUMN `complaintId` VARCHAR(191) NULL,
    ADD COLUMN `followUpAt` DATETIME(3) NULL,
    ADD COLUMN `strategy` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `DisputeItem_inquiryId_idx` ON `DisputeItem`(`inquiryId`);

-- CreateIndex
CREATE UNIQUE INDEX `DisputeItem_roundId_inquiryId_key` ON `DisputeItem`(`roundId`, `inquiryId`);

-- AddForeignKey
ALTER TABLE `DisputeItem` ADD CONSTRAINT `DisputeItem_inquiryId_fkey` FOREIGN KEY (`inquiryId`) REFERENCES `CreditInquiry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

