/**
 * Pasarela de cobro de consultas. AU-005: Stripe por organización.
 */
import {
  getStripeSettings,
  isConsultationPaymentsEnvBlocked,
  isStripeConfigured,
} from "@/src/server/payments/stripe";

export interface ConsultationPaymentGateway {
  isConfigured(organizationId: string): Promise<boolean>;
}

export const stripeConsultationGateway: ConsultationPaymentGateway = {
  async isConfigured(organizationId: string) {
    if (isConsultationPaymentsEnvBlocked()) return false;
    const settings = await getStripeSettings(organizationId);
    return Boolean(settings && isStripeConfigured(settings));
  },
};

export function getConsultationPaymentGateway(): ConsultationPaymentGateway {
  return stripeConsultationGateway;
}
