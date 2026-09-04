/** Texto de consentimiento del intake público (versión fija). */
export const INTAKE_CONSENT = {
  consentType: "CLIENT_INTAKE",
  version: "2026-09-01",
  text: [
    "Autorizo a J&H Multiservices LLC a recibir y almacenar la información y",
    "documentos que envío mediante este formulario con el fin de evaluar y",
    "gestionar un posible servicio de reparación de crédito. Entiendo que mis",
    "datos se tratarán de forma confidencial y que puedo solicitar su eliminación",
    "según la política de la empresa.",
  ].join(" "),
} as const;

/** Hash SHA-256 hex en el navegador (Web Crypto). */
export async function hashIntakeConsentText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
