/**
 * Contacto del negocio y firma automática en contratos.
 * npx tsx scripts/smoke/brand-contact.ts
 */
import { readFileSync } from "node:fs";
import {
  agencySignatureHtml,
  contactFooterLines,
  isValidSignatureDataUrl,
  normalizeBookingUrl,
  normalizeWhatsapp,
  whatsappLink,
  withAgencySignature,
} from "../../src/lib/brand/contact-links";
import { sanitizeContractHtml } from "../../src/lib/contracts/sanitize";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function main() {
  console.log("brand-contact");
  check("10 dígitos = EE. UU. (+1)", normalizeWhatsapp("(872) 202-0156") === "18722020156");
  check("con código de México", normalizeWhatsapp("+52 55 1234 5678") === "525512345678");
  check("número corto no vale", normalizeWhatsapp("1234") === null);
  check("link wa.me con texto", whatsappLink("8722020156", "Hola") === "https://wa.me/18722020156?text=Hola");
  check("agenda: agrega https", normalizeBookingUrl("calendly.com/jh") === "https://calendly.com/jh");
  check("agenda: rechaza http y javascript", normalizeBookingUrl("http://x.com") === null && normalizeBookingUrl("javascript:alert(1)") === null);
  check("agenda: rechaza credenciales en la URL", normalizeBookingUrl("https://user:pw@cal.com/x") === null);
  check("firma: solo PNG/JPG en data URL", isValidSignatureDataUrl(PNG) && !isValidSignatureDataUrl("data:image/svg+xml;base64,PHN2Zz4=") && !isValidSignatureDataUrl("https://x.com/a.png"));

  const block = agencySignatureHtml({ signature: PNG, representativeName: "Noé <Director>", legalName: "J&H Multiservices LLC", dateLabel: "29 de octubre de 2026" });
  check("bloque de firma escapa el nombre", block.includes("Noé &lt;Director&gt;") && block.includes("J&amp;H"));
  const once = withAgencySignature("<p>Contrato</p>", block);
  check("no duplica la firma al reenviar", withAgencySignature(once, block) === once);
  check("la firma sobrevive al sanitizador del contrato", sanitizeContractHtml(once).includes(PNG));
  check("firma inválida no agrega nada", agencySignatureHtml({ signature: "x", representativeName: null, legalName: "L", dateLabel: "d" }) === "");

  const lines = contactFooterLines({ whatsappNumber: "8722020156", bookingUrl: "cal.com/jh" });
  check("pie de correo con WhatsApp y agenda", lines.length === 2 && lines[0]!.includes("wa.me/18722020156") && lines[1]!.includes("https://cal.com/jh"));

  const base = readFileSync("src/lib/pdf/base.ts", "utf8");
  check("el encabezado común (cartas a burós) no muestra el WhatsApp", !/whatsapp/i.test(base.split("export function startDocument")[1] ?? base.slice(base.indexOf("function startDocument"))));
  console.log("\nOK brand-contact\n");
}

main();
