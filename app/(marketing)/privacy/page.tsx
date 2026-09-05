import type { Metadata } from "next";
import { LegalShell } from "@/src/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Plantilla de política de privacidad de J&H Multiservices LLC (borrador — requiere revisión legal).",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Política de privacidad">
      <p>
        Esta plantilla describe, de forma general, cómo J&amp;H Multiservices LLC
        («nosotros») podría recopilar y usar información cuando usted visita
        nuestro sitio web o solicita una consulta. Es un borrador informativo y
        debe ser revisado por un profesional legal antes de considerarse
        definitiva.
      </p>

      <h2>1. Información que podemos recopilar</h2>
      <p>Podemos recibir datos que usted nos proporciona voluntariamente, por ejemplo:</p>
      <ul>
        <li>Nombre, correo electrónico y teléfono.</li>
        <li>Mensaje o descripción de su consulta.</li>
        <li>Preferencias de contacto y consentimiento para SMS (si lo otorga).</li>
        <li>
          Datos técnicos o de atribución (por ejemplo, página de llegada,
          referrer o parámetros UTM) asociados al envío del formulario.
        </li>
      </ul>

      <h2>2. Uso de la información</h2>
      <p>Podemos usar la información para:</p>
      <ul>
        <li>Responder a su solicitud y coordinar una consulta.</li>
        <li>Gestionar su expediente comercial o de servicio, según corresponda.</li>
        <li>Mejorar la atención y la operación del sitio.</li>
        <li>Cumplir obligaciones legales aplicables.</li>
      </ul>

      <h2>3. Conservación y seguridad</h2>
      <p>
        Conservamos la información el tiempo razonable para los fines descritos o
        el que exija la ley. Aplicamos medidas razonables de seguridad; ningún
        sistema es totalmente infalible.
      </p>

      <h2>4. Compartición</h2>
      <p>
        No vendemos su información personal. Podemos compartirla con proveedores
        que nos ayudan a operar (por ejemplo, hosting o herramientas de
        comunicación) bajo obligaciones de confidencialidad, o cuando la ley lo
        requiera.
      </p>

      <h2>5. Sus opciones</h2>
      <p>
        Puede solicitar acceso, corrección o eliminación de ciertos datos
        contactándonos en{" "}
        <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>{" "}
        o al (872) 202-0156, sujeto a excepciones legales.
      </p>

      <h2>6. Contacto</h2>
      <p>
        J&amp;H Multiservices LLC — consultas sobre privacidad:{" "}
        <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>.
      </p>
    </LegalShell>
  );
}
