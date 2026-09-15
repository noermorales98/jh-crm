-- CreateTable
CREATE TABLE `HomeBuyerCase` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `serviceCaseId` VARCHAR(191) NOT NULL,
    `budgetMin` DECIMAL(12, 2) NULL,
    `budgetMax` DECIMAL(12, 2) NULL,
    `targetArea` VARCHAR(191) NULL,
    `preApproved` BOOLEAN NOT NULL DEFAULT false,
    `preApprovalAmount` DECIMAL(12, 2) NULL,
    `referralPartner` VARCHAR(191) NULL,
    `summary` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HomeBuyerCase_serviceCaseId_key`(`serviceCaseId`),
    INDEX `HomeBuyerCase_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FundingCase` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `serviceCaseId` VARCHAR(191) NOT NULL,
    `businessName` VARCHAR(191) NULL,
    `businessAgeMonths` INTEGER NULL,
    `requestedAmount` DECIMAL(12, 2) NULL,
    `purpose` VARCHAR(191) NULL,
    `summary` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FundingCase_serviceCaseId_key`(`serviceCaseId`),
    INDEX `FundingCase_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FundingApplication` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `fundingCaseId` VARCHAR(191) NOT NULL,
    `lenderName` VARCHAR(191) NOT NULL,
    `requestedAmount` DECIMAL(12, 2) NULL,
    `approvedAmount` DECIMAL(12, 2) NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'FUNDED', 'WITHDRAWN') NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `decisionAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FundingApplication_fundingCaseId_status_idx`(`fundingCaseId`, `status`),
    INDEX `FundingApplication_organizationId_status_idx`(`organizationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonalLoanCase` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `serviceCaseId` VARCHAR(191) NOT NULL,
    `requestedAmount` DECIMAL(12, 2) NULL,
    `purpose` VARCHAR(191) NULL,
    `termMonths` INTEGER NULL,
    `summary` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PersonalLoanCase_serviceCaseId_key`(`serviceCaseId`),
    INDEX `PersonalLoanCase_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectCase` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `serviceCaseId` VARCHAR(191) NOT NULL,
    `projectType` VARCHAR(191) NULL,
    `scopeSummary` TEXT NULL,
    `deliveryUrl` VARCHAR(191) NULL,
    `repositoryUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectCase_serviceCaseId_key`(`serviceCaseId`),
    INDEX `ProjectCase_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HomeBuyerCase` ADD CONSTRAINT `HomeBuyerCase_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HomeBuyerCase` ADD CONSTRAINT `HomeBuyerCase_serviceCaseId_fkey` FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FundingCase` ADD CONSTRAINT `FundingCase_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FundingCase` ADD CONSTRAINT `FundingCase_serviceCaseId_fkey` FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FundingApplication` ADD CONSTRAINT `FundingApplication_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FundingApplication` ADD CONSTRAINT `FundingApplication_fundingCaseId_fkey` FOREIGN KEY (`fundingCaseId`) REFERENCES `FundingCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonalLoanCase` ADD CONSTRAINT `PersonalLoanCase_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonalLoanCase` ADD CONSTRAINT `PersonalLoanCase_serviceCaseId_fkey` FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCase` ADD CONSTRAINT `ProjectCase_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCase` ADD CONSTRAINT `ProjectCase_serviceCaseId_fkey` FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

