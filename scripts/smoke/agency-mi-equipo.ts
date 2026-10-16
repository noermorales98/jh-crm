/**
 * Pure smoke — Agency Mi Equipo (view for all, manage gated).
 *
 *   npm run smoke:agency-mi-equipo
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EQUIPO_HREF,
  EQUIPO_NAV_DESCRIPTION,
  EQUIPO_NAV_LABEL,
  EQUIPO_PAGE_DESCRIPTION,
  EQUIPO_PAGE_DESCRIPTION_MANAGE,
  EQUIPO_PAGE_TITLE,
} from "../../src/lib/users/equipo";

const __dirname = dirname(fileURLToPath(import.meta.url));
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

function main() {
  console.log("\n[agency-mi-equipo] copy + wiring\n");

  check("title is Equipo", EQUIPO_PAGE_TITLE === "Equipo");
  check("href is /crm/usuarios", EQUIPO_HREF === "/crm/usuarios");
  check("nav label is Equipo", EQUIPO_NAV_LABEL === "Equipo");
  check(
    "view description has no invite hint",
    !EQUIPO_PAGE_DESCRIPTION.toLowerCase().includes("invitación"),
  );
  check(
    "manage description mentions invitación",
    EQUIPO_PAGE_DESCRIPTION_MANAGE.toLowerCase().includes("invitación"),
  );
  check(
    "nav description mentions roles",
    EQUIPO_NAV_DESCRIPTION.toLowerCase().includes("roles"),
  );

  const root = join(__dirname, "../..");
  const pageSrc = readFileSync(join(root, "app/crm/usuarios/page.tsx"), "utf8");
  check("page imports EQUIPO_PAGE_TITLE", pageSrc.includes("EQUIPO_PAGE_TITLE"));
  check(
    "page does not gate list behind users.manage empty-state",
    !pageSrc.includes("Acceso restringido"),
  );
  check(
    "page gates invite/actions with canManage",
    pageSrc.includes('can(ctx.role, "users.manage")') &&
      pageSrc.includes("canManage"),
  );
  check(
    "page always calls listMembers",
    pageSrc.includes("listMembers(ctx)"),
  );

  const moreSrc = readFileSync(
    join(root, "src/components/layout/more-nav-panel.tsx"),
    "utf8",
  );
  check("Más nav imports EQUIPO_HREF", moreSrc.includes("EQUIPO_HREF"));
  check("Más nav imports EQUIPO_NAV_LABEL", moreSrc.includes("EQUIPO_NAV_LABEL"));

  const spotlightSrc = readFileSync(
    join(root, "src/lib/search/spotlight.ts"),
    "utf8",
  );
  check(
    "spotlight Equipo uses dashboard.view",
    spotlightSrc.includes('title: "Equipo"') &&
      spotlightSrc.includes('permission: "dashboard.view"'),
  );

  const menuSrc = readFileSync(
    join(root, "src/components/ui/user-menu.tsx"),
    "utf8",
  );
  check(
    "user menu Equipo link outside isManager gate",
    menuSrc.includes("Equipo") &&
      menuSrc.indexOf('href="/crm/usuarios"') < menuSrc.indexOf("{isManager ?"),
  );

  if (failed > 0) {
    console.error(`\n[agency-mi-equipo] ${failed} check(s) failed\n`);
    process.exit(1);
  }
  console.log("\n[agency-mi-equipo] ok\n");
}

main();
