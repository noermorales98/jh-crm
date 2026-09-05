"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import * as mfa from "@/src/server/mfa";

const codeSchema = z.string().trim().min(1, "Código requerido.").max(64);

function revalidateMfa() {
  revalidatePath("/crm/configuracion/seguridad");
}

export async function getMfaStatusAction(): Promise<
  ActionResult<{
    mfaEnabled: boolean;
    mfaVerifiedAt: Date | null;
    mfaLockedUntil: Date | null;
    recommended: boolean;
  }>
> {
  try {
    const session = await requireSession();
    const status = await mfa.getMfaStatus(session.user.id);
    return actionOk({
      mfaEnabled: status.mfaEnabled,
      mfaVerifiedAt: status.mfaVerifiedAt,
      mfaLockedUntil: status.mfaLockedUntil,
      recommended: status.recommended,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function beginMfaSetupAction(): Promise<
  ActionResult<{ secret: string; otpauthUri: string; recoveryCodes: string[] }>
> {
  try {
    const session = await requireSession();
    const setup = await mfa.beginMfaSetup(session.user.id);
    revalidateMfa();
    return actionOk(setup);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function confirmMfaSetupAction(
  code: unknown,
): Promise<ActionResult<{ enabled: true }>> {
  try {
    const session = await requireSession();
    const token = codeSchema.parse(code);
    await mfa.confirmMfaSetup(session.user.id, token);
    revalidateMfa();
    return actionOk({ enabled: true as const });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function disableMfaAction(
  codeOrRecovery: unknown,
): Promise<ActionResult<{ disabled: true }>> {
  try {
    const session = await requireSession();
    const token = codeSchema.parse(codeOrRecovery);
    await mfa.disableMfa(session.user.id, token);
    revalidateMfa();
    return actionOk({ disabled: true as const });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
