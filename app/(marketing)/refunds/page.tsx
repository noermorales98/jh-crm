import type { Metadata } from "next";
import { LegalShell } from "@/src/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Política de reembolsos",
  description:
    "Plantilla de política de reembolsos de J&H Multiservices LLC (borrador — requiere revisión legal).",
};

export default function RefundsPage() {
  return (
    <LegalShell title="Política de reembolsos">
      <p>
        Plantilla / borrador de J&amp;H Multiservices LLC sobre reembolsos.
        No constituye política definitiva ni asesoría legal.
      </p>

      <h2>1. Consulta inicial</h2>
      <p>
        El envío del formulario de contacto no implica, por sí solo, un cobro
        automático. Si en el futuro se procesa un pago de consulta mediante una
        pasarela habilitada, las condiciones de reembolso de ese cargo se
        comunicarán en el momento del pago o en el acuerdo aplicable.
      </p>

      <h2>2. Servicios y planes de pago</h2>
      <p>
        Los reembolsos de honorarios, cuotas o planes de pago dependen del
        contrato o plan suscrito, del estado del trabajo realizado y de la ley
        aplicable. Esta plantilla no garantiza reembolsos totales ni parciales.
      </p>

      <h2>3. Solicitud</h2>
      <p>
        Para solicitar la revisión de un posible reembolso, escriba a{" "}
        <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>{" "}
        con su nombre, fecha del pago (si aplica), monto y motivo. Responderemos
        en un plazo razonable.
      </p>

      <h2>4. Excepciones</h2>
      <p>
        Pueden aplicarse excepciones legales (por ejemplo, derechos del
        consumidor según su jurisdicción). Consulte a un profesional si necesita
        asesoría sobre su caso.
      </p>
    </LegalShell>
  );
}
