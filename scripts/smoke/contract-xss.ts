/**
 * XSS almacenado en contratos: un nombre de cliente hostil debe quedar inerte
 * en el `contentSnapshot` y en el HTML que pinta el portal del cliente.
 * Parte 1 sin DB (filtro de HTML); parte 2 contra la base local desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npm run smoke:contract-xss
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import {
  JH_SERVICE_CONTRACT_HTML,
  escapeHtml,
  sanitizeContractHtml,
} from "../../src/lib/contracts/sanitize";
import {
  fillTemplateVariables,
  presentContractHtml,
} from "../../src/lib/contracts/template-variables";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/jh_gates(\?|$)/.test(databaseUrl)) {
  throw new Error("contract-xss solo corre contra la base local desechable jh_gates.");
}

const MARK = `xss${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

/** Lo que el portal entrega a `dangerouslySetInnerHTML`. */
function portalHtml(snapshot: string) {
  return presentContractHtml(sanitizeContractHtml(snapshot));
}

/** Rasgos de un vector vivo: etiqueta activa, manejador de evento o esquema peligroso. */
function looksExecutable(html: string) {
  // El icono del chip de variables (lo añade `presentContractHtml` tras filtrar) es nuestro.
  const own = html.replace(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="14"[\s\S]*?<\/svg>/g, "");
  // Escaneo propio, más amplio que el del filtro: cualquier `<letra` hasta el siguiente `>`.
  const tags = own.match(/<[a-z][^>]*>?/gi) ?? [];
  return tags.some(
    (tag) =>
      /^<(?:script|svg|iframe|object|embed|math|template|frame|applet|form|button)\b/i.test(tag) ||
      /[\s/"'`]on[a-z]+\s*=/i.test(tag) ||
      /(?:href|src|action|formaction)\s*=\s*["'`]?\s*(?:javascript|vbscript|data:text)/i.test(tag) ||
      /srcdoc\s*=/i.test(tag) ||
      /expression\s*\(/i.test(tag),
  );
}

const HOSTILE_NAMES = [
  "<svg/onload=alert(1)>",
  "<img src=x onerror=alert(1)>",
  "\"><script>alert(1)</script>",
  "<a href=javascript:alert(1)>x</a>",
  "<iframe srcdoc=\"<script>alert(1)</script>\"></iframe>",
];

function filterChecks() {
  console.log("\n[contract-xss] filtro de HTML (sin DB)\n");

  const vectors: Record<string, string> = {
    "manejador sin espacio previo (`/onload=`)": "<svg/onload=alert(1)>",
    "manejador tras comilla de cierre": '<img src="x"onerror="alert(1)">',
    "manejador con mayúsculas y tabulador": "<img src=x\tOnErRoR=alert(1)>",
    "manejador partido que se recompone": "<img src=x oonerrornerror=alert(1)>",
    "script partido que se recompone": "<scr<script>x</script>ipt>alert(1)</script>",
    "javascript: sin comillas": "<a href=javascript:alert(1)>x</a>",
    "javascript: con entidades y espacios": '<a href=" jav&#x09;ascript&colon;alert(1)">x</a>',
    "javascript: con entidad decimal": '<a href="&#106;avascript:alert(1)">x</a>',
    "data:text/html en enlace": '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
    "iframe con srcdoc": '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    "srcdoc en otra etiqueta": '<div srcdoc="x">y</div>',
    "math/mtext": "<math><mtext><img src=x onerror=alert(1)></mtext></math>",
    "estilo con expression()": '<p style="width:expression(alert(1))">x</p>',
    "form con formaction": '<button formaction="javascript:alert(1)">x</button>',
  };
  for (const [label, html] of Object.entries(vectors)) {
    const out = sanitizeContractHtml(html);
    check(`bloquea ${label}`, !looksExecutable(out), out);
  }

  const signature =
    '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Firma" style="max-height:72px;max-width:260px" /></p>';
  check(
    "conserva la firma en data:image/png",
    sanitizeContractHtml(signature) === signature,
    sanitizeContractHtml(signature),
  );
  check(
    "la plantilla JH v1.0 sale intacta",
    sanitizeContractHtml(JH_SERVICE_CONTRACT_HTML) === JH_SERVICE_CONTRACT_HTML,
  );
  check(
    "conserva enlaces https normales",
    sanitizeContractHtml('<a href="https://jh-multiservices.com/">web</a>') ===
      '<a href="https://jh-multiservices.com/">web</a>',
  );
  check(
    "no toca texto que solo menciona «on»",
    sanitizeContractHtml("<p>persona on=line</p>") === "<p>persona on=line</p>" ||
      !looksExecutable(sanitizeContractHtml("<p>persona on=line</p>")),
  );

  const reflow = '<img alt=<span data-template-var="k"> src=x onerror=alert(1)>X</span>';
  check(
    "la reescritura del chip no reabre un manejador (orden filtro → presentación)",
    !looksExecutable(portalHtml(reflow)) && !looksExecutable(presentContractHtml(reflow)),
    portalHtml(reflow),
  );
  const reflowKnown =
    '<img alt=<span data-template-var="clientName"> src=x onerror=alert(1)>{{clientName}}</span>';
  check(
    "ni con una variable conocida",
    !looksExecutable(presentContractHtml(reflowKnown)),
    presentContractHtml(reflowKnown),
  );
  const chip = presentContractHtml("<p>{{clientName}}</p>");
  check(
    "el chip de variable pendiente conserva su icono",
    chip.includes('<svg xmlns="http://www.w3.org/2000/svg" width="14"') && chip.includes("Nombre del usuario"),
    chip,
  );
  check(
    "una clave heredada del prototipo no cuenta como variable",
    presentContractHtml('<span data-template-var="toString">x</span>') === "x",
  );

  for (const name of HOSTILE_NAMES) {
    const filled = fillTemplateVariables("<p>Cliente: <strong>{{clientName}}</strong></p>", {
      clientName: name,
      clientFullName: name,
    });
    check(`la sustitución escapa ${JSON.stringify(name)}`, filled.includes(escapeHtml(name)) && !filled.includes(name), filled);
  }
}

async function dbChecks(prisma: PrismaClient) {
  console.log("\n[contract-xss] contrato real desde plantilla (DB)\n");
  const { createContractFromTemplate, markSent } = await import("../../src/server/contracts");

  const user = await prisma.user.create({
    data: { email: `${MARK}@example.test`, passwordHash: "x", name: "Gate" },
  });
  const org = await prisma.organization.create({ data: { name: `TEST JH-CRM ${MARK}` } });
  await prisma.organizationMember.create({
    data: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });
  await prisma.organizationSettings.create({ data: { organizationId: org.id } });
  const ctx: OrganizationContext = { userId: user.id, organizationId: org.id, role: "OWNER" };

  const template = await prisma.contractTemplate.create({
    data: {
      organizationId: org.id,
      name: "Contrato XSS",
      version: "1.0",
      contentHtml: `${JH_SERVICE_CONTRACT_HTML}<p>Firma: <span data-template-var="clientFullName" class="jh-template-var">{{clientFullName}}</span></p>`,
      active: true,
    },
  });

  for (const [i, firstName] of HOSTILE_NAMES.entries()) {
    const client = await prisma.client.create({
      data: {
        organizationId: org.id,
        clientCode: `X${i}-${MARK}`.slice(0, 20),
        firstName,
        lastName: "Prueba",
        status: "ACTIVE",
      },
    });
    const contract = await createContractFromTemplate(ctx, {
      clientId: client.id,
      templateId: template.id,
      cancellationDeadlineDays: 3,
    });
    const escaped = escapeHtml(`${firstName} Prueba`);
    check(
      `snapshot guarda el nombre escapado (${JSON.stringify(firstName)})`,
      contract.contentSnapshot.includes(escaped) && !contract.contentSnapshot.includes(firstName),
    );
    check(
      "el snapshot no lleva tokens sin resolver",
      !/\{\{client(?:Full)?Name\}\}/.test(contract.contentSnapshot),
    );
    check("el HTML del portal queda inerte", !looksExecutable(portalHtml(contract.contentSnapshot)));
    check(
      "el portal muestra el nombre como texto",
      portalHtml(contract.contentSnapshot).includes(escaped),
    );

    const sent = await markSent(ctx, contract.id);
    check("tras enviar, sigue inerte", !looksExecutable(portalHtml(sent.contentSnapshot)));
  }

  // Un snapshot heredado (antes del arreglo) con el nombre en crudo: el filtro del portal lo neutraliza.
  const legacy = JH_SERVICE_CONTRACT_HTML.replace("{{clientName}}", "<svg/onload=alert(1)>");
  check("un snapshot antiguo sin escapar se pinta inerte", !looksExecutable(portalHtml(legacy)), portalHtml(legacy));
}

async function main() {
  filterChecks();
  const prisma = new PrismaClient();
  try {
    await dbChecks(prisma);
  } finally {
    await prisma.$disconnect();
  }
  if (failed > 0) {
    console.error(`\n[contract-xss] FALLÓ (${failed})\n`);
    process.exit(1);
  }
  console.log("\n[contract-xss] OK\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
