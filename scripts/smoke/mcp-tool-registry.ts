/**
 * Registro de herramientas del conector MCP (sin BD): nombres únicos, lectura de cada
 * sección de la tanda 1, y reglas de las herramientas que escriben. AC-4, AC-5, AC-8.
 *
 *   npx tsx scripts/smoke/mcp-tool-registry.ts
 */
import { can } from "../../src/server/auth/permissions";
import { allTools } from "../../src/server/mcp/tools";
import { maskLongNumbers, maskSensitiveText, redactForClaude, isSensitiveNumberQuery } from "../../src/server/mcp/redact";

let failed = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

/** Secciones de la tanda 1 que `listar` y `ver` deben cubrir. */
export const BATCH1_SECTIONS = ["clientes", "casos", "casos_servicio", "tareas", "oportunidades", "cotizaciones", "rondas", "cartas", "reportes_credito", "consultas", "pagos", "recibos", "planes_pago", "contratos", "plantillas_contrato"];

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

console.log("\n[mcp-tool-registry] herramientas de escritura de la tanda 1 (AC-5)\n");
/** Nombre → [permiso de la action equivalente, tipo]. Fuente: src/actions/*.ts. */
const EXPECTED_WRITE_TOOLS: Record<string, [string, "write" | "destructive"]> = {
  // Clientes (src/actions/clients.ts)
  crear_cliente: ["clients.create", "write"],
  editar_cliente: ["clients.edit", "write"],
  asignar_cliente: ["clients.edit", "write"],
  archivar_cliente: ["clients.edit", "destructive"],
  // Casos de crédito (src/actions/cases.ts)
  crear_caso: ["cases.manage", "write"],
  editar_caso: ["cases.manage", "write"],
  editar_importes_caso: ["cases.manage", "write"],
  mover_caso_etapa: ["cases.manage", "write"],
  pausar_caso: ["cases.manage", "write"],
  completar_caso: ["cases.manage", "write"],
  reabrir_caso: ["cases.manage", "write"],
  fijar_proxima_accion_caso: ["cases.manage", "write"],
  // Casos de servicio (src/actions/service-cases.ts)
  crear_caso_servicio: ["cases.manage", "write"],
  mover_caso_servicio_etapa: ["cases.manage", "write"],
  fijar_proxima_accion_caso_servicio: ["cases.manage", "write"],
  cambiar_estado_caso_servicio: ["cases.manage", "destructive"],
  editar_importes_caso_servicio: ["cases.manage", "write"],
  // Tareas (src/actions/tasks.ts)
  crear_tarea: ["tasks.manage", "write"],
  editar_tarea: ["tasks.manage", "write"],
  completar_tarea: ["tasks.manage", "write"],
  reasignar_tarea: ["tasks.manage", "write"],
  cancelar_tarea: ["tasks.manage", "destructive"],
  // Notas (src/actions/notes.ts)
  agregar_nota_cliente: ["clients.edit", "write"],
  agregar_nota_caso: ["cases.manage", "write"],
  agregar_mensaje_lead: ["opportunities.manage", "write"],
  // Oportunidades (src/actions/opportunities.ts)
  crear_lead: ["opportunities.manage", "write"],
  editar_lead: ["opportunities.manage", "write"],
  crear_oportunidad: ["opportunities.manage", "write"],
  mover_oportunidad_etapa: ["opportunities.manage", "write"],
  marcar_ganada: ["opportunities.manage", "write"],
  marcar_perdida: ["opportunities.manage", "destructive"],
  // Cotizaciones (src/actions/quotes.ts)
  crear_cotizacion: ["quotes.manage", "write"],
  editar_cotizacion: ["quotes.manage", "write"],
  marcar_cotizacion_enviada: ["quotes.manage", "destructive"],
  marcar_cotizacion_aceptada: ["quotes.manage", "write"],
  marcar_cotizacion_rechazada: ["quotes.manage", "write"],
  cancelar_cotizacion: ["quotes.manage", "destructive"],
  // Tanda 2
  crear_ronda: ["rounds.manage", "write"],
  editar_ronda: ["rounds.manage", "write"],
  marcar_ronda_enviada: ["rounds.manage", "write"],
  marcar_ronda_revisada: ["rounds.manage", "write"],
  cancelar_ronda: ["rounds.manage", "destructive"],
  agregar_disputa: ["disputes.manage", "write"],
  agregar_disputas_lote: ["disputes.manage", "write"],
  agregar_disputa_consulta_o_personal: ["disputes.manage", "write"],
  editar_disputa: ["disputes.manage", "write"],
  cancelar_disputa: ["disputes.manage", "destructive"],
  crear_borrador_carta: ["letters.manage", "write"],
  editar_borrador_carta: ["letters.manage", "write"],
  finalizar_carta: ["letters.manage", "write"],
  marcar_carta_enviada: ["letters.manage", "write"],
  generar_cartas_por_estrategia: ["letters.manage", "write"],
  actualizar_seguimiento_carta: ["letters.manage", "write"],
  crear_reporte_credito: ["creditReports.manage", "write"],
  editar_reporte_credito: ["creditReports.manage", "write"],
  agregar_partida_credito: ["creditItems.manage", "write"],
  editar_partida_credito: ["creditItems.manage", "write"],
  solicitar_consulta: ["consultations.manage", "destructive"],
  cambiar_estado_consulta: ["consultations.manage", "destructive"],
  registrar_pago: ["payments.register", "write"],
  editar_pago_pendiente: ["payments.register", "write"],
  cancelar_pago: ["payments.register", "destructive"],
  marcar_pago_reembolsado: ["payments.register", "destructive"],
  crear_enlace_pago_cotizacion: ["payments.register", "write"],
  enviar_enlace_pago_whatsapp: ["payments.register", "destructive"],
  anular_recibo: ["receipts.void", "destructive"],
  crear_plan_pago: ["payments.register", "write"],
  cancelar_plan_pago: ["payments.register", "destructive"],
  crear_contrato: ["contracts.manage", "write"],
  marcar_contrato_enviado: ["contracts.manage", "destructive"],
  cancelar_contrato: ["contracts.manage", "destructive"],
};
for (const [name, [permission, kind]] of Object.entries(EXPECTED_WRITE_TOOLS)) {
  const tool = tools.find((t) => t.name === name);
  check(`${name}: existe, permiso ${permission}, tipo ${kind}`,
    !!tool && tool.permission === permission && tool.kind === kind, tool && { permission: tool.permission, kind: tool.kind });
}
for (const tool of tools.filter((t) => t.kind === "destructive")) {
  check(`${tool.name}: no promete que se pueda deshacer`, !/reversible|reabrirse/i.test(tool.description), tool.description);
}
const sendQuote = tools.find((t) => t.name === "marcar_cotizacion_enviada");
check("marcar_cotizacion_enviada se anuncia con efectos fuera del CRM (manda un mensaje real)", sendQuote?.openWorld === true);
const requestConsultation = tools.find((t) => t.name === "solicitar_consulta");
check("solicitar_consulta se anuncia con efectos fuera del CRM (correo y WhatsApp por un servicio externo)", requestConsultation?.openWorld === true);
const OPEN_WORLD = "crear_enlace_pago_cotizacion,enviar_enlace_pago_whatsapp,marcar_cotizacion_enviada,solicitar_consulta";
check(`solo ${OPEN_WORLD} tienen efectos fuera del CRM`,
  tools.filter((t) => t.openWorld).map((t) => t.name).sort().join() === OPEN_WORLD,
  tools.filter((t) => t.openWorld).map((t) => t.name));
const unexpected = tools.filter((t) => t.kind !== "read" && !(t.name in EXPECTED_WRITE_TOOLS)).map((t) => t.name);
check("ninguna herramienta borra partidas de crédito de verdad (solo borrado lógico)",
  !tools.some((t) => /(borrar|eliminar)_partida/.test(t.name)), names);
check("Claude no firma contratos ni edita plantillas (la firma es del cliente; el texto legal, del CRM)",
  !tools.some((t) => /firmar|plantilla/.test(t.name)), names);
check("anular_recibo solo para dueños y administradores", !can("STAFF", "receipts.void") && !can("SPECIALIST", "receipts.void") && can("ADMIN", "receipts.void"));
check("ninguna herramienta borra pagos, recibos, planes ni contratos (AC-7: solo cancelar o anular)",
  !tools.some((t) => /^(borrar|eliminar)_(pago|recibo|plan|contrato)/.test(t.name)), names);
check("no hay herramientas de escritura fuera de la lista", unexpected.length === 0, unexpected);

console.log("\n[mcp-tool-registry] limpieza de números largos (AC-6)\n");
check("tarjeta de 16 dígitos → solo los 4 últimos", maskLongNumbers("cuenta 4111222233334444") === "cuenta ****4444");
check("cuenta con guiones → solo los 4 últimos", maskLongNumbers("4111-2222-3333-4444 ok") === "****4444 ok");
check("12 dígitos → enmascarado", maskLongNumbers("000123456789") === "****6789");
check("teléfono de 10 dígitos intacto", maskLongNumbers("tel 5551234567") === "tel 5551234567");
check("11 dígitos en texto libre → enmascarado (posible cuenta)", maskLongNumbers("15551234567") === "****4567");
check("importe con decimales intacto", maskLongNumbers("$1,250.00") === "$1,250.00");
for (const raw of ["4111.2222.3333.4444", "4111/2222/3333/4444", "4111\n2222\n3333\n4444",
  "4111  2222  3333  4444", "acct4111222233334444", "cuenta_4111222233334444", "4111-2222-3333-4444-"]) {
  const out = maskSensitiveText(raw);
  check(`cuenta ${JSON.stringify(raw)} → sin los 12 primeros dígitos`, !/4111[\s._/-]*2222/.test(out) && out.includes("4444"), out);
}
for (const raw of ["SSN 123 45 6789", "123.45.6789", "ssn_123456789.pdf", "123-45-6789", "ITIN 912 70 1234"]) {
  check(`SSN/ITIN ${JSON.stringify(raw)} → tapado`, !/\d{3}[\s._-]*\d{2}[\s._-]*\d{4}/.test(maskSensitiveText(raw)), maskSensitiveText(raw));
}
const structured = redactForClaude({ phone: "+52 55 1234 5678", clientCode: "SC-20261112-0001", caseNumber: "202611120001",
  id: "123456789012", href: "/crm/clientes/123456789012", note: "tel +52 55 1234 5678" });
check("campos estructurados intactos (teléfono, códigos, id, enlace)",
  structured.phone === "+52 55 1234 5678" && structured.clientCode === "SC-20261112-0001" &&
    structured.caseNumber === "202611120001" && structured.id === "123456789012" && structured.href.endsWith("/crm/clientes/123456789012"),
  structured);
check("…pero en texto libre se tapa", structured.note !== "tel +52 55 1234 5678", structured.note);
check("buscar por 9 dígitos se rechaza", isSensitiveNumberQuery("123-45-6789"));
check("buscar por 16 dígitos se rechaza", isSensitiveNumberQuery("4111 2222 3333 4444"));
check("buscar por teléfono de 10 dígitos se permite", !isSensitiveNumberQuery("(555) 123-4567"));
check("buscar por código corto se permite", !isSensitiveNumberQuery("COT-0042"));
check("buscar por teléfono con prefijo +1 se permite", !isSensitiveNumberQuery("+1 555 123 4567"));
check("buscar por teléfono con prefijo +52 se permite", !isSensitiveNumberQuery("+52 55 1234 5678"));
check("buscar por 13 dígitos se rechaza", isSensitiveNumberQuery("4111222233334"));
for (const raw of ["1234    5678    9012 3456", "12345678901", "１２３４５６７８９０１２３４"]) {
  check(`cuenta ${JSON.stringify(raw)} → enmascarada`, maskSensitiveText(raw).startsWith("****"), maskSensitiveText(raw));
}
check("SSN «123 - 45 - 6789» → tapado", maskSensitiveText("123 - 45 - 6789") === "***-**-****", maskSensitiveText("123 - 45 - 6789"));
const suffixKeys = redactForClaude({ reasonCode: "acct 123456789012", approvedAt: "acct 123456789012" });
check("claves con sufijo Code/At ya no se eximen", !JSON.stringify(suffixKeys).includes("123456789012"), suffixKeys);
const idKeys = redactForClaude({ clientId: "123456789012", caseHref: "/crm/x/123456789012" });
check("…pero ids y enlaces siguen intactos", idKeys.clientId === "123456789012" && idKeys.caseHref.endsWith("/crm/x/123456789012"));

{
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://www.jh-multiservices.com/";
  const linked = redactForClaude({
    href: "/crm/clientes/abc",
    items: [{ href: "/crm/expedientes/x", client: { href: "/crm/clientes/y" } }],
    caseHref: "/crm/x/1",
    other: "/crm/clientes/abc",
  });
  check("enlaces internos salen con la dirección del CRM (no se abren en claude.ai)",
    linked.href === "https://www.jh-multiservices.com/crm/clientes/abc" &&
      linked.items[0].href === "https://www.jh-multiservices.com/crm/expedientes/x" &&
      linked.items[0].client.href === "https://www.jh-multiservices.com/crm/clientes/y" &&
      linked.caseHref === "https://www.jh-multiservices.com/crm/x/1", linked);
  check("solo cambian los campos de enlace", linked.other === "/crm/clientes/abc", linked);
  const ext = redactForClaude({ href: "https://otro.example/x", other2Href: "//evil.example/x" });
  check("enlaces ya completos o de protocolo relativo no se tocan",
    ext.href === "https://otro.example/x" && ext.other2Href === "//evil.example/x", ext);
  if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = prev;
}

if (failed > 0) {
  console.error(`\n✗ ${failed} comprobación(es) fallaron\n`);
  process.exit(1);
}
console.log("\n✓ mcp-tool-registry OK\n");
