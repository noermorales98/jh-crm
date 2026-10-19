-- AlterTable
ALTER TABLE `CreditItem` ADD COLUMN `canonicalTradelineId` VARCHAR(191) NULL,
    ADD COLUMN `fieldQualityJson` JSON NULL,
    ADD COLUMN `openClosedStatus` VARCHAR(191) NULL,
    ADD COLUMN `ownershipType` VARCHAR(191) NULL,
    ADD COLUMN `pastDueAmount` DECIMAL(12, 2) NULL,
    ADD COLUMN `sourceLocatorJson` JSON NULL;

-- CreateTable
CREATE TABLE `CanonicalTradeline` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `creditorNormalized` VARCHAR(191) NOT NULL,
    `accountFamily` VARCHAR(191) NOT NULL,
    `identityVersion` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CanonicalTradeline_org_client_idx`(`organizationId`, `clientId`),
    UNIQUE INDEX `CanonicalTradeline_org_client_id_key`(`organizationId`, `clientId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditScoreObservation` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `bureau` ENUM('EXPERIAN', 'EQUIFAX', 'TRANSUNION') NOT NULL,
    `value` INTEGER NULL,
    `modelFamily` VARCHAR(191) NULL,
    `modelVersion` VARCHAR(191) NULL,
    `industryVariant` VARCHAR(191) NULL,
    `scoreDate` DATE NULL,
    `reasonCodesJson` JSON NULL,
    `sourceLocatorJson` JSON NULL,
    `sourceIdempotencyKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CreditScoreObservation_scope_idx`(`organizationId`, `clientId`, `reportId`, `bureau`),
    UNIQUE INDEX `CreditScoreObservation_org_idem_key`(`organizationId`, `sourceIdempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditInquiry` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `bureau` ENUM('EXPERIAN', 'EQUIFAX', 'TRANSUNION') NOT NULL,
    `creditorName` VARCHAR(191) NOT NULL,
    `inquiryDate` DATE NULL,
    `datePrecision` VARCHAR(191) NULL,
    `inquiryType` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NULL,
    `sourceLocatorJson` JSON NULL,
    `sourceIdempotencyKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CreditInquiry_scope_idx`(`organizationId`, `clientId`, `reportId`, `bureau`),
    UNIQUE INDEX `CreditInquiry_org_idem_key`(`organizationId`, `sourceIdempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditDisputeAssertion` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `creditItemId` VARCHAR(191) NOT NULL,
    `bureau` ENUM('EXPERIAN', 'EQUIFAX', 'TRANSUNION') NOT NULL,
    `fieldKey` VARCHAR(191) NOT NULL,
    `reportedValue` TEXT NULL,
    `assertedValue` TEXT NULL,
    `reason` TEXT NULL,
    `review` VARCHAR(191) NOT NULL DEFAULT 'PROPOSED',
    `evidenceDocumentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CreditDisputeAssertion_scope_idx`(`organizationId`, `clientId`, `creditItemId`),
    INDEX `CreditDisputeAssertion_document_idx`(`evidenceDocumentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Client_org_id_key` ON `Client`(`organizationId`, `id`);

-- CreateIndex
CREATE UNIQUE INDEX `CreditReport_org_client_id_key` ON `CreditReport`(`organizationId`, `clientId`, `id`);

-- CreateIndex
CREATE INDEX `CreditItem_org_client_canonical_idx` ON `CreditItem`(`organizationId`, `clientId`, `canonicalTradelineId`);

-- CreateIndex
CREATE UNIQUE INDEX `CreditItem_org_client_id_key` ON `CreditItem`(`organizationId`, `clientId`, `id`);

-- AddForeignKey
ALTER TABLE `CreditItem` ADD CONSTRAINT `CreditItem_organizationId_clientId_canonicalTradelineId_fkey` FOREIGN KEY (`organizationId`, `clientId`, `canonicalTradelineId`) REFERENCES `CanonicalTradeline`(`organizationId`, `clientId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CanonicalTradeline` ADD CONSTRAINT `CanonicalTradeline_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CanonicalTradeline` ADD CONSTRAINT `CanonicalTradeline_organizationId_clientId_fkey` FOREIGN KEY (`organizationId`, `clientId`) REFERENCES `Client`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditScoreObservation` ADD CONSTRAINT `CreditScoreObservation_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditScoreObservation` ADD CONSTRAINT `CreditScoreObservation_organizationId_clientId_fkey` FOREIGN KEY (`organizationId`, `clientId`) REFERENCES `Client`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditScoreObservation` ADD CONSTRAINT `CreditScoreObservation_organizationId_clientId_reportId_fkey` FOREIGN KEY (`organizationId`, `clientId`, `reportId`) REFERENCES `CreditReport`(`organizationId`, `clientId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditInquiry` ADD CONSTRAINT `CreditInquiry_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditInquiry` ADD CONSTRAINT `CreditInquiry_organizationId_clientId_fkey` FOREIGN KEY (`organizationId`, `clientId`) REFERENCES `Client`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditInquiry` ADD CONSTRAINT `CreditInquiry_organizationId_clientId_reportId_fkey` FOREIGN KEY (`organizationId`, `clientId`, `reportId`) REFERENCES `CreditReport`(`organizationId`, `clientId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditDisputeAssertion` ADD CONSTRAINT `CreditDisputeAssertion_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditDisputeAssertion` ADD CONSTRAINT `CreditDisputeAssertion_organizationId_clientId_fkey` FOREIGN KEY (`organizationId`, `clientId`) REFERENCES `Client`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditDisputeAssertion` ADD CONSTRAINT `CreditAssertion_item_fkey` FOREIGN KEY (`organizationId`, `clientId`, `creditItemId`) REFERENCES `CreditItem`(`organizationId`, `clientId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditDisputeAssertion` ADD CONSTRAINT `CreditDisputeAssertion_evidenceDocumentId_fkey` FOREIGN KEY (`evidenceDocumentId`) REFERENCES `Document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

