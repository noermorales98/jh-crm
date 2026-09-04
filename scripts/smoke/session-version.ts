/**
 * Verifica invalidación de sesión por sessionVersion / isActive
 * (hipótesis A/B de la auditoría beta).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  isTokenSessionCurrent,
  loadAuthTokenState,
} from "../../src/server/auth/session";
import { SESSION_MAX_AGE_SECONDS } from "../../src/server/auth/session-constants";

const prisma = new PrismaClient();

async function main() {
  const email = `e2e-session-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: "E2E Session",
      passwordHash: await bcrypt.hash("e2e-session-password", 10),
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: `E2E-Session-${Date.now()}`,
      members: { create: { userId: user.id, role: "STAFF" } },
      settings: { create: {} },
    },
  });

  const before = await loadAuthTokenState(user.id);
  if (!before || before.sessionVersion !== 1) {
    throw new Error(`Estado inicial inesperado: ${JSON.stringify(before)}`);
  }
  if (!isTokenSessionCurrent(before.sessionVersion, before.sessionVersion)) {
    throw new Error("Token fresco debería ser válido");
  }
  if (isTokenSessionCurrent(undefined, before.sessionVersion)) {
    throw new Error("Token sin sessionVersion no debe ser válido");
  }
  if (isTokenSessionCurrent(before.sessionVersion - 1, before.sessionVersion)) {
    throw new Error("Token con versión vieja no debe ser válido");
  }

  const bumped = await prisma.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
  });
  const afterBump = await loadAuthTokenState(user.id);
  if (
    !afterBump ||
    isTokenSessionCurrent(before.sessionVersion, afterBump.sessionVersion)
  ) {
    throw new Error("Tras bump, la versión antigua del token debe fallar");
  }
  if (bumped.sessionVersion !== 2) {
    throw new Error(`sessionVersion esperado 2, got ${bumped.sessionVersion}`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isActive: false, sessionVersion: { increment: 1 } },
  });
  const afterDeactivate = await loadAuthTokenState(user.id);
  if (afterDeactivate !== null) {
    throw new Error("Usuario inactivo debe devolver null");
  }

  if (SESSION_MAX_AGE_SECONDS < 60 * 60 * 24 * 365 * 5) {
    throw new Error("maxAge demasiado corto para sesión permanente");
  }

  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.delete({ where: { id: user.id } });

  console.log("SESSION_VERSION: OK");
  console.log("PERMANENT_MAX_AGE:", SESSION_MAX_AGE_SECONDS);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
