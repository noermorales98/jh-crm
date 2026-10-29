-- AlterTable
ALTER TABLE `OrganizationSettings` ADD COLUMN `bookingUrl` VARCHAR(191) NULL,
    ADD COLUMN `representativeName` VARCHAR(191) NULL,
    ADD COLUMN `representativeSignature` LONGTEXT NULL,
    ADD COLUMN `whatsappNumber` VARCHAR(191) NULL;

