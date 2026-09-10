-- SC-001: Service.code (vertical estable, nullable). Unique por organización.
-- Backfill: INSERT CREDIT_REPAIR por org si falta; no reasigna filas existentes por nombre.

ALTER TABLE `Service` ADD COLUMN `code` VARCHAR(191) NULL;

-- Sembrar CREDIT_REPAIR para cada organización que aún no lo tenga.
-- IDs estilo cuid (prefijo c + hex); no toca Service preexistentes.
INSERT INTO `Service` (
  `id`,
  `organizationId`,
  `code`,
  `name`,
  `description`,
  `defaultPrice`,
  `currency`,
  `isActive`,
  `createdAt`,
  `updatedAt`
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

CREATE UNIQUE INDEX `Service_organizationId_code_key` ON `Service`(`organizationId`, `code`);
CREATE INDEX `Service_organizationId_code_idx` ON `Service`(`organizationId`, `code`);
