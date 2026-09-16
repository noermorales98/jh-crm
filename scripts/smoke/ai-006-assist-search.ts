/**
 * Smoke AI-006: assistSearch clasifica intent y devuelve hits reales (o falla limpio sin API key).
 * Uso: npx tsx --env-file=.env.local scripts/smoke/ai-006-assist-search.ts
 */
import { PrismaClient } from "@prisma/client";
import { assistSearch } from "../../src/server/ai/tasks";
import { isOpenRouterConfigured } from "../../src/lib/ai/openrouter";
import { DomainError } from "../../src/server/errors";
import type { OrganizationContext } from "../../src/server/auth/guards";

let checks = 0;
function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  checks++;
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    const ctx: OrganizationContext = {
      userId: member.userId,
      organizationId: member.organizationId,
      role: "OWNER",
    };

    console.log("\n[AI-006] Búsqueda asistida");

    await assistSearch(ctx, "a").then(
      () => {
        throw new Error("debía rechazar query corta");
      },
      (error) => {
        check(
          "query corta → DomainError",
          error instanceof DomainError && error.message.includes("2 y 200"),
        );
      },
    );

    if (!isOpenRouterConfigured()) {
      await assistSearch(ctx, "lista de clientes").then(
        () => {
          throw new Error("debía fallar sin API key");
        },
        (error) => {
          check(
            "sin OpenRouter → DomainError",
            error instanceof DomainError &&
              error.message.includes("OpenRouter"),
          );
        },
      );
    } else {
      const listed = await assistSearch(ctx, "lista de clientes activos");
      check(
        "list: mode list o find",
        listed.intent.mode === "list" || listed.intent.mode === "find",
      );
      check("list: hits es array", Array.isArray(listed.hits));
      check(
        "list: summary string",
        typeof listed.summary === "string" && listed.summary.length > 0,
      );

      const found = await assistSearch(ctx, "busca cliente");
      check(
        "find: mode find o list",
        found.intent.mode === "find" || found.intent.mode === "list",
      );
      check("find: hits array", Array.isArray(found.hits));

      const howto = await assistSearch(ctx, "cómo agrego un cliente?");
      check(
        "howto: mode howto o find",
        howto.intent.mode === "howto" || howto.intent.mode === "find",
      );
      check(
        "howto: hits con href o vacío válido",
        Array.isArray(howto.hits) &&
          howto.hits.every(
            (hit) =>
              typeof hit.title === "string" &&
              typeof hit.kind === "string" &&
              typeof hit.score === "number",
          ),
      );
    }

    console.log(`AI-006: ${checks}/${checks} OK`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
