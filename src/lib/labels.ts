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

export const SERVICE_CASE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  ON_HOLD: "En espera",
  COMPLETED: "Completado",
  CANCELED: "Cancelado",
};

export const FUNDING_APPLICATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviada",
  UNDER_REVIEW: "En revisión",
  APPROVED: "Aprobada",
  DENIED: "Denegada",
  FUNDED: "Fondeada",
  WITHDRAWN: "Retirada",
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
  CONTRACT: "Contrato",
  INVOICE: "Factura",
  RECEIPT: "Recibo",
  BANK_DOCUMENT: "Documento bancario",
  BUSINESS_DOCUMENT: "Documento de negocio",
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
  DOCUMENT_HARD_DELETED: "Documento eliminado (permanente)",
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
  DISPUTE_ITEM_ADDED: "Elemento disputado",
  DISPUTE_ITEM_UPDATED: "Disputa actualizada",
  COMPARISON_CREATED: "Comparación creada",
  COMPARISON_UPDATED: "Comparación actualizada",
  LETTER_CREATED: "Carta creada",
  LETTER_UPDATED: "Carta actualizada",
  LETTER_FINALIZED: "Carta finalizada",
  PROGRESS_REPORT_GENERATED: "Reporte de progreso",
  OPPORTUNITY_CREATED: "Oportunidad creada",
  OPPORTUNITY_STAGE_CHANGED: "Etapa de oportunidad",
  OPPORTUNITY_WON: "Oportunidad ganada",
  PROCESSOR_LINKED: "Procesador vinculado",
  PAYMENT_PLAN_CREATED: "Plan de pago creado",
  CONSULTATION_REQUESTED: "Consulta solicitada",
  PORTAL_ACCESS_INVITED: "Portal invitado",
  PORTAL_ACCESS_REVOKED: "Portal revocado",
  CONTRACT_CREATED: "Contrato creado",
  CONTRACT_SIGNED: "Contrato firmado",
  OTHER: "Otro",
};

export const PAYMENT_PLAN_FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  CUSTOM: "Personalizada",
};

export const PAYMENT_PLAN_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
  PAUSED: "Pausado",
};

export const PAYMENT_INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagada",
  CANCELLED: "Cancelada",
  OVERDUE: "Vencida",
};

export const CONSULTATION_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Solicitada",
  PAYMENT_PENDING: "Pago pendiente",
  PAID: "Pagada",
  SCHEDULED: "Agendada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export const LEAD_CHANNEL_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  WEBSITE: "Sitio web",
  REFERRAL: "Referido",
  MANUAL: "Manual",
  OTHER: "Otro",
};

export const OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: "Nuevo lead",
  CONTACTED: "Contactado",
  CONSULTATION: "Consulta",
  INTAKE_SENT: "Formulario enviado",
  INTAKE_COMPLETED: "Formulario completado",
  PROPOSAL: "Propuesta",
  WAITING_PAYMENT: "Esperando pago",
  WON: "Ganada",
  LOST: "Perdida",
};

export const PROCESSOR_ACCOUNT_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planificada",
  ACTIVE: "Activa",
  EXPIRED: "Vencida",
  CANCELLED: "Cancelada",
};

export const INTAKE_PRIMARY_GOAL_LABELS: Record<string, string> = {
  HOME_PURCHASE: "Compra de vivienda",
  VEHICLE: "Vehículo",
  BUSINESS: "Negocio",
  PERSONAL: "Personal",
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

export const DISPUTE_ITEM_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SELECTED: "Seleccionado",
  LETTER_GENERATED: "Carta generada",
  SENT: "Enviado",
  WAITING: "En espera",
  RESPONDED: "Respondido",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

export const DISPUTE_OUTCOME_LABELS: Record<string, string> = {
  DELETED: "Eliminado",
  UPDATED: "Actualizado",
  VERIFIED: "Verificado",
  NO_CHANGE: "Sin cambio",
  NOT_RESPONDED: "Sin respuesta",
  NEW_INFORMATION: "Nueva información",
  OTHER: "Otro",
};

export const COMPARISON_RESULT_LABELS: Record<string, string> = {
  DELETED: "Eliminado",
  UPDATED: "Actualizado",
  VERIFIED: "Verificado",
  UNCHANGED: "Sin cambio",
  NEW: "Nuevo",
};

export const DISPUTE_LETTER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  READY_FOR_REVIEW: "Listo para revisión",
  FINAL: "Final",
  SENT: "Enviada",
  CANCELLED: "Cancelada",
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviado",
  SIGNED: "Firmado",
  CANCELLED: "Cancelado",
  EXPIRED: "Expirado",
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
  INTAKE_SUBMITTED: "Registro de formulario",
  CONSULTATION_REQUESTED: "Consulta solicitada",
  PORTAL_MESSAGE: "Mensaje del portal",
  CONTRACT_READY: "Contrato listo",
  META_LEAD: "Lead de Meta",
  CREDIT_PDF_IMPORT: "Importación PDF crédito",
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

export const TESTIMONIAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente de revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};
