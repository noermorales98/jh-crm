import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { encrypt, decrypt } from "@/src/lib/security/encryption";
import {
  assertCallmebotPhone,
  formatWhatsappNotification,
  sendCallmebotMessage,
} from "@/src/server/notifications/callmebot";
import { createNotification } from "@/src/server/notifications";

/**
 * Configuración de la organización: datos de empresa, moneda, impuesto,
 * prefijos de folios, etapas y notificaciones WhatsApp (CallMeBot).
 */

export interface SettingsUpdateData {
  legalName?: string;
  logoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string;
  timezone?: string;
  currency?: string;
  defaultTaxRate?: Prisma.Decimal | number | string;
  quotePrefix?: string;
  receiptPrefix?: string;
  clientPrefix?: string;
  casePrefix?: string;
  defaultTerms?: string | null;
  callmebotEnabled?: boolean;
  callmebotPhone?: string | null;
  callmebotApiKey?: string | null;
}

export async function getSettings(ctx: OrganizationContext) {
  // Bootstrap garantiza su existencia; upsert vacío por seguridad.
  return prisma.organizationSettings.upsert({
    where: { organizationId: ctx.organizationId },
    update: {},
    create: { organizationId: ctx.organizationId },
  });
}

/** Vista segura para el formulario: nunca se envía el API key descifrado. */
export async function getSettingsFormValues(ctx: OrganizationContext) {
  const settings = await getSettings(ctx);
  return {
    legalName: settings.legalName,
    logoUrl: settings.logoUrl ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    website: settings.website ?? "",
    addressLine1: settings.addressLine1 ?? "",
    addressLine2: settings.addressLine2 ?? "",
    city: settings.city ?? "",
    state: settings.state ?? "",
    postalCode: settings.postalCode ?? "",
    country: settings.country,
    timezone: settings.timezone,
    currency: settings.currency,
    defaultTaxRate: settings.defaultTaxRate.toString(),
    quotePrefix: settings.quotePrefix,
    receiptPrefix: settings.receiptPrefix,
    clientPrefix: settings.clientPrefix,
    casePrefix: settings.casePrefix,
    defaultTerms: settings.defaultTerms ?? "",
    callmebotEnabled: settings.callmebotEnabled,
    callmebotPhone: settings.callmebotPhone ?? "",
    callmebotApiKeyConfigured: Boolean(settings.callmebotApiKeyEncrypted),
  };
}

const PREFIX_REGEX = /^[A-Z]{1,10}$/;

export async function updateSettings(ctx: OrganizationContext, data: SettingsUpdateData) {
  for (const [field, value] of Object.entries({
    quotePrefix: data.quotePrefix,
    receiptPrefix: data.receiptPrefix,
    clientPrefix: data.clientPrefix,
    casePrefix: data.casePrefix,
  })) {
    if (value !== undefined && !PREFIX_REGEX.test(value)) {
      throw new DomainError(`El prefijo ${field} debe ser de 1 a 10 letras mayúsculas.`);
    }
  }
  if (data.defaultTaxRate !== undefined) {
    const rate = new Prisma.Decimal(data.defaultTaxRate);
    if (rate.lt(0) || rate.gt(100)) {
      throw new DomainError("La tasa de impuesto debe estar entre 0 y 100.");
    }
  }

  const current = await getSettings(ctx);
  let callmebotPhone: string | null | undefined;
  let callmebotApiKeyEncrypted: string | undefined;

  if (data.callmebotEnabled) {
    const phoneSource =
      data.callmebotPhone !== undefined
        ? data.callmebotPhone
        : current.callmebotPhone;
    if (!phoneSource) {
      throw new DomainError(
        "Indica el número de WhatsApp (con código de país) para activar CallMeBot.",
      );
    }
    callmebotPhone = assertCallmebotPhone(phoneSource);
    const hasKey =
      Boolean(current.callmebotApiKeyEncrypted) ||
      Boolean(data.callmebotApiKey?.trim());
    if (!hasKey) {
      throw new DomainError(
        "Pega el API key que te envió CallMeBot por WhatsApp para activar las notificaciones.",
      );
    }
  } else if (data.callmebotPhone) {
    callmebotPhone = assertCallmebotPhone(data.callmebotPhone);
  } else if (data.callmebotPhone === null) {
    callmebotPhone = null;
  }

  if (data.callmebotApiKey?.trim()) {
    callmebotApiKeyEncrypted = encrypt(data.callmebotApiKey.trim());
  }

  return prisma.organizationSettings.update({
    where: { organizationId: ctx.organizationId },
    data: {
      ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.website !== undefined ? { website: data.website } : {}),
      ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
      ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
      ...(data.country !== undefined ? { country: data.country } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.defaultTaxRate !== undefined
        ? { defaultTaxRate: new Prisma.Decimal(data.defaultTaxRate) }
        : {}),
      ...(data.quotePrefix !== undefined ? { quotePrefix: data.quotePrefix } : {}),
      ...(data.receiptPrefix !== undefined ? { receiptPrefix: data.receiptPrefix } : {}),
      ...(data.clientPrefix !== undefined ? { clientPrefix: data.clientPrefix } : {}),
      ...(data.casePrefix !== undefined ? { casePrefix: data.casePrefix } : {}),
      ...(data.defaultTerms !== undefined ? { defaultTerms: data.defaultTerms } : {}),
      ...(data.callmebotEnabled !== undefined
        ? { callmebotEnabled: data.callmebotEnabled }
        : {}),
      ...(callmebotPhone !== undefined ? { callmebotPhone } : {}),
      ...(callmebotApiKeyEncrypted !== undefined
        ? { callmebotApiKeyEncrypted }
        : {}),
    },
  });
}

export async function sendTestWhatsapp(ctx: OrganizationContext) {
  const settings = await getSettings(ctx);
  if (!settings.callmebotPhone || !settings.callmebotApiKeyEncrypted) {
    throw new DomainError(
      "Guarda primero el número y el API key de CallMeBot.",
    );
  }
  let apiKey: string;
  try {
    apiKey = decrypt(settings.callmebotApiKeyEncrypted);
  } catch {
    throw new DomainError(
      "No se pudo leer el API key guardado. Vuelve a pegarlo y guarda de nuevo.",
    );
  }
  const result = await sendCallmebotMessage({
    phone: settings.callmebotPhone,
    apiKey,
    text: formatWhatsappNotification({
      title: "Mensaje de prueba",
      body: "Las notificaciones de WhatsApp de J&H CRM están activas.",
      link: "/crm/dashboard",
    }),
  });
  await createNotification({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    type: "SYSTEM",
    title: "Mensaje de prueba",
    body: "Se envió un WhatsApp de prueba con CallMeBot.",
    link: "/crm/configuracion",
    skipWhatsapp: true,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Etapas del flujo (WorkflowStage)
// ---------------------------------------------------------------------------

export interface StageData {
  key: string;
  name: string;
  color?: string;
  isTerminal?: boolean;
}

const STAGE_KEY_REGEX = /^[A-Z][A-Z0-9_]{0,39}$/;

export async function listStages(ctx: OrganizationContext, includeInactive = false) {
  return prisma.workflowStage.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { order: "asc" },
  });
}

export async function createStage(ctx: OrganizationContext, data: StageData) {
  if (!STAGE_KEY_REGEX.test(data.key)) {
    throw new DomainError("La clave de la etapa debe ser MAYÚSCULAS_CON_GUIONES.");
  }
  return prisma.$transaction(async (tx) => {
    const last = await tx.workflowStage.findFirst({
      where: { organizationId: ctx.organizationId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    return tx.workflowStage.create({
      data: {
        organizationId: ctx.organizationId,
        key: data.key,
        name: data.name,
        order: (last?.order ?? 0) + 1,
        color: data.color ?? "#64748B",
        isTerminal: data.isTerminal ?? false,
      },
    });
  });
}

export async function updateStage(
  ctx: OrganizationContext,
  stageId: string,
  data: Partial<StageData>,
) {
  const stage = await prisma.workflowStage.findFirst({
    where: { id: stageId, organizationId: ctx.organizationId },
  });
  if (!stage) throw new DomainError("Etapa no encontrada.");
  if (data.key !== undefined && !STAGE_KEY_REGEX.test(data.key)) {
    throw new DomainError("La clave de la etapa debe ser MAYÚSCULAS_CON_GUIONES.");
  }
  return prisma.workflowStage.update({
    where: { id: stage.id },
    data: {
      ...(data.key !== undefined ? { key: data.key } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.isTerminal !== undefined ? { isTerminal: data.isTerminal } : {}),
    },
  });
}

/**
 * Reordena etapas. `orderedIds` debe contener TODAS las etapas activas
 * e inactivas de la organización para evitar colisiones del índice
 * @@unique([organizationId, order]). Se hace en dos fases.
 */
export async function reorderStages(ctx: OrganizationContext, orderedIds: string[]) {
  const stages = await prisma.workflowStage.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true },
  });
  const existing = new Set(stages.map((s) => s.id));
  if (orderedIds.length !== stages.length || orderedIds.some((id) => !existing.has(id))) {
    throw new DomainError("La lista de etapas a reordenar no coincide con las etapas actuales.");
  }

  return prisma.$transaction(async (tx) => {
    // Fase 1: órdenes temporales negativas (evitan choques de unicidad).
    for (const [index, id] of orderedIds.entries()) {
      await tx.workflowStage.update({
        where: { id },
        data: { order: -(index + 1) },
      });
    }
    // Fase 2: orden definitivo 1..N.
    for (const [index, id] of orderedIds.entries()) {
      await tx.workflowStage.update({
        where: { id },
        data: { order: index + 1 },
      });
    }
    return listStages(ctx, true);
  });
}

/** Desactivar (no borrar). Los casos que la usan conservan su etapa. */
export async function deactivateStage(ctx: OrganizationContext, stageId: string) {
  const stage = await prisma.workflowStage.findFirst({
    where: { id: stageId, organizationId: ctx.organizationId },
    include: { _count: { select: { cases: true } } },
  });
  if (!stage) throw new DomainError("Etapa no encontrada.");
  if (!stage.isActive) throw new DomainError("La etapa ya está inactiva.");

  const activeCount = await prisma.workflowStage.count({
    where: { organizationId: ctx.organizationId, isActive: true },
  });
  if (activeCount <= 1) {
    throw new DomainError("Debe quedar al menos una etapa activa.");
  }

  return prisma.workflowStage.update({
    where: { id: stage.id },
    data: { isActive: false },
  });
}
