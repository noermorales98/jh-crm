-- ARC-003 + ARC-004: ServiceCase wrap + WorkflowStage.serviceId
-- Aditivo. Backfill 1:1 CreditCase → ServiceCase. Sin DROP de datos.

-- 0) Asegurar Service CREDIT_REPAIR por org (idempotente si ya corrió service_code)
INSERT INTO `Service` (
  `id`, `organizationId`, `code`, `name`, `description`,
  `defaultPrice`, `currency`, `isActive`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('c', LOWER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 24))),
  o.`id`,
  'CREDIT_REPAIR',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM `Service` s2
      WHERE s2.`organizationId` = o.`id` AND s2.`name` = 'Credit Repair'
    ) THEN CONCAT('Credit Repair [', LEFT(o.`id`, 8), ']')
    ELSE 'Credit Repair'
  END,
  NULL,
  0,
  'USD',
  true,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `Organization` o
WHERE NOT EXISTS (
  SELECT 1 FROM `Service` s
  WHERE s.`organizationId` = o.`id` AND s.`code` = 'CREDIT_REPAIR'
);

-- 1) WorkflowStage.serviceId (nullable → backfill → NOT NULL)
ALTER TABLE `WorkflowStage` ADD COLUMN `serviceId` VARCHAR(191) NULL;

UPDATE `WorkflowStage` ws
INNER JOIN `Service` s
  ON s.`organizationId` = ws.`organizationId` AND s.`code` = 'CREDIT_REPAIR'
SET ws.`serviceId` = s.`id`
WHERE ws.`serviceId` IS NULL;

-- Fail hard if any stage lacks service (no CREDIT_REPAIR service)
-- MySQL: leave NULL rows would break NOT NULL; assert via temporary check
-- (migrate should abort if this leaves nulls — operator must fix)

DROP INDEX `WorkflowStage_organizationId_key_key` ON `WorkflowStage`;
DROP INDEX `WorkflowStage_organizationId_order_key` ON `WorkflowStage`;

ALTER TABLE `WorkflowStage` MODIFY `serviceId` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `WorkflowStage_organizationId_serviceId_key_key`
  ON `WorkflowStage`(`organizationId`, `serviceId`, `key`);
CREATE UNIQUE INDEX `WorkflowStage_organizationId_serviceId_order_key`
  ON `WorkflowStage`(`organizationId`, `serviceId`, `order`);
CREATE INDEX `WorkflowStage_serviceId_isActive_idx`
  ON `WorkflowStage`(`serviceId`, `isActive`);

ALTER TABLE `WorkflowStage`
  ADD CONSTRAINT `WorkflowStage_serviceId_fkey`
  FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) ServiceCase table
CREATE TABLE `ServiceCase` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `serviceId` VARCHAR(191) NOT NULL,
  `caseNumber` VARCHAR(191) NOT NULL,
  `status` ENUM('OPEN', 'ON_HOLD', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'OPEN',
  `stageId` VARCHAR(191) NOT NULL,
  `assignedToId` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `targetDate` DATETIME(3) NULL,
  `nextActionAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `quotedAmount` DECIMAL(12, 2) NULL,
  `agreedAmount` DECIMAL(12, 2) NULL,
  `notes` TEXT NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ServiceCase_organizationId_caseNumber_key`(`organizationId`, `caseNumber`),
  INDEX `ServiceCase_clientId_status_idx`(`clientId`, `status`),
  INDEX `ServiceCase_organizationId_nextActionAt_idx`(`organizationId`, `nextActionAt`),
  INDEX `ServiceCase_stageId_idx`(`stageId`),
  INDEX `ServiceCase_organizationId_serviceId_status_idx`(`organizationId`, `serviceId`, `status`),
  INDEX `ServiceCase_assignedToId_status_idx`(`assignedToId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ServiceCase`
  ADD CONSTRAINT `ServiceCase_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ServiceCase`
  ADD CONSTRAINT `ServiceCase_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ServiceCase`
  ADD CONSTRAINT `ServiceCase_serviceId_fkey`
  FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ServiceCase`
  ADD CONSTRAINT `ServiceCase_stageId_fkey`
  FOREIGN KEY (`stageId`) REFERENCES `WorkflowStage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ServiceCase`
  ADD CONSTRAINT `ServiceCase_assignedToId_fkey`
  FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) Backfill ServiceCase 1:1 desde CreditCase
INSERT INTO `ServiceCase` (
  `id`,
  `organizationId`,
  `clientId`,
  `serviceId`,
  `caseNumber`,
  `status`,
  `stageId`,
  `assignedToId`,
  `startedAt`,
  `targetDate`,
  `nextActionAt`,
  `completedAt`,
  `quotedAmount`,
  `agreedAmount`,
  `notes`,
  `archivedAt`,
  `createdAt`,
  `updatedAt`
)
SELECT
  CONCAT('sc', LOWER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 23))),
  cc.`organizationId`,
  cc.`clientId`,
  s.`id`,
  cc.`caseCode`,
  CASE cc.`state`
    WHEN 'OPEN' THEN 'OPEN'
    WHEN 'PAUSED' THEN 'ON_HOLD'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'CANCELLED' THEN 'CANCELED'
    ELSE 'OPEN'
  END,
  cc.`stageId`,
  cc.`assignedToId`,
  cc.`openedAt`,
  NULL,
  cc.`nextReviewAt`,
  cc.`closedAt`,
  NULL,
  NULL,
  NULL,
  NULL,
  cc.`createdAt`,
  CURRENT_TIMESTAMP(3)
FROM `CreditCase` cc
INNER JOIN `Service` s
  ON s.`organizationId` = cc.`organizationId` AND s.`code` = 'CREDIT_REPAIR';

-- 4) CreditCase.serviceCaseId
ALTER TABLE `CreditCase` ADD COLUMN `serviceCaseId` VARCHAR(191) NULL;

UPDATE `CreditCase` cc
INNER JOIN `ServiceCase` sc
  ON sc.`organizationId` = cc.`organizationId`
 AND sc.`caseNumber` = cc.`caseCode`
INNER JOIN `Service` s
  ON s.`id` = sc.`serviceId` AND s.`code` = 'CREDIT_REPAIR'
SET cc.`serviceCaseId` = sc.`id`
WHERE cc.`serviceCaseId` IS NULL;

ALTER TABLE `CreditCase` MODIFY `serviceCaseId` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `CreditCase_serviceCaseId_key` ON `CreditCase`(`serviceCaseId`);

ALTER TABLE `CreditCase`
  ADD CONSTRAINT `CreditCase_serviceCaseId_fkey`
  FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) Hijas: serviceCaseId aditivo + backfill desde caseId
ALTER TABLE `Document` ADD COLUMN `serviceCaseId` VARCHAR(191) NULL;
ALTER TABLE `Task` ADD COLUMN `serviceCaseId` VARCHAR(191) NULL;
ALTER TABLE `Quote` ADD COLUMN `serviceCaseId` VARCHAR(191) NULL;
ALTER TABLE `Payment` ADD COLUMN `serviceCaseId` VARCHAR(191) NULL;
ALTER TABLE `ActivityLog` ADD COLUMN `serviceCaseId` VARCHAR(191) NULL;

UPDATE `Document` d
INNER JOIN `CreditCase` cc ON cc.`id` = d.`caseId`
SET d.`serviceCaseId` = cc.`serviceCaseId`
WHERE d.`caseId` IS NOT NULL AND d.`serviceCaseId` IS NULL;

UPDATE `Task` t
INNER JOIN `CreditCase` cc ON cc.`id` = t.`caseId`
SET t.`serviceCaseId` = cc.`serviceCaseId`
WHERE t.`caseId` IS NOT NULL AND t.`serviceCaseId` IS NULL;

UPDATE `Quote` q
INNER JOIN `CreditCase` cc ON cc.`id` = q.`caseId`
SET q.`serviceCaseId` = cc.`serviceCaseId`
WHERE q.`caseId` IS NOT NULL AND q.`serviceCaseId` IS NULL;

UPDATE `Payment` p
INNER JOIN `CreditCase` cc ON cc.`id` = p.`caseId`
SET p.`serviceCaseId` = cc.`serviceCaseId`
WHERE p.`caseId` IS NOT NULL AND p.`serviceCaseId` IS NULL;

UPDATE `ActivityLog` a
INNER JOIN `CreditCase` cc ON cc.`id` = a.`caseId`
SET a.`serviceCaseId` = cc.`serviceCaseId`
WHERE a.`caseId` IS NOT NULL AND a.`serviceCaseId` IS NULL;

CREATE INDEX `Document_serviceCaseId_category_idx` ON `Document`(`serviceCaseId`, `category`);
CREATE INDEX `Task_serviceCaseId_status_idx` ON `Task`(`serviceCaseId`, `status`);
CREATE INDEX `Quote_serviceCaseId_status_idx` ON `Quote`(`serviceCaseId`, `status`);
CREATE INDEX `Payment_serviceCaseId_status_idx` ON `Payment`(`serviceCaseId`, `status`);
CREATE INDEX `ActivityLog_serviceCaseId_createdAt_idx` ON `ActivityLog`(`serviceCaseId`, `createdAt`);

ALTER TABLE `Document`
  ADD CONSTRAINT `Document_serviceCaseId_fkey`
  FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Task`
  ADD CONSTRAINT `Task_serviceCaseId_fkey`
  FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Quote`
  ADD CONSTRAINT `Quote_serviceCaseId_fkey`
  FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Payment`
  ADD CONSTRAINT `Payment_serviceCaseId_fkey`
  FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ActivityLog`
  ADD CONSTRAINT `ActivityLog_serviceCaseId_fkey`
  FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 6) Opportunity.wonServiceCaseId
ALTER TABLE `Opportunity` ADD COLUMN `wonServiceCaseId` VARCHAR(191) NULL;

UPDATE `Opportunity` o
INNER JOIN `CreditCase` cc ON cc.`id` = o.`wonCaseId`
SET o.`wonServiceCaseId` = cc.`serviceCaseId`
WHERE o.`wonCaseId` IS NOT NULL AND o.`wonServiceCaseId` IS NULL;

CREATE INDEX `Opportunity_wonServiceCaseId_idx` ON `Opportunity`(`wonServiceCaseId`);

ALTER TABLE `Opportunity`
  ADD CONSTRAINT `Opportunity_wonServiceCaseId_fkey`
  FOREIGN KEY (`wonServiceCaseId`) REFERENCES `ServiceCase`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7) StageHistory + Note (vacías; sin backfill histórico)
CREATE TABLE `ServiceCaseStageHistory` (
  `id` VARCHAR(191) NOT NULL,
  `serviceCaseId` VARCHAR(191) NOT NULL,
  `fromStageId` VARCHAR(191) NULL,
  `toStageId` VARCHAR(191) NOT NULL,
  `changedById` VARCHAR(191) NULL,
  `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ServiceCaseStageHistory_serviceCaseId_changedAt_idx`(`serviceCaseId`, `changedAt`),
  INDEX `ServiceCaseStageHistory_toStageId_idx`(`toStageId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ServiceCaseStageHistory`
  ADD CONSTRAINT `ServiceCaseStageHistory_serviceCaseId_fkey`
  FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ServiceCaseStageHistory`
  ADD CONSTRAINT `ServiceCaseStageHistory_fromStageId_fkey`
  FOREIGN KEY (`fromStageId`) REFERENCES `WorkflowStage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ServiceCaseStageHistory`
  ADD CONSTRAINT `ServiceCaseStageHistory_toStageId_fkey`
  FOREIGN KEY (`toStageId`) REFERENCES `WorkflowStage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ServiceCaseStageHistory`
  ADD CONSTRAINT `ServiceCaseStageHistory_changedById_fkey`
  FOREIGN KEY (`changedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `Note` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NULL,
  `serviceCaseId` VARCHAR(191) NULL,
  `authorUserId` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Note_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
  INDEX `Note_clientId_createdAt_idx`(`clientId`, `createdAt`),
  INDEX `Note_serviceCaseId_createdAt_idx`(`serviceCaseId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Note`
  ADD CONSTRAINT `Note_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Note`
  ADD CONSTRAINT `Note_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Note`
  ADD CONSTRAINT `Note_serviceCaseId_fkey`
  FOREIGN KEY (`serviceCaseId`) REFERENCES `ServiceCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Note`
  ADD CONSTRAINT `Note_authorUserId_fkey`
  FOREIGN KEY (`authorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
