-- CreateTable
CREATE TABLE `Testimonial` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `serviceCaseId` VARCHAR(191) NULL,
    `displayName` VARCHAR(120) NOT NULL,
    `body` TEXT NOT NULL,
    `rating` INTEGER NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `consentGrantedAt` DATETIME(3) NULL,
    `consentRevokedAt` DATETIME(3) NULL,
    `consentSignerName` VARCHAR(120) NULL,
    `consentEvidence` TEXT NULL,
    `consentVersion` VARCHAR(191) NULL,
    `consentText` TEXT NULL,
    `consentContentHash` VARCHAR(191) NULL,
    `consentRecordedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Testimonial_organizationId_status_publishedAt_idx`(`organizationId`, `status`, `publishedAt`),
    INDEX `Testimonial_clientId_createdAt_idx`(`clientId`, `createdAt`),
    INDEX `Testimonial_serviceCaseId_idx`(`serviceCaseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Testimonial` ADD CONSTRAINT `Testimonial_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Testimonial` ADD CONSTRAINT `Testimonial_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Testimonial` ADD CONSTRAINT `Testimonial_serviceCaseId_fkey` FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

