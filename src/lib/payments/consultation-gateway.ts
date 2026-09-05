/**
 * Pasarela de cobro de consultas ($1). Stub: nunca fuerza PAID.
 * Cuando exista Stripe u otro procesador, implementar `isConfigured` real.
 */

export interface ConsultationPaymentGateway {
  isConfigured(): boolean;
}

export const stubConsultationGateway: ConsultationPaymentGateway = {
  isConfigured() {
    return false;
  },
};

export function getConsultationPaymentGateway(): ConsultationPaymentGateway {
  return stubConsultationGateway;
}
