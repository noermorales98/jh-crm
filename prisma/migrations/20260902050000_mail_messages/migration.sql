-- CreateTable
CREATE TABLE `MailMessage` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `folder` ENUM('INBOX', 'SENT', 'DRAFTS', 'ARCHIVE', 'TRASH') NOT NULL DEFAULT 'INBOX',
    `direction` ENUM('INBOUND', 'OUTBOUND') NOT NULL,
    `fromAddress` VARCHAR(191) NOT NULL,
    `fromName` VARCHAR(191) NULL,
    `toAddresses` JSON NOT NULL,
    `ccAddresses` JSON NULL,
    `subject` VARCHAR(500) NOT NULL,
    `bodyText` TEXT NOT NULL,
    `bodyHtml` LONGTEXT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `internetMessageId` VARCHAR(255) NULL,
    `inReplyToId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MailMessage_organizationId_internetMessageId_key`(`organizationId`, `internetMessageId`),
    INDEX `MailMessage_organizationId_folder_createdAt_idx`(`organizationId`, `folder`, `createdAt`),
    INDEX `MailMessage_organizationId_isRead_folder_idx`(`organizationId`, `isRead`, `folder`),
    INDEX `MailMessage_clientId_idx`(`clientId`),
    INDEX `MailMessage_createdById_idx`(`createdById`),
    INDEX `MailMessage_inReplyToId_idx`(`inReplyToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MailMessage` ADD CONSTRAINT `MailMessage_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailMessage` ADD CONSTRAINT `MailMessage_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailMessage` ADD CONSTRAINT `MailMessage_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailMessage` ADD CONSTRAINT `MailMessage_inReplyToId_fkey` FOREIGN KEY (`inReplyToId`) REFERENCES `MailMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `ActivityLog` MODIFY `type` ENUM('CREATED', 'NOTE', 'STATUS_CHANGE', 'STAGE_CHANGE', 'DOCUMENT_UPLOAD', 'DOCUMENT_DELETE', 'ROUND_CREATED', 'ROUND_SENT', 'ROUND_REVIEWED', 'TASK_CREATED', 'TASK_COMPLETED', 'QUOTE_CREATED', 'QUOTE_SENT', 'PAYMENT_RECORDED', 'RECEIPT_CREATED', 'MAIL_SENT', 'MAIL_RECEIVED', 'OTHER') NOT NULL;
