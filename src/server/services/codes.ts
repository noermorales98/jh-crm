/**
 * Códigos estables de vertical para Service.code (SC-001).
 * No son enum Prisma: permiten ampliar sin migrate de enum.
 */
export const SERVICE_CODES = [
  "CREDIT_REPAIR",
  "HOME_BUYER",
  "BUSINESS_CREDIT",
  "PERSONAL_LOAN",
  "WEB_DEVELOPMENT",
  "CRM_DEVELOPMENT",
] as const;

export type ServiceCode = (typeof SERVICE_CODES)[number];

export function isServiceCode(value: string): value is ServiceCode {
  return (SERVICE_CODES as readonly string[]).includes(value);
}

export function assertServiceCode(value: string): ServiceCode {
  if (!isServiceCode(value)) {
    throw new Error(`Código de servicio inválido: ${value}`);
  }
  return value;
}
