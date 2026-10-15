/**
 * TEST-008 / JH-008 — E2E crédito sintético (cadena pura + DB marcada).
 *
 * Flujo objetivo:
 *   reporte → revisión → plan → ronda/carta → reporte posterior → avance/PDF
 *   + aislamiento roles/tenant + idempotencia/recuperación
 *
 * Sin MySQL: verifica la cadena de gates P0/P1 que el E2E requiere.
 * Con MySQL: marcaría pasos de escritura (hoy BLOCKED en este worker).
 *
 * Uso: npm run smoke:credit-e2e-synthetic
 */
import net from "node:net";
import { redactBureauText, sanitizeFileNameForAI } from "../../src/server/credit-import/redact";
import { isPortalAllowedApiPath } from "../../src/server/auth/portal-api-paths";
import {
  isProgressReportOwnedByPortal,
  progressReportPortalWhere,
} from "../../src/server/progress-reports/portal-acl";
import { parseCsvRows, parseImportCsv } from "../../src/server/clients/import-csv";
import {
  allocateInstallmentCents,
  assertInstallmentsSumToTotal,
} from "../../src/lib/money/installments";
import {
  parseNumericField,
  shouldAutoDisputeOnContradiction,
  findBalanceContradictions,
} from "../../src/lib/credit/provenance";
import {
  evaluateContractSendReadiness,
  MIN_CANCELLATION_DEADLINE_DAYS,
} from "../../src/lib/contracts/legal-gate";
import {
  JH_SERVICE_CONTRACT_HTML,
  JH_SERVICE_CONTRACT_VERSION,
} from "../../src/lib/contracts/sanitize";
import { can } from "../../src/server/auth/permissions";

let failed = 0;
const blocked: string[] = [];

function check(label: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.error(`  ✗ ${label}`);
    failed += 1;
  }
}

function noteBlocked(label: string) {
  blocked.push(label);
  console.log(`  ⊗ BLOCKED ${label}`);
}

async function probeMysql(host = "127.0.0.1", port = 3306): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(800);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

async function main() {
  console.log("\n[TEST-008] Credit E2E synthetic");
  console.log("\n— Phase A: pure chain (no DB) —");

  // 1) Ingest safety: redact before AI
  const raw =
    "Cliente Synth QA score 720 SSN 123-45-6789 email user@example.com";
  const redacted = redactBureauText(raw);
  check("redacción SSN ausente post-ingest", !redacted.includes("123-45-6789"));
  check("redacción conserva score", redacted.includes("720"));
  check(
    "filename seguro",
    sanitizeFileNameForAI("report_123-45-6789.pdf").includes("pdf") &&
      !sanitizeFileNameForAI("report_123-45-6789.pdf").includes("123-45-6789"),
  );

  // 2) CSV intake hardening
  const csv = 'nombre,apellido,correo\n"Ada","López","ada@example.com"\n';
  check("CSV parse filas", parseCsvRows(csv).length === 2);
  check("CSV import filas tipadas", parseImportCsv(csv).length === 1);

  // 3) Provenance during review
  const na = parseNumericField("N/A", { source: "PDF_EXTRACT", bureau: "EQUIFAX" });
  check("N/A ≠ 0", na.value === null && na.isNotApplicable === true);
  const zero = parseNumericField("0", { source: "PDF_EXTRACT", bureau: "EQUIFAX" });
  check("cero reportado = 0", zero.value === 0 && zero.isNotApplicable === false);
  check("nunca auto-dispute", shouldAutoDisputeOnContradiction() === false);
  const contra = findBalanceContradictions([
    {
      bureau: "EQUIFAX",
      balance: parseNumericField("100", { source: "PDF_EXTRACT", bureau: "EQUIFAX" }),
    },
    {
      bureau: "EXPERIAN",
      balance: parseNumericField("200", { source: "PDF_EXTRACT", bureau: "EXPERIAN" }),
    },
  ]);
  check("contradicción → flag revisión humana", contra.length === 1);

  // 4) Commercial math
  const cents = allocateInstallmentCents(10001, 3);
  check("cuotas suman exacto", assertInstallmentsSumToTotal(cents, 10001));

  // 5) Contract gate before send
  const resolved = JH_SERVICE_CONTRACT_HTML.replaceAll(
    "{{clientName}}",
    "Cliente Sintético",
  ).replaceAll("{{clientFullName}}", "Cliente Sintético");
  const ready = evaluateContractSendReadiness({
    title: "Servicio crédito",
    version: JH_SERVICE_CONTRACT_VERSION,
    contentHtml: resolved,
    cancellationDeadline: new Date(
      Date.now() + MIN_CANCELLATION_DEADLINE_DAYS * 24 * 60 * 60 * 1000 + 60_000,
    ),
  });
  check("contrato completo puede enviarse", ready.ok);
  const blockedSend = evaluateContractSendReadiness({
    title: "Incompleto",
    version: "1.0",
    contentHtml: "<p>sin secciones {{clientName}}</p>",
    cancellationDeadline: null,
  });
  check("contrato incompleto no se envía", !blockedSend.ok);

  // 6) Portal PDF ACL + tenant ownership predicate
  check(
    "portal allowlist progress PDF",
    isPortalAllowedApiPath("/api/progress-reports/clxyz/pdf") === true,
  );
  check(
    "portal deny staff-only PDF",
    isPortalAllowedApiPath("/api/letters/abc/pdf") === false,
  );
  const owned = isProgressReportOwnedByPortal({
    reportOrganizationId: "orgA",
    caseClientId: "cli1",
    caseOrganizationId: "orgA",
    portalClientId: "cli1",
    portalOrganizationId: "orgA",
  });
  const crossClient = isProgressReportOwnedByPortal({
    reportOrganizationId: "orgA",
    caseClientId: "cli2",
    caseOrganizationId: "orgA",
    portalClientId: "cli1",
    portalOrganizationId: "orgA",
  });
  const crossTenant = isProgressReportOwnedByPortal({
    reportOrganizationId: "orgB",
    caseClientId: "cli1",
    caseOrganizationId: "orgB",
    portalClientId: "cli1",
    portalOrganizationId: "orgA",
  });
  check("PDF dueño OK", owned === true);
  check("PDF cliente ajeno denegado", crossClient === false);
  check("PDF tenant ajeno denegado", crossTenant === false);
  const where = progressReportPortalWhere({
    organizationId: "orgA",
    clientId: "cli1",
    reportId: "rep1",
  });
  check(
    "where portal incluye org+client+id",
    where.organizationId === "orgA" &&
      where.case.clientId === "cli1" &&
      where.id === "rep1",
  );

  // 7) Role isolation (permissions matrix — no DB)
  check("VIEWER no contracts.manage", can("VIEWER", "contracts.manage") === false);
  check("STAFF sí contracts.view", can("STAFF", "contracts.view") === true);
  check("OWNER sí contracts.manage", can("OWNER", "contracts.manage") === true);

  console.log("\n— Phase B: DB / HTTP runtime —");
  const mysqlUp = await probeMysql();
  if (!mysqlUp) {
    noteBlocked("MySQL 127.0.0.1:3306 — create client/case/report/round/letter/PDF");
    noteBlocked("HTTP portal owner 200 / cross-client 404");
    noteBlocked("Idempotencia job PDF + recuperación lease (sandbox write)");
  } else {
    console.log(
      "  ✓ MySQL reachable — full DB E2E not auto-run here (use credit-pdf-import-e2e + e2e-flow)",
    );
  }

  console.log("\n— Phase C: flow checklist (synthetic) —");
  const steps = [
    "ingest PDF → redact → propuesta",
    "revisión humana (N/A≠0, contradicciones)",
    "action/score plan derivado",
    "CreditRound + DisputeLetter PDF",
    "reporte posterior / comparación",
    "ClientProgressReport / avance PDF (ACL portal)",
  ];
  for (const step of steps) {
    if (mysqlUp) console.log(`  · ${step} (DB available — run dedicated smokes)`);
    else console.log(`  · ${step} — documented; runtime BLOCKED without MySQL`);
  }

  if (failed > 0) {
    console.error(`\nFAIL credit-e2e-synthetic (${failed} checks)`);
    process.exit(1);
  }

  console.log(
    `\nOK credit-e2e-synthetic (TEST-008) — pure chain green` +
      (blocked.length
        ? `; ${blocked.length} DB/HTTP step(s) BLOCKED`
        : "; DB probe OK"),
  );
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});