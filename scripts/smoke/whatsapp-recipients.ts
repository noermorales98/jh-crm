/**
 * Smoke de destinatarios WhatsApp (sin BD ni CallMeBot de verdad).
 *
 *   npx tsx scripts/smoke/whatsapp-recipients.ts
 */
import { DomainError } from "../../src/server/errors";
import {
  MAX_WHATSAPP_RECIPIENTS,
  assertRecipientCount,
  selectWhatsappDeliveryTargets,
  sendWhatsappToEach,
} from "../../src/server/notifications/whatsapp-recipients";

function recipient(
  id: string,
  enabled: boolean,
): {
  id: string;
  enabled: boolean;
  phone: string;
  apiKeyEncrypted: string;
} {
  return {
    id,
    enabled,
    phone: `+1713555${id.padStart(4, "0")}`,
    apiKeyEncrypted: `enc-${id}`,
  };
}

const disabledGlobal = selectWhatsappDeliveryTargets({
  callmebotEnabled: false,
  recipients: [recipient("1", true), recipient("2", true)],
});
if (disabledGlobal.length !== 0) {
  throw new Error("global off debe enviar a 0 números");
}

const mixed = selectWhatsappDeliveryTargets({
  callmebotEnabled: true,
  recipients: [recipient("1", true), recipient("2", false), recipient("3", true)],
});
if (mixed.map((r) => r.id).join(",") !== "1,3") {
  throw new Error(`esperaba 1,3; obtuve ${mixed.map((r) => r.id).join(",")}`);
}

const many = selectWhatsappDeliveryTargets({
  callmebotEnabled: true,
  recipients: [1, 2, 3, 4, 5].map((n) => recipient(String(n), true)),
});
if (many.length !== MAX_WHATSAPP_RECIPIENTS) {
  throw new Error(`tope ${MAX_WHATSAPP_RECIPIENTS}, obtuve ${many.length}`);
}

assertRecipientCount(4);
try {
  assertRecipientCount(5);
  throw new Error("el quinto número debía rechazarse");
} catch (error) {
  if (!(error instanceof DomainError)) throw error;
}

async function main() {
  const calls: string[] = [];
  const result = await sendWhatsappToEach(
    [
      { phone: "+17135551111", apiKey: "a" },
      { phone: "+17135552222", apiKey: "b" },
      { phone: "+17135553333", apiKey: "c" },
    ],
    "mismo texto",
    async (input) => {
      calls.push(`${input.phone}|${input.text}`);
      if (input.phone.endsWith("2222")) {
        throw new Error("CallMeBot rechazó");
      }
    },
  );

  if (calls.length !== 3) {
    throw new Error(`debía llamar 3 veces en serie; llamó ${calls.length}`);
  }
  if (calls.some((c) => !c.endsWith("|mismo texto"))) {
    throw new Error("todas las peticiones deben usar el mismo texto");
  }
  if (result.sent !== 2 || result.failed !== 1) {
    throw new Error(`sent/failed inesperados: ${JSON.stringify(result)}`);
  }

  console.log("ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
