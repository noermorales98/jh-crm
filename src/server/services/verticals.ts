import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { SERVICE_CODES, type ServiceCode } from "@/src/server/services/codes";

/**
 * Fase 5 — Catálogo de verticales secundarios.
 *
 * Cada vertical tiene un Service (code estable) y sus WorkflowStage por
 * defecto (única fuente de stage, D3). `ensureVerticalService` es
 * idempotente: crea el servicio si falta y siembra las etapas que falten
 * (por key), sin tocar las existentes ni las personalizadas por la org.
 */

interface StageDef {
  key: string;
  name: string;
  order: number;
  color: string;
  isTerminal?: boolean;
}

interface VerticalDef {
  name: string;
  description: string;
  stages: StageDef[];
}

/** Verticales con extensión 1:1 (todas menos CREDIT_REPAIR). */
export const VERTICAL_DEFS: Partial<Record<ServiceCode, VerticalDef>> = {
  // HB-001 — pipeline de compra de casa.
  HOME_BUYER: {
    name: "Compra de Casa",
    description: "Acompañamiento al cliente hasta estar listo para referir a un realtor/lender.",
    stages: [
      { key: "CONSULTA", name: "Consulta", order: 1, color: "#0A84FF" },
      { key: "EVALUACION_CREDITO", name: "Evaluación de crédito", order: 2, color: "#5E5CE6" },
      { key: "OBJETIVO", name: "Objetivo definido", order: 3, color: "#64D2FF" },
      { key: "PLAN", name: "Plan de acción", order: 4, color: "#FFD60A" },
      { key: "SEGUIMIENTO", name: "Seguimiento", order: 5, color: "#FF9F0A" },
      { key: "LISTO_REFERENCIA", name: "Listo para referencia", order: 6, color: "#30D158" },
      { key: "REFERIDO", name: "Referido", order: 7, color: "#32ADE6", isTerminal: true },
      { key: "COMPLETADO", name: "Completado", order: 8, color: "#8E8E93", isTerminal: true },
    ],
  },
  // FD-001 — funding / crédito de negocio.
  BUSINESS_CREDIT: {
    name: "Financiamiento de Negocio",
    description: "Preparación y aplicación a financiamiento comercial.",
    stages: [
      { key: "CONSULTA", name: "Consulta", order: 1, color: "#0A84FF" },
      { key: "DOCUMENTACION", name: "Documentación", order: 2, color: "#FFD60A" },
      { key: "APLICACIONES", name: "Aplicaciones", order: 3, color: "#FF9F0A" },
      { key: "NEGOCIACION", name: "Negociación", order: 4, color: "#5E5CE6" },
      { key: "FONDEO", name: "Fondeo", order: 5, color: "#30D158" },
      { key: "COMPLETADO", name: "Completado", order: 6, color: "#8E8E93", isTerminal: true },
    ],
  },
  // PL-001 — préstamo personal.
  PERSONAL_LOAN: {
    name: "Préstamo Personal",
    description: "Precalificación y gestión de préstamo personal.",
    stages: [
      { key: "CONSULTA", name: "Consulta", order: 1, color: "#0A84FF" },
      { key: "PRECALIFICACION", name: "Precalificación", order: 2, color: "#5E5CE6" },
      { key: "DOCUMENTACION", name: "Documentación", order: 3, color: "#FFD60A" },
      { key: "APROBACION", name: "Aprobación", order: 4, color: "#FF9F0A" },
      { key: "DESEMBOLSO", name: "Desembolso", order: 5, color: "#30D158" },
      { key: "COMPLETADO", name: "Completado", order: 6, color: "#8E8E93", isTerminal: true },
    ],
  },
  // PJ-001 — proyectos web.
  WEB_DEVELOPMENT: {
    name: "Desarrollo Web",
    description: "Proyecto de sitio web o landing del cliente.",
    stages: [
      { key: "BRIEF", name: "Brief", order: 1, color: "#0A84FF" },
      { key: "PROPUESTA", name: "Propuesta", order: 2, color: "#5E5CE6" },
      { key: "EN_DESARROLLO", name: "En desarrollo", order: 3, color: "#FF9F0A" },
      { key: "REVISION", name: "Revisión", order: 4, color: "#FFD60A" },
      { key: "ENTREGADO", name: "Entregado", order: 5, color: "#30D158", isTerminal: true },
    ],
  },
  CRM_DEVELOPMENT: {
    name: "Desarrollo CRM",
    description: "Proyecto de CRM o sistema a medida para el cliente.",
    stages: [
      { key: "BRIEF", name: "Brief", order: 1, color: "#0A84FF" },
      { key: "PROPUESTA", name: "Propuesta", order: 2, color: "#5E5CE6" },
      { key: "EN_DESARROLLO", name: "En desarrollo", order: 3, color: "#FF9F0A" },
      { key: "REVISION", name: "Revisión", order: 4, color: "#FFD60A" },
      { key: "ENTREGADO", name: "Entregado", order: 5, color: "#30D158", isTerminal: true },
    ],
  },
};

export function getVerticalDef(code: string): VerticalDef | null {
  return (VERTICAL_DEFS as Record<string, VerticalDef>)[code] ?? null;
}

export interface VerticalServiceOption {
  code: ServiceCode;
  name: string;
  stages: { id: string; name: string; color: string }[];
}

/**
 * Catálogo completo de verticales para el selector de "Nuevo expediente".
 * Si el servicio aún no existe en la org, viene con `stages: []` y el
 * backend siembra las etapas por defecto al crear el expediente.
 */
export async function listVerticalServiceOptions(
  organizationId: string,
): Promise<VerticalServiceOption[]> {
  const services = await prisma.service.findMany({
    where: {
      organizationId,
      code: { in: [...SERVICE_CODES] },
      isActive: true,
    },
    select: {
      code: true,
      name: true,
      workflowStages: {
        where: { isActive: true },
        orderBy: { order: "asc" },
        select: { id: true, name: true, color: true },
      },
    },
  });

  return SERVICE_CODES.map((code) => {
    const found = services.find((s) => s.code === code);
    return {
      code,
      name:
        found?.name ??
        (code === "CREDIT_REPAIR"
          ? "Credit Repair"
          : (getVerticalDef(code)?.name ?? code)),
      stages: found?.workflowStages ?? [],
    };
  });
}

/**
 * Garantiza Service del vertical + sus WorkflowStage por defecto.
 * Idempotente; seguro de llamar dentro de una transacción.
 */
export async function ensureVerticalService(
  organizationId: string,
  code: ServiceCode,
  tx?: Prisma.TransactionClient,
) {
  const def = getVerticalDef(code);
  const db = tx ?? prisma;

  let service = await db.service.findFirst({
    where: { organizationId, code },
  });
  if (!service && def) {
    const nameTaken = await db.service.findFirst({
      where: { organizationId, name: def.name },
      select: { id: true },
    });
    service = await db.service.create({
      data: {
        organizationId,
        code,
        name: nameTaken ? `${def.name} [${organizationId.slice(0, 8)}]` : def.name,
        description: def.description,
        defaultPrice: 0,
        currency: "USD",
        isActive: true,
      },
    });
  }
  if (!service) {
    // Sin def (CREDIT_REPAIR u otro): el servicio debe existir ya.
    throw new Error(`Servicio con code ${code} no existe en la organización.`);
  }

  if (def) {
    for (const stage of def.stages) {
      const existing = await db.workflowStage.findFirst({
        where: { organizationId, serviceId: service.id, key: stage.key },
        select: { id: true },
      });
      if (existing) continue;
      const orderTaken = await db.workflowStage.findFirst({
        where: { organizationId, serviceId: service.id, order: stage.order },
        select: { id: true },
      });
      await db.workflowStage.create({
        data: {
          organizationId,
          serviceId: service.id,
          key: stage.key,
          name: stage.name,
          // Si el orden choca con una etapa personalizada, va al final.
          order: orderTaken ? 100 + stage.order : stage.order,
          color: stage.color,
          isTerminal: stage.isTerminal ?? false,
          isActive: true,
        },
      });
    }
  }

  return service;
}
