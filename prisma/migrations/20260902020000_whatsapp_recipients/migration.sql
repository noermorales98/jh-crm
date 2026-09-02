-- CreateTable
CREATE TABLE `WhatsappRecipient` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `apiKeyEncrypted` TEXT NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WhatsappRecipient_organizationId_phone_key`(`organizationId`, `phone`),
    INDEX `WhatsappRecipient_organizationId_enabled_idx`(`organizationId`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WhatsappRecipient` ADD CONSTRAINT `WhatsappRecipient_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate the single org-level CallMeBot number into the first recipient.
INSERT INTO `WhatsappRecipient` (`id`, `organizationId`, `label`, `phone`, `apiKeyEncrypted`, `enabled`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT REPLACE(UUID(), '-', ''), `organizationId`, 'Principal', `callmebotPhone`, `callmebotApiKeyEncrypted`, true, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `OrganizationSettings`
WHERE `callmebotPhone` IS NOT NULL
  AND `callmebotPhone` <> ''
  AND `callmebotApiKeyEncrypted` IS NOT NULL
  AND `callmebotApiKeyEncrypted` <> '';

-- AlterTable
ALTER TABLE `OrganizationSettings` DROP COLUMN `callmebotPhone`,
    DROP COLUMN `callmebotApiKeyEncrypted`;
