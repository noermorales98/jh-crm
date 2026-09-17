-- AU-005 Stripe Checkout
ALTER TABLE `OrganizationSettings`
  ADD COLUMN `stripeEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `stripeSecretKeyEncrypted` TEXT NULL,
  ADD COLUMN `stripeWebhookSecretEncrypted` TEXT NULL,
  ADD COLUMN `stripePublishableKey` VARCHAR(191) NULL;

ALTER TABLE `Consultation`
  ADD COLUMN `stripeCheckoutSessionId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Consultation_stripeCheckoutSessionId_key` ON `Consultation`(`stripeCheckoutSessionId`);

ALTER TABLE `Payment`
  ADD COLUMN `stripeCheckoutSessionId` VARCHAR(191) NULL,
  ADD COLUMN `stripePaymentIntentId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Payment_stripeCheckoutSessionId_key` ON `Payment`(`stripeCheckoutSessionId`);
