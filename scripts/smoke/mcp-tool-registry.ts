/**
 * Registro de herramientas del conector MCP (sin BD): nombres únicos, lectura de cada
 * sección de la tanda 1, y reglas de las herramientas que escriben. AC-4, AC-5, AC-8.
 *
 *   npx tsx scripts/smoke/mcp-tool-registry.ts
 */
import { can } from "../../src/server/auth/permissions";
import { allTools } from "../../src/server/mcp/tools";
import { maskLongNumbers } from "../../src/server/mcp/redact";

let failed = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

/** Secciones de la tanda 1 que `listar` y `ver` deben cubrir. */
export const BATCH1_SECTIONS = ["clientes", "casos", "casos_servicio", "tareas", "oportunidades", "cotizaciones"];

console.log("\n[mcp-tool-registry] registro\n");
const tools = allTools();
const names = tools.map((t) => t.name);
check("nombres únicos", new Set(names).size === names.length, names);
check("nombres en snake_case", names.every((n) => /^[a-z][a-z0-9_]{2,63}$/.test(n)), names);

for (const name of ["listar", "ver", "buscar"]) {
  const tool = tools.find((t) => t.name === name);
  check(`existe la herramienta de lectura ${name}`, !!tool && tool.kind === "read", tool?.kind);
  check(`${name}: cualquier rol puede usarla (VIEWER incluido)`, !!tool && can("VIEWER", tool.permission));
}
for (const name of ["listar", "ver"]) {
  const tool = tools.find((t) => t.name === name);
  for (const seccion of BATCH1_SECTIONS) {
    const ok = !!tool && tool.inputSchema.safeParse({ seccion, id: "x", texto: "ab" }).success;
    check(`${name} acepta la sección ${seccion} (AC-5)`, ok);
  }
  check(`${name} rechaza una sección desconocida`,
    !!tool && !tool.inputSchema.safeParse({ seccion: "pagos_secretos", id: "x" }).success);
}

for (const tool of tools) {
  check(`${tool.name}: título y descripción en español`, tool.title.length > 2 && tool.description.length > 20);
  if (tool.kind === "read") continue;
  check(`${tool.name}: declara auditoría y refresco`,
    typeof tool.audit === "function" && typeof tool.revalidate === "function");
  check(`${tool.name}: un VIEWER no puede usarla (AC-4)`, !can("VIEWER", tool.permission), tool.permission);
}

console.log("\n[mcp-tool-registry] limpieza de números largos (AC-6)\n");
check("tarjeta de 16 dígitos → solo los 4 últimos", maskLongNumbers("cuenta 4111222233334444") === "cuenta ****4444");
check("cuenta con guiones → solo los 4 últimos", maskLongNumbers("4111-2222-3333-4444 ok") === "****4444 ok");
check("12 dígitos → enmascarado", maskLongNumbers("000123456789") === "****6789");
check("teléfono de 10 dígitos intacto", maskLongNumbers("tel 5551234567") === "tel 5551234567");
check("11 dígitos intacto", maskLongNumbers("15551234567") === "15551234567");
check("importe con decimales intacto", maskLongNumbers("$1,250.00") === "$1,250.00");

if (failed > 0) {
  console.error(`\n✗ ${failed} comprobación(es) fallaron\n`);
  process.exit(1);
}
console.log("\n✓ mcp-tool-registry OK\n");
