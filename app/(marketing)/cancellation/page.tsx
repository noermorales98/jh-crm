import type { Metadata } from "next";
import { LegalShell } from "@/src/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Política de cancelación",
  description:
    "Plantilla de política de cancelación de J&H Multiservices LLC (borrador — requiere revisión legal).",
};

export default function CancellationPage() {
  return (
    <LegalShell title="Política de cancelación">
      <p>
        Esta página es una plantilla / borrador de J&amp;H Multiservices LLC
        sobre cancelación de servicios o solicitudes. Requiere revisión legal
        antes de considerarse definitiva.
      </p>

      <h2>1. Solicitudes de consulta</h2>
      <p>
        Puede solicitar que no le contactemos respecto a una consulta enviada
        por el formulario escribiendo a{" "}
        <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>{" "}
        o llamando al (872) 202-0156, e indicando su nombre y datos de contacto.
      </p>

      <h2>2. Servicios contratados</h2>
      <p>
        La cancelación de un servicio ya contratado se rige por el acuerdo
        específico firmado con usted (contrato, plan de pago u otra
        documentación). En ausencia de un acuerdo escrito, contacte al equipo
        para revisar opciones caso por caso.
      </p>

      <h2>3. Plazos y cargos</h2>
      <p>
        Los plazos de aviso, posibles cargos administrativos o condiciones de
        cancelación se definirán en su contrato o en una política revisada
        legalmente. Esta plantilla no establece montos ni plazos vinculantes.
      </p>

      <h2>4. Cómo solicitar la cancelación</h2>
      <ul>
        <li>Correo: jhmultiservices10@gmail.com</li>
        <li>Teléfono: (872) 202-0156</li>
        <li>Incluya nombre completo, servicio y motivo breve (opcional).</li>
      </ul>
    </LegalShell>
  );
}
