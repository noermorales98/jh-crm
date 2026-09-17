-- AU-004: Whapi WhatsApp a clientes
ALTER TABLE `OrganizationSettings`
  ADD COLUMN `whapiEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `whapiTokenEncrypted` TEXT NULL,
  ADD COLUMN `whapiBaseUrl` VARCHAR(191) NULL,
  ADD COLUMN `whatsappClientPaymentDue` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `whatsappClientDocsPending` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `whatsappClientQuoteSent` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `whatsappClientQuoteExpiring` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `whatsappClientCaseReview` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `whatsappClientRoundReview` BOOLEAN NOT NULL DEFAULT false;
