import type { Role } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { decrypt, encrypt } from "@/src/lib/security/encryption";
import {
  MFA_LOCK_MINUTES,
  MFA_MAX_FAILED_ATTEMPTS,
  buildOtpauthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  matchRecoveryCode,
  verifyTotpCode,
} from "@/src/lib/security/mfa";
import { DomainError } from "@/src/server/errors";

/**
 * MFA TOTP para staff (OWNER/ADMIN/SPECIALIST recomendados).
 * Solo se exige verificación en login si mfaEnabled=true;
 * el enrolamiento sigue siendo opcional.
 */

/** Roles para los que se recomienda / aplica MFA cuando está activado. */
export function isMfaRequired(role: Role | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "SPECIALIST";
}

export async function getMfaStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      mfaEnabled: true,
      mfaVerifiedAt: true,
      mfaLockedUntil: true,
      email: true,
      memberships: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { role: true },
      },
    },
  });
  if (!user) throw new DomainError("Usuario no encontrado.");
  const role = user.memberships[0]?.role ?? null;
  return {
    mfaEnabled: user.mfaEnabled,
    mfaVerifiedAt: user.mfaVerifiedAt,
    mfaLockedUntil: user.mfaLockedUntil,
    recommended: isMfaRequired(role),
    role,
  };
}

/**
 * Inicia el enrolamiento: guarda secreto + recovery codes cifrados,
 * pero deja mfaEnabled=false hasta confirmMfaSetup.
 */
export async function beginMfaSetup(userId: string): Promise<{
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, mfaEnabled: true },
  });
  if (!user) throw new DomainError("Usuario no encontrado.");
  if (user.mfaEnabled) {
    throw new DomainError("La autenticación en dos pasos ya está activada.");
  }

  const { secret, base32 } = generateTotpSecret();
  const recoveryCodes = generateRecoveryCodes();
  const hashed = await hashRecoveryCodes(recoveryCodes);

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaSecretEncrypted: encrypt(base32),
      mfaRecoveryCodesEncrypted: encrypt(JSON.stringify(hashed)),
      mfaEnabled: false,
      mfaVerifiedAt: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
    },
  });

  return {
    secret: base32,
    otpauthUri: buildOtpauthUri({
      secret,
      accountName: user.email,
    }),
    recoveryCodes,
  };
}

/** Confirma el código TOTP y activa MFA. */
export async function confirmMfaSetup(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      mfaEnabled: true,
      mfaSecretEncrypted: true,
      mfaRecoveryCodesEncrypted: true,
    },
  });
  if (!user) throw new DomainError("Usuario no encontrado.");
  if (user.mfaEnabled) {
    throw new DomainError("La autenticación en dos pasos ya está activada.");
  }
  if (!user.mfaSecretEncrypted || !user.mfaRecoveryCodesEncrypted) {
    throw new DomainError("Inicia primero la configuración de MFA.");
  }

  const secret = decrypt(user.mfaSecretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    throw new DomainError("El código MFA no es válido. Inténtalo de nuevo.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaVerifiedAt: new Date(),
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
    },
  });
}

async function loadRecoveryHashes(encrypted: string | null): Promise<string[]> {
  if (!encrypted) return [];
  try {
    const parsed = JSON.parse(decrypt(encrypted)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((h): h is string => typeof h === "string");
  } catch {
    return [];
  }
}

/**
 * Verifica TOTP o código de recuperación.
 * Incrementa fallos y bloquea 15 min tras 5 intentos; limpia en éxito.
 */
export async function verifyMfaLogin(
  userId: string,
  codeOrRecovery: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      mfaEnabled: true,
      mfaSecretEncrypted: true,
      mfaRecoveryCodesEncrypted: true,
      mfaFailedAttempts: true,
      mfaLockedUntil: true,
    },
  });
  if (!user?.mfaEnabled || !user.mfaSecretEncrypted) return false;

  const now = new Date();
  if (user.mfaLockedUntil && user.mfaLockedUntil > now) {
    return false;
  }

  const secret = decrypt(user.mfaSecretEncrypted);
  const trimmed = codeOrRecovery.trim();
  let ok = verifyTotpCode(secret, trimmed);

  let remainingHashes: string[] | null = null;
  if (!ok) {
    const hashes = await loadRecoveryHashes(user.mfaRecoveryCodesEncrypted);
    const idx = await matchRecoveryCode(trimmed, hashes);
    if (idx >= 0) {
      ok = true;
      remainingHashes = hashes.filter((_, i) => i !== idx);
    }
  }

  if (ok) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
        ...(remainingHashes
          ? {
              mfaRecoveryCodesEncrypted: encrypt(JSON.stringify(remainingHashes)),
            }
          : {}),
      },
    });
    return true;
  }

  const attempts = user.mfaFailedAttempts + 1;
  const locked =
    attempts >= MFA_MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + MFA_LOCK_MINUTES * 60 * 1000)
      : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaFailedAttempts: locked ? 0 : attempts,
      mfaLockedUntil: locked,
    },
  });
  return false;
}

/** Desactiva MFA tras verificar código TOTP o de recuperación. */
export async function disableMfa(
  userId: string,
  codeOrRecovery: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true },
  });
  if (!user) throw new DomainError("Usuario no encontrado.");
  if (!user.mfaEnabled) {
    throw new DomainError("La autenticación en dos pasos no está activada.");
  }

  const ok = await verifyMfaLogin(userId, codeOrRecovery);
  if (!ok) {
    throw new DomainError(
      "Código inválido o cuenta bloqueada temporalmente. Espera e inténtalo de nuevo.",
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: false,
      mfaSecretEncrypted: null,
      mfaRecoveryCodesEncrypted: null,
      mfaVerifiedAt: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
    },
  });
}
