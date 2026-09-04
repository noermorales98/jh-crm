-- Rate limit compartido entre instancias (APIs públicas).
CREATE TABLE `RateLimitBucket` (
    `id` VARCHAR(191) NOT NULL,
    `bucketKey` VARCHAR(191) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RateLimitBucket_bucketKey_windowStart_key`(`bucketKey`, `windowStart`),
    INDEX `RateLimitBucket_windowStart_idx`(`windowStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
