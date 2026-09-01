/**
 * Etiquetas en español para los enums del dominio.
 * Archivo puro (sin server-only): usable en Server y Client Components.
 */

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  LEAD: "Prospecto",
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
  ARCHIVED: "Archivado",
};

export const CASE_STATE_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  PAUSED: "Pausado",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

export const ROUND_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  PREPARING: "En preparación",
  SENT: "Enviada",
  WAITING_UPDATE: "Esperando actualización",
  REVIEWING: "En revisión",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  FOLLOW_UP: "Seguimiento",
  REQUEST_DOCUMENT: "Solicitar documento",
  REQUEST_PAYMENT: "Solicitar pago",
  CREDIT_UPDATE: "Actualización de crédito",
  PREPARE_ROUND: "Preparar ronda",
  CALL: "Llamada",
  MESSAGE: "Mensaje",
  REVIEW_RESULT: "Revisar resultado",
  OTHER: "Otra",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  LOW: "Baja",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  EXPIRED: "Vencida",
  PARTIAL: "Pago parcial",
  PAID: "Pagada",
  CANCELLED: "Cancelada",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  RECEIVED: "Recibido",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ZELLE: "Zelle",
  STRIPE: "Stripe",
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  OTHER: "Otro",
};

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  IDENTITY: "Identificación",
  PROOF_OF_ADDRESS: "Comprobante de domicilio",
  SSN_DOCUMENT: "Documento de SSN",
  CREDIT_REPORT: "Reporte de crédito",
  DISPUTE_LETTER: "Carta de disputa",
  UPDATE_REPORT: "Reporte de actualización",
  PAYMENT_PROOF: "Comprobante de pago",
  OTHER: "Otro",
};

export const DOCUMENT_SENSITIVITY_LABELS: Record<string, string> = {
  INTERNAL: "Interno",
  CONFIDENTIAL: "Confidencial",
  HIGHLY_SENSITIVE: "Altamente sensible",
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  CREATED: "Creación",
  NOTE: "Nota",
  STATUS_CHANGE: "Cambio de estado",
  STAGE_CHANGE: "Cambio de etapa",
  DOCUMENT_UPLOAD: "Documento subido",
  DOCUMENT_DELETE: "Documento eliminado",
  ROUND_CREATED: "Ronda creada",
  ROUND_SENT: "Ronda enviada",
  ROUND_REVIEWED: "Ronda revisada",
  TASK_CREATED: "Tarea creada",
  TASK_COMPLETED: "Tarea completada",
  QUOTE_CREATED: "Cotización creada",
  QUOTE_SENT: "Cotización enviada",
  PAYMENT_RECORDED: "Pago registrado",
  RECEIPT_CREATED: "Recibo emitido",
  OTHER: "Otro",
};

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  TASK_DUE: "Recordatorio de tarea",
  TASK_OVERDUE: "Tarea vencida",
  CASE_REVIEW_DUE: "Revisión de caso",
  ROUND_REVIEW_DUE: "Revisión de ronda",
  PAYMENT_DUE: "Pago pendiente",
  SYSTEM: "Sistema",
};

export function labelFor(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}
