"use server";

import { revalidatePath } from "next/cache";
import {
  requirePermission,
  requirePortalSession,
} from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  invitePortalAccessSchema,
  portalUploadConfirmSchema,
  portalUploadRequestSchema,
  revokePortalAccessSchema,
} from "@/src/lib/validation/portal";
import { signContractSchema } from "@/src/lib/validation/contracts";
import * as portal from "@/src/server/portal";
import * as contracts from "@/src/server/contracts";

function revalidateClient(clientId: string) {
  revalidatePath(`/crm/clientes/${clientId}`);
  revalidatePath(`/crm/clientes/${clientId}/expediente`);
}

export async function invitePortalAccessAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("portal.manage");
    const data = invitePortalAccessSchema.parse(input);
    const access = await portal.invitePortalAccess(ctx, data);
    revalidateClient(data.clientId);
    return actionOk({ id: access.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function revokePortalAccessAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("portal.manage");
    const data = revokePortalAccessSchema.parse(input);
    const access = await portal.revokePortalAccess(ctx, data.clientId);
    revalidateClient(data.clientId);
    return actionOk({ id: access.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function requestPortalUploadAction(
  input: unknown,
): Promise<
  ActionResult<{
    url: string;
    storageKey: string;
    expiresInSeconds: number;
    maxBytes: number;
  }>
> {
  try {
    const portalCtx = await requirePortalSession();
    const data = portalUploadRequestSchema.parse(input);
    const upload = await portal.requestPortalUpload(portalCtx, data);
    return actionOk(upload);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function confirmPortalUploadAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const portalCtx = await requirePortalSession();
    const data = portalUploadConfirmSchema.parse(input);
    const document = await portal.confirmPortalUpload(portalCtx, data);
    revalidatePath("/portal/documentos");
    revalidatePath("/portal");
    return actionOk({ id: document.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function signPortalContractAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const portalCtx = await requirePortalSession();
    const data = signContractSchema.parse(input);
    const contract = await contracts.signContract(portalCtx, data);
    revalidatePath("/portal");
    revalidatePath("/portal/progreso");
    return actionOk({ id: contract.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function getPortalDocumentDownloadUrlAction(
  documentId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const portalCtx = await requirePortalSession();
    const id = cuidSchema.parse(documentId);
    const { url } = await portal.requestPortalDownload(portalCtx, id);
    return actionOk({ url });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
