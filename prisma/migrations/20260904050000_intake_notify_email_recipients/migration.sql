-- AlterEnum
ALTER TABLE `Notification` MODIFY COLUMN `type` ENUM(
  'TASK_DUE',
  'TASK_OVERDUE',
  'CASE_REVIEW_DUE',
  'ROUND_REVIEW_DUE',
  'PAYMENT_DUE',
  'SYSTEM',
  'DAILY_DIGEST',
  'MAIL_RECEIVED',
  'CONTACT_FORM',
  'INTAKE_SUBMITTED'
) NOT NULL;

-- AlterTable
ALTER TABLE `OrganizationSettings`
  ADD COLUMN `notifyEmailIntake` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `notifyWhatsappIntake` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `EmailNotificationRecipient` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `EmailNotificationRecipient_organizationId_email_key`(`organizationId`, `email`),
  INDEX `EmailNotificationRecipient_organizationId_enabled_idx`(`organizationId`, `enabled`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmailNotificationRecipient`
  ADD CONSTRAINT `EmailNotificationRecipient_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
