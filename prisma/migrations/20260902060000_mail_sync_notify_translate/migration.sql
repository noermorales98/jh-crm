-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('TASK_DUE', 'TASK_OVERDUE', 'CASE_REVIEW_DUE', 'ROUND_REVIEW_DUE', 'PAYMENT_DUE', 'SYSTEM', 'DAILY_DIGEST', 'MAIL_RECEIVED') NOT NULL;

-- AlterTable
ALTER TABLE `OrganizationSettings`
    ADD COLUMN `notifyEmailMail` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyWhatsappMail` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `MailMessage`
    ADD COLUMN `translationEsSubject` VARCHAR(500) NULL,
    ADD COLUMN `translationEsBody` TEXT NULL,
    ADD COLUMN `translatedAt` DATETIME(3) NULL;
