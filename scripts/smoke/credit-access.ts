/**
 * Aislamiento de crédito: permiso, organización y cliente.
 *
 *   npm run smoke:credit-access
 *
 * Sin red y sin DATABASE_URL.
 */
import { ForbiddenError } from "../../src/server/auth/guards";
import { assertCreditAccess, creditClientForRole, creditProposalClientForRole } from "../../src/lib/credit/access";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[credit-access] scope");

  let viewerBlocked = false;
  try {
    assertCreditAccess({
      actor: { organizationId: "org-a", role: "VIEWER" },
      clientId: "client-1",
      resource: { organizationId: "org-a", clientId: "client-1" },
      mode: "manage",
    });
  } catch (error) {
    viewerBlocked = error instanceof ForbiddenError;
  }
  check("VIEWER no gestiona reportes", viewerBlocked);

  let staffView = true;
  try {
    assertCreditAccess({
      actor: { organizationId: "org-a", role: "STAFF" },
      clientId: "client-1",
      resource: { organizationId: "org-a", clientId: "client-1" },
      mode: "view",
    });
  } catch {
    staffView = false;
  }
  check("STAFF ve el reporte de su cliente", staffView);

  let otherOrg = false;
  try {
    assertCreditAccess({
      actor: { organizationId: "org-a", role: "STAFF" },
      clientId: "client-1",
      resource: { organizationId: "org-b", clientId: "client-1" },
      mode: "view",
    });
  } catch (error) {
    otherOrg = error instanceof Error && error.message === "SCOPE_MISMATCH";
  }
  check("otra organización es SCOPE_MISMATCH", otherOrg);

  let otherClient = false;
  try {
    assertCreditAccess({
      actor: { organizationId: "org-a", role: "ADMIN" },
      clientId: "client-1",
      resource: { organizationId: "org-a", clientId: "client-2" },
      mode: "manage",
    });
  } catch (error) {
    otherClient = error instanceof Error && error.message === "SCOPE_MISMATCH";
  }
  check("otro cliente del mismo tenant es SCOPE_MISMATCH", otherClient);

  const staffClient = creditClientForRole("STAFF", {
    firstName: "Trial",
    ssnLast4: "1234",
    hasDateOfBirth: true,
  });
  check("STAFF no recibe el último cuatro", staffClient?.ssnLast4 == null);
  check("STAFF conserva el booleano de nacimiento", staffClient?.hasDateOfBirth === true);

  const specialistClient = creditClientForRole("SPECIALIST", {
    firstName: "Trial",
    ssnLast4: "1234",
    hasDateOfBirth: true,
  });
  check("SPECIALIST sí recibe el último cuatro", specialistClient?.ssnLast4 === "1234");

  const staffProposal = creditProposalClientForRole("STAFF", {
    firstName: "Trial",
    dateOfBirth: "1990-01-01",
    ssnLast4: "1234",
  });
  check(
    "STAFF no recibe nacimiento ni último cuatro de la propuesta",
    staffProposal?.dateOfBirth == null && staffProposal?.ssnLast4 == null && staffProposal?.firstName === "Trial",
  );
  const specialistProposal = creditProposalClientForRole("SPECIALIST", {
    firstName: "Trial",
    dateOfBirth: "1990-01-01",
    ssnLast4: "1234",
  });
  check(
    "SPECIALIST recibe nacimiento y último cuatro de la propuesta",
    specialistProposal?.dateOfBirth === "1990-01-01" && specialistProposal?.ssnLast4 === "1234",
  );

  console.log("\nOK credit-access\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
