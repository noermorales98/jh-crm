/**
 * Presentación de cifras ya calculadas.
 *
 *   npm run smoke:credit-metrics
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  METRICS_VIEW_VERSION,
  metricText,
  presentAmount,
  presentUtilization,
} from "../../src/lib/credit/metrics-view";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[credit-metrics] presentUtilization");
  check("versión", METRICS_VIEW_VERSION === "t22-2026-10-21");

  const missing = metricText(presentUtilization({ basisPoints: null, status: "UNKNOWN" }));
  check("un vacío no se ve como 0%", missing === "Sin dato" && !missing.includes("0%"), missing);

  const partial = presentUtilization({ basisPoints: 3841, status: "PARTIAL" });
  const conflict = presentUtilization({ basisPoints: 3841, status: "CONFLICT" });
  check(
    "parcial y conflicto no publican el número",
    partial.formattedValue === null &&
      partial.label === "Parcial" &&
      conflict.formattedValue === null &&
      conflict.label === "Conflicto",
  );

  const known = metricText(presentUtilization({ basisPoints: 3841, status: "KNOWN" }));
  check("3841 basis points se leen 38.4%", known === "38.4%", known);

  const stale = metricText(presentUtilization({ basisPoints: 3841, status: "STALE" }));
  check("lo desactualizado conserva la cifra", stale === "38.4% · Desactualizada", stale);

  const plain = metricText(presentAmount({ amount: 1000, currency: null, status: "KNOWN" }));
  const emptyMoney = metricText(presentAmount({ amount: null, currency: null, status: "UNKNOWN" }));
  check(
    "un monto sin moneda no dice USD y un monto vacío no es cero",
    plain === "1,000.00" && !plain.includes("USD") && !plain.includes("$") && emptyMoney === "Sin dato",
    { plain, emptyMoney },
  );

  const view = readFileSync("src/components/clients/client-action-plan-view.tsx", "utf8");
  const pdf = readFileSync("src/lib/pdf/action-plan.ts", "utf8");
  check(
    "la ficha usa la lectura y no redondea la utilización por su cuenta",
    view.includes("presentUtilization") && view.includes("presentAmount") && !view.includes("toFixed") && !view.includes('formatMoney'),
  );
  check(
    "el PDF usa la misma lectura",
    pdf.includes("presentUtilization") && pdf.includes("presentAmount") && !pdf.includes("toFixed"),
  );
  check("el detalle sigue siendo un botón", view.includes('type="button"') && view.includes("Ver detalle completo"));

  console.log("\nOK credit-metrics\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
