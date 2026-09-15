/**
 * Smoke MFA login enforcement: verifyMfaLogin con TOTP real, fallos y lockout.
 * Replica la decisión del authorize de auth.ts (password ok + mfaEnabled):
 * sin código → mfa_required; código inválido → mfa_invalid; válido → acceso.
 *
 * Uso: npx tsx --env-file=.env.local scripts/smoke/mfa-login-enforcement.ts
 */
import { PrismaClient } from "@prisma/client";
import { Secret, TOTP } from "otpauth";
import {
  beginMfaSetup,
  confirmMfaSetup,
  verifyMfaLogin,
} from "../../src/server/mfa";

const MARK = `mfa-${Date.now()}`;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

function currentTotp(base32: string): string {
  const totp = new TOTP({
    issuer: "J&H CRM",
    label: MARK,
    secret: Secret.fromBase32(base32),
  });
  return totp.generate();
}

async function main() {
  const prisma = new PrismaClient();
  let userId: string | null = null;

  try {
    console.log("\n[MFA] Enforcement de login (verifyMfaLogin)");

    const user = await prisma.user.create({
      data: {
        email: `${MARK}@example.test`,
        name: `Smoke ${MARK}`,
        passwordHash: "smoke",
        isActive: true,
      },
    });
    userId = user.id;

    // Enrolamiento real: begin → confirm con TOTP válido.
    const setup = await beginMfaSetup(user.id);
    await confirmMfaSetup(user.id, currentTotp(setup.secret));

    const enabled = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mfaEnabled: true },
    });
    check("mfaEnabled tras enrolamiento", enabled.mfaEnabled);

    // Decisión del authorize: sin código → mfa_required (no se llama verify).
    // Con código inválido → verifyMfaLogin false → mfa_invalid.
    const wrong = await verifyMfaLogin(user.id, "000000");
    check("código inválido rechazado", wrong === false);

    const attempts = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mfaFailedAttempts: true },
    });
    check("fallo registrado", attempts.mfaFailedAttempts === 1);

    // Código válido limpia los fallos.
    const ok = await verifyMfaLogin(user.id, currentTotp(setup.secret));
    check("código válido aceptado", ok === true);
    const cleared = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mfaFailedAttempts: true, mfaLockedUntil: true },
    });
    check(
      "éxito limpia fallos y lockout",
      cleared.mfaFailedAttempts === 0 && cleared.mfaLockedUntil === null,
    );

    // Lockout: 5 fallos seguidos → bloqueado 15 min; ni el código válido entra.
    for (let i = 0; i < 5; i += 1) {
      await verifyMfaLogin(user.id, "999999");
    }
    const locked = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mfaLockedUntil: true },
    });
    check(
      "tras 5 fallos hay lockout",
      locked.mfaLockedUntil !== null && locked.mfaLockedUntil > new Date(),
    );
    const whileLocked = await verifyMfaLogin(user.id, currentTotp(setup.secret));
    check("lockout rechaza incluso código válido", whileLocked === false);

    // Recovery code funciona como segundo factor (tras limpiar lockout).
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaLockedUntil: null, mfaFailedAttempts: 0 },
    });
    const recovery = setup.recoveryCodes[0];
    const recoveryOk = await verifyMfaLogin(user.id, recovery);
    check("código de recuperación aceptado", recoveryOk === true);
    const recoveryReuse = await verifyMfaLogin(user.id, recovery);
    check("recovery code es de un solo uso", recoveryReuse === false);

    console.log(JSON.stringify({ ok: true }, null, 2));
  } finally {
    console.log("\n[cleanup]");
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
