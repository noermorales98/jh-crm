/**
 * Métodos de disputa: sugerencia, plantillas y texto de la queja al CFPB.
 * npx tsx scripts/smoke/dispute-strategies.ts
 */
import {
  CFPB_TEMPLATE,
  DISPUTE_STRATEGIES,
  STRATEGY_INFO,
  STRATEGY_TEMPLATES,
  personalInfoLabel,
  suggestAccountStrategy,
} from "../../src/lib/disputes/strategies";
import { renderTemplate } from "../../src/lib/letters/template";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("dispute-strategies");
  check("cobranza sin historial = exactitud R1", suggestAccountStrategy({ negativeType: "COLLECTION", previouslyVerified: false }) === "ACCURACY_R1");
  check("ya verificada = método R2", suggestAccountStrategy({ negativeType: "CHARGE_OFF", previouslyVerified: true }) === "METHOD_R2");
  check("atraso = pagos tardíos", suggestAccountStrategy({ negativeType: "LATE_PAYMENT", previouslyVerified: false }) === "LATE_PAYMENTS");
  check("cada método tiene plantilla con {{items}}", DISPUTE_STRATEGIES.every((s) => STRATEGY_TEMPLATES[s].content.includes("{{items}}")));
  check("info personal va primero en el orden", Object.values(STRATEGY_INFO).sort((a, b) => a.order - b.order)[0]?.target === "PERSONAL_INFO");
  check("R2 cita 611(a)(7)", STRATEGY_TEMPLATES.METHOD_R2.content.includes("§1681i(a)(7)"));
  check("consultas citan propósito permitido 1681b", STRATEGY_TEMPLATES.INQUIRY.content.includes("§1681b"));
  const all = [...Object.values(STRATEGY_TEMPLATES).map((t) => t.content + t.subject), CFPB_TEMPLATE.content];
  check("plantillas sin promesas de borrado garantizado", all.every((t) => !/guarantee|garantiz/i.test(t)));
  check("plantillas sin rayas largas", all.every((t) => !t.includes("—")));
  const letter = renderTemplate(CFPB_TEMPLATE.content, {
    bureau: "Experian",
    items: "1. Discover Card - Account 3433\n   Reason: inconsistent",
    "client.fullName": "Agustin Islas",
  });
  check("la queja al CFPB rellena buró, items y nombre", letter.includes("Company: Experian") && letter.includes("Discover Card") && letter.endsWith("Agustin Islas\n"));
  check("dato personal en inglés para la carta", personalInfoLabel("ADDRESS", " 12 Oak St ") === "Address: 12 Oak St");
  console.log("\nOK dispute-strategies\n");
}

main();
