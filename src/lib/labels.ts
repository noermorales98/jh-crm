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

export const RECEIPT_STATUS_LABELS: Record<string, string> = {
  ISSUED: "Emitido",
  VOID: "Anulado",
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
  MAIL_SENT: "Correo enviado",
  MAIL_RECEIVED: "Correo recibido",
  CREDIT_REPORT_CREATED: "Reporte de crédito",
  CREDIT_REPORT_UPDATED: "Reporte actualizado",
  OTHER: "Otro",
};

export const CREDIT_REPORT_TYPE_LABELS: Record<string, string> = {
  INITIAL: "Inicial",
  UPDATE: "Actualización",
  MANUAL: "Manual",
};

export const CREDIT_BUREAU_LABELS: Record<string, string> = {
  EXPERIAN: "Experian",
  EQUIFAX: "Equifax",
  TRANSUNION: "TransUnion",
};

export const CREDIT_NEGATIVE_TYPE_LABELS: Record<string, string> = {
  COLLECTION: "Colección",
  CHARGE_OFF: "Charge-off",
  LATE_PAYMENT: "Pago atrasado",
  REPOSSESSION: "Reposesión",
  BANKRUPTCY: "Bancarrota",
  HARD_INQUIRY: "Consulta dura",
  FORECLOSURE: "Foreclosure",
  OTHER: "Otro",
};

export const CREDIT_ITEM_LIFECYCLE_LABELS: Record<string, string> = {
  IDENTIFIED: "Identificado",
  UNDER_REVIEW: "En revisión",
  SELECTED: "Seleccionado",
  DISPUTED: "En disputa",
  RESOLVED: "Resuelto",
  EXCLUDED: "Excluido",
};

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  TASK_DUE: "Recordatorio de tarea",
  TASK_OVERDUE: "Tarea vencida",
  CASE_REVIEW_DUE: "Revisión de caso",
  ROUND_REVIEW_DUE: "Revisión de ronda",
  PAYMENT_DUE: "Pago pendiente",
  SYSTEM: "Sistema",
  DAILY_DIGEST: "Resumen diario",
  MAIL_RECEIVED: "Correo nuevo",
  CONTACT_FORM: "Formulario de contacto",
  INTAKE_SUBMITTED: "Registro de intake",
};

export const MAIL_FOLDER_LABELS: Record<string, string> = {
  INBOX: "Bandeja de entrada",
  SENT: "Enviados",
  DRAFTS: "Borradores",
  ARCHIVE: "Archivados",
  SPAM: "Spam",
  TRASH: "Papelera",
};

export function labelFor(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}
