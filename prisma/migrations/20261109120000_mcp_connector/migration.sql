-- AlterTable
ALTER TABLE `OrganizationSettings` ADD COLUMN `mcpEnabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `McpClient` (
    `id` VARCHAR(191) NOT NULL,
    `clientName` VARCHAR(200) NOT NULL,
    `redirectUris` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `McpConnection` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `sessionVersion` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedByUserId` VARCHAR(191) NULL,

    INDEX `McpConnection_organizationId_revokedAt_idx`(`organizationId`, `revokedAt`),
    INDEX `McpConnection_userId_revokedAt_idx`(`userId`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `McpAuthCode` (
    `id` VARCHAR(191) NOT NULL,
    `codeHash` CHAR(64) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `codeChallenge` VARCHAR(128) NOT NULL,
    `redirectUri` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `McpAuthCode_codeHash_key`(`codeHash`),
    INDEX `McpAuthCode_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `McpToken` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `kind` ENUM('ACCESS', 'REFRESH') NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `McpToken_tokenHash_key`(`tokenHash`),
    INDEX `McpToken_connectionId_kind_idx`(`connectionId`, `kind`),
    INDEX `McpToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `McpConnection` ADD CONSTRAINT `McpConnection_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpConnection` ADD CONSTRAINT `McpConnection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpConnection` ADD CONSTRAINT `McpConnection_revokedByUserId_fkey` FOREIGN KEY (`revokedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpConnection` ADD CONSTRAINT `McpConnection_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `McpClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpAuthCode` ADD CONSTRAINT `McpAuthCode_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `McpConnection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpToken` ADD CONSTRAINT `McpToken_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `McpConnection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

