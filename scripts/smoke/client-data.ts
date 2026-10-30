/**
 * Datos del cliente a la vista: estados de EE. UU., ficha y lista.
 * npx tsx scripts/smoke/client-data.ts
 */
import { readFileSync } from "node:fs";
import { US_STATES, cityStateLabel, normalizeStateCode, stateName } from "../../src/lib/us-states";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

check("50 estados + DC + PR", US_STATES.length === 52, US_STATES.length);
check("códigos únicos", new Set(US_STATES.map((s) => s.code)).size === US_STATES.length);
check("tx → TX", normalizeStateCode("tx") === "TX");
check("Illinois → IL", normalizeStateCode("illinois") === "IL");
check("desconocido → null", normalizeStateCode("Jalisco") === null && normalizeStateCode("") === null);
check("TX → Texas", stateName("TX") === "Texas");
check("texto libre se conserva", stateName("Jalisco") === "Jalisco");
check("ciudad y estado", cityStateLabel("Houston", "TX") === "Houston, Texas");
check("solo estado", cityStateLabel(null, "IL") === "Illinois");
check("sin datos", cityStateLabel(" ", null) === null);

const detail = readFileSync("src/components/clients/agency-client-detail.tsx", "utf8");
check("ficha muestra Datos del cliente", detail.includes("<ClientDataPanel"));
check("editar usa selector de estados", detail.includes("<UsStateSelect") && !/name="state"\s/.test(detail));
const create = readFileSync("src/components/clients/clients-action-bar.tsx", "utf8");
check("alta usa selector de estados", create.includes("<UsStateSelect"));
const list = readFileSync("app/crm/clientes/page.tsx", "utf8");
check("lista filtra por estado", list.includes("<UsStateFilter") && list.includes("usState"));
check("fila recibe estado y teléfono", list.includes("state={client.state}") && list.includes("phone={client.phone}"));

console.log("client-data smoke OK");
