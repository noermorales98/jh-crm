-- AlterTable
ALTER TABLE `OrganizationSettings` ADD COLUMN `callmebotEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `callmebotPhone` VARCHAR(191) NULL,
    ADD COLUMN `callmebotApiKeyEncrypted` TEXT NULL;
