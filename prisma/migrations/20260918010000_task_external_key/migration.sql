-- Cola inteligente: clave externa idempotente en Task
ALTER TABLE `Task` ADD COLUMN `externalKey` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Task_organizationId_externalKey_key` ON `Task`(`organizationId`, `externalKey`);
CREATE INDEX `Task_organizationId_type_status_idx` ON `Task`(`organizationId`, `type`, `status`);
