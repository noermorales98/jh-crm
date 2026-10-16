/**
 * TEST-011 — gate jurídico/completitud de contratos (sin DB).
 * Contrato incompleto bloqueado; versiones/plazos; plantilla JH v1.0 con secciones.
 * No afirma validez jurídica ni compliance CROA.
 */
import {
  MIN_CANCELLATION_DEADLINE_DAYS,
  REQUIRED_CONTRACT_SECTIONS,
  addCancellationCalendarDays,
  assertCancellationDeadlineDays,
  cancellationCalendarDaysRemaining,
  evaluateContractSendReadiness,
  evaluateTemplateCompleteness,
  findRequiredSections,
  hasUnresolvedTemplateTokens,
  isValidContractVersion,
  missingRequiredSections,
} from "../../src/lib/contracts/legal-gate";
import {
  JH_SERVICE_CONTRACT_HTML,
  JH_SERVICE_CONTRACT_VERSION,
} from "../../src/lib/contracts/sanitize";

let failed = 0;

function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed += 1;
  }
}

console.log("\n[TEST-011] Contract legal gate (sintético)");

check(
  `mínimo cancelación = ${MIN_CANCELLATION_DEADLINE_DAYS}`,
  MIN_CANCELLATION_DEADLINE_DAYS === 3,
);
check("días null → issue", assertCancellationDeadlineDays(null) !== null);
check("días 2 → too short", assertCancellationDeadlineDays(2)?.code === "DEADLINE_TOO_SHORT");
check("días 3 → ok", assertCancellationDeadlineDays(3) === null);
check("días 5 → ok", assertCancellationDeadlineDays(5) === null);

check("versión vacía inválida", !isValidContractVersion(""));
check("versión 1.0 válida", isValidContractVersion("1.0"));
check("JH published version = 1.0", JH_SERVICE_CONTRACT_VERSION === "1.0");
check("versión con espacios inválida", !isValidContractVersion("1 0"));

const incompleteHtml = `<h2>Contrato</h2><p>Hola {{clientName}}</p>`;
check(
  "HTML incompleto: faltan todas las secciones",
  missingRequiredSections(incompleteHtml).length ===
    REQUIRED_CONTRACT_SECTIONS.length,
);
check("tokens sin resolver detectados", hasUnresolvedTemplateTokens(incompleteHtml));

const sections = findRequiredSections(JH_SERVICE_CONTRACT_HTML);
check(
  "plantilla JH v1.0 incluye todas las secciones",
  sections.length === REQUIRED_CONTRACT_SECTIONS.length,
);
check(
  "plantilla JH aún tiene token {{clientName}} (pre-emisión)",
  hasUnresolvedTemplateTokens(JH_SERVICE_CONTRACT_HTML),
);
check(
  "banner v1.0 (sin ‘versión pendiente’)",
  JH_SERVICE_CONTRACT_HTML.includes("Plantilla JH v1.0") &&
    !JH_SERVICE_CONTRACT_HTML.includes("versión de publicación pendiente"),
);

const templateOk = evaluateTemplateCompleteness({
  name: "Servicio crédito JH",
  version: JH_SERVICE_CONTRACT_VERSION,
  contentHtml: JH_SERVICE_CONTRACT_HTML,
  active: true,
});
check("plantilla JH v1.0 activa pasa completitud", templateOk.ok);

const templateBad = evaluateTemplateCompleteness({
  name: "Vacía",
  version: "1",
  contentHtml: "<p>sin secciones</p>",
  active: true,
});
check("plantilla sin secciones falla", !templateBad.ok);

const resolved = JH_SERVICE_CONTRACT_HTML.replaceAll(
  "{{clientName}}",
  "Cliente Sintético QA",
).replaceAll("{{clientFullName}}", "Cliente Sintético QA");

const ready = evaluateContractSendReadiness({
  title: "Servicio crédito JH",
  version: JH_SERVICE_CONTRACT_VERSION,
  contentHtml: resolved,
  cancellationDeadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
});
check("contrato completo listo para enviar", ready.ok);

const blockedIncomplete = evaluateContractSendReadiness({
  title: "Incompleto",
  version: "1.0",
  contentHtml: incompleteHtml,
  cancellationDeadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
});
check("contrato incompleto bloqueado", !blockedIncomplete.ok);

const blockedTokens = evaluateContractSendReadiness({
  title: "Con tokens",
  version: "1.0",
  contentHtml: JH_SERVICE_CONTRACT_HTML,
  cancellationDeadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
});
check("envío con tokens sin resolver bloqueado", !blockedTokens.ok);

const blockedNoDeadline = evaluateContractSendReadiness({
  title: "Sin plazo",
  version: "1.0",
  contentHtml: resolved,
  cancellationDeadline: null,
});
check("envío sin plazo bloqueado", !blockedNoDeadline.ok);

const blockedShort = evaluateContractSendReadiness({
  title: "Plazo corto",
  version: "1.0",
  contentHtml: resolved,
  cancellationDeadline: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
});
check("plazo < 3 días bloqueado", !blockedShort.ok);

const blockedPast = evaluateContractSendReadiness({
  title: "Plazo pasado",
  version: "1.0",
  contentHtml: resolved,
  cancellationDeadline: new Date(Date.now() - 60_000),
});
check("plazo en el pasado bloqueado", !blockedPast.ok);

// --- Exactly MIN calendar days (TZ / wall-clock edge) ---
const nowFixed = new Date("2026-10-16T18:30:00.000Z");
const exactMinDeadline = addCancellationCalendarDays(
  nowFixed,
  MIN_CANCELLATION_DEADLINE_DAYS,
);
check(
  "addCancellationCalendarDays(3) → fin de día UTC +3",
  exactMinDeadline.toISOString() === "2026-10-19T23:59:59.999Z",
);
check(
  "días naturales restantes exactos = 3",
  cancellationCalendarDaysRemaining(exactMinDeadline, nowFixed) ===
    MIN_CANCELLATION_DEADLINE_DAYS,
);

const readyExactMin = evaluateContractSendReadiness({
  title: "Plazo exacto 3 días",
  version: JH_SERVICE_CONTRACT_VERSION,
  contentHtml: resolved,
  cancellationDeadline: exactMinDeadline,
  now: nowFixed,
});
check("envío con exactamente 3 días naturales OK", readyExactMin.ok);

// Legacy wall-clock +3d same time-of-day (old addDays) — must still pass
// under calendar-day gate (previously failed when ms/86400000 < 3).
const legacySameTod = new Date(nowFixed);
legacySameTod.setUTCDate(
  legacySameTod.getUTCDate() + MIN_CANCELLATION_DEADLINE_DAYS,
);
check(
  "legacy same-TOD +3d → 3 días naturales",
  cancellationCalendarDaysRemaining(legacySameTod, nowFixed) === 3,
);
const readyLegacy = evaluateContractSendReadiness({
  title: "Legacy setDate+3",
  version: JH_SERVICE_CONTRACT_VERSION,
  contentHtml: resolved,
  cancellationDeadline: legacySameTod,
  now: new Date(nowFixed.getTime() + 5 * 60_000), // 5 min later (walkthrough edge)
});
check(
  "markSent-style: +3d same TOD + 5min still OK",
  readyLegacy.ok,
);

// 2 calendar days remaining still blocked
const twoDays = addCancellationCalendarDays(nowFixed, 2);
const blockedTwo = evaluateContractSendReadiness({
  title: "Solo 2 días",
  version: "1.0",
  contentHtml: resolved,
  cancellationDeadline: twoDays,
  now: nowFixed,
});
check("exactamente 2 días naturales bloqueado", !blockedTwo.ok);

if (failed > 0) {
  console.error(`\nFAIL contract-legal-gate (${failed} checks)`);
  process.exit(1);
}
console.log("\nOK contract-legal-gate (TEST-011)\n");
