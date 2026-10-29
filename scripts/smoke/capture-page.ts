/**
 * Página de captación: links por canal, QR y ruta pública.
 * npx tsx scripts/smoke/capture-page.ts
 */
import { readFileSync } from "node:fs";
import {
  CAPTURE_MEDIUM,
  buildCaptureUrl,
  captureChannelLabel,
  captureQrFileName,
  slugCampaign,
} from "../../src/lib/marketing/capture-links";
import { inferLeadChannel, normalizeAttribution } from "../../src/lib/attribution";
import { isAnonymousPath } from "../../src/server/auth/public-paths";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

const ig = new URL(buildCaptureUrl({ baseUrl: "https://crm.example.com/", channel: "instagram", campaign: "Feria de Mayo 2026" }));
check("ruta /empieza", ig.pathname === "/empieza", ig.toString());
check("utm_source del canal", ig.searchParams.get("utm_source") === "instagram");
check("utm_medium fijo", ig.searchParams.get("utm_medium") === CAPTURE_MEDIUM);
check("campaña en slug", ig.searchParams.get("utm_campaign") === "feria-de-mayo-2026", ig.searchParams.get("utm_campaign"));

const plain = new URL(buildCaptureUrl({ baseUrl: "https://crm.example.com", channel: null }));
check("sin canal no lleva UTM", plain.search === "", plain.search);

check("slug quita acentos y símbolos", slugCampaign("  Volantes ¡Tienda Ñuñoa! ") === "volantes-tienda-nunoa");
check("slug vacío", slugCampaign("") === "" && slugCampaign(null) === "");
check("nombre de archivo QR", captureQrFileName("evento", "Feria") === "qr-empieza-evento-feria.png");
check("nombre QR sin canal", captureQrFileName(null) === "qr-empieza.png");
check("etiqueta de canal", captureChannelLabel("referido") === "Referido" && captureChannelLabel("") === "Sin canal");

const attr = normalizeAttribution(Object.fromEntries(ig.searchParams));
check("Instagram se clasifica como INSTAGRAM", inferLeadChannel(attr) === "INSTAGRAM");

check("/empieza es pública", isAnonymousPath("/empieza"));
check("/empiezaX no es pública", !isAnonymousPath("/empiezaX"));

const page = readFileSync("app/empieza/page.tsx", "utf8");
check("usa el mismo formulario del sitio", page.includes("<ContactForm variant=\"hero\""));
check("aviso CROA sin promesas", page.includes("No prometemos puntajes"));
check("sin rayas largas en la página", !page.includes("—"));

const leads = readFileSync("app/crm/oportunidades/page.tsx", "utf8");
check("botón en Leads", leads.includes("<CaptureLinkButton"));

console.log("capture-page smoke OK");
