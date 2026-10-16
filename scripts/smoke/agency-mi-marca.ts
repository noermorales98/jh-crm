/**
 * Pure smoke — Agency Mi Marca (logo in PDF header + settings copy).
 *
 *   npm run smoke:agency-mi-marca
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARCA_LOGO_FIELD_HINT,
  MARCA_SECTION_HINT,
  MARCA_SECTION_TITLE,
  MARCA_SETTINGS_DESCRIPTION,
} from "../../src/lib/brand/marca";
import { generateQuotePdf } from "../../src/lib/pdf/quote";
import { logoBoxMm, type PdfLogo } from "../../src/lib/pdf/logo";

const __dirname = dirname(fileURLToPath(import.meta.url));
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

/** 1×1 red PNG */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function main() {
  console.log("\n[agency-mi-marca] copy + PDF logo\n");

  check("section title Marca", MARCA_SECTION_TITLE === "Marca");
  check(
    "section hint mentions PDF",
    MARCA_SECTION_HINT.toLowerCase().includes("pdf"),
  );
  check(
    "logo hint mentions PNG/JPEG",
    /png/i.test(MARCA_LOGO_FIELD_HINT) && /jpeg/i.test(MARCA_LOGO_FIELD_HINT),
  );
  check(
    "settings description mentions Marca",
    MARCA_SETTINGS_DESCRIPTION.includes("Marca"),
  );

  const logo: PdfLogo = {
    dataUrl: `data:image/png;base64,${TINY_PNG_B64}`,
    format: "PNG",
    pixelWidth: 1,
    pixelHeight: 1,
  };
  const box = logoBoxMm(logo);
  check("logoBoxMm returns positive size", box.widthMm > 0 && box.heightMm > 0);

  const withLogo = generateQuotePdf({
    organization: {
      legalName: "Marca Smoke LLC",
      email: "ops@example.test",
      logo,
    },
    folio: "Q-MARCA",
    clientName: "Cliente Sintético",
    issuedAt: new Date("2026-01-15T12:00:00Z"),
    items: [
      {
        description: "Servicio",
        quantity: 1,
        unitPrice: 100,
        discountAmount: 0,
        total: 100,
      },
    ],
    subtotal: 100,
    discountTotal: 0,
    taxRate: 0,
    taxAmount: 0,
    total: 100,
  });
  check("quote with logo is PDF", withLogo.subarray(0, 5).toString() === "%PDF-");
  check("quote with logo has bytes", withLogo.length > 800);

  const withoutLogo = generateQuotePdf({
    organization: { legalName: "Sin Logo LLC" },
    folio: "Q-NOLOGO",
    clientName: "Cliente",
    issuedAt: new Date("2026-01-15T12:00:00Z"),
    items: [
      {
        description: "Servicio",
        quantity: 1,
        unitPrice: 50,
        discountAmount: 0,
        total: 50,
      },
    ],
    subtotal: 50,
    discountTotal: 0,
    taxRate: 0,
    taxAmount: 0,
    total: 50,
  });
  check(
    "quote without logo still works",
    withoutLogo.subarray(0, 5).toString() === "%PDF-",
  );

  const root = join(__dirname, "../..");
  const baseSrc = readFileSync(join(root, "src/lib/pdf/base.ts"), "utf8");
  check("base startDocument calls addImage", baseSrc.includes("addImage"));
  check("base accepts org.logo", baseSrc.includes("org.logo"));

  const quoteRoute = readFileSync(
    join(root, "app/api/quotes/[quoteId]/pdf/route.ts"),
    "utf8",
  );
  check(
    "quote PDF uses loadPdfOrganization",
    quoteRoute.includes("loadPdfOrganization"),
  );

  const receiptRoute = readFileSync(
    join(root, "app/api/receipts/[receiptId]/pdf/route.ts"),
    "utf8",
  );
  check(
    "receipt PDF uses loadPdfOrganization",
    receiptRoute.includes("loadPdfOrganization"),
  );

  const formSrc = readFileSync(
    join(root, "src/components/config/settings-form.tsx"),
    "utf8",
  );
  check("settings form uses MARCA_SECTION_TITLE", formSrc.includes("MARCA_SECTION_TITLE"));
  check("settings form shows logo preview", formSrc.includes("Vista previa del logo"));

  if (failed > 0) {
    console.error(`\n[agency-mi-marca] ${failed} check(s) failed\n`);
    process.exit(1);
  }
  console.log("\n[agency-mi-marca] ok\n");
}

main();
