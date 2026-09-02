-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('TASK_DUE', 'TASK_OVERDUE', 'CASE_REVIEW_DUE', 'ROUND_REVIEW_DUE', 'PAYMENT_DUE', 'SYSTEM', 'DAILY_DIGEST') NOT NULL;

-- AlterTable
ALTER TABLE `OrganizationSettings`
    ADD COLUMN `smtpHost` VARCHAR(191) NULL,
    ADD COLUMN `smtpPort` INTEGER NULL,
    ADD COLUMN `smtpUser` VARCHAR(191) NULL,
    ADD COLUMN `smtpPasswordEncrypted` TEXT NULL,
    ADD COLUMN `smtpFrom` VARCHAR(191) NULL,
    ADD COLUMN `smtpSecure` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `digestEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `digestHour` INTEGER NOT NULL DEFAULT 8,
    ADD COLUMN `notifyEmailTask` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyWhatsappTask` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyEmailCase` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyWhatsappCase` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyEmailPayment` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyWhatsappPayment` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyEmailDigest` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyWhatsappDigest` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `emailClientPaymentDue` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `emailClientDocsPending` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `emailClientQuoteSent` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `emailClientQuoteExpiring` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `emailClientCaseReview` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `emailClientRoundReview` BOOLEAN NOT NULL DEFAULT false;
