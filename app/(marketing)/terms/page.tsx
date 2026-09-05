import type { Metadata } from "next";
import { LegalShell } from "@/src/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Términos de uso",
  description:
    "Plantilla de términos de uso de J&H Multiservices LLC (borrador — requiere revisión legal).",
};

export default function TermsPage() {
  return (
    <LegalShell title="Términos de uso">
      <p>
        Estos términos son una plantilla / borrador para el sitio web de J&amp;H
        Multiservices LLC. No constituyen un contrato definitivo ni asesoría
        legal; requieren revisión profesional antes de su uso oficial.
      </p>

      <h2>1. Aceptación</h2>
      <p>
        Al acceder o usar este sitio, usted acepta estos términos en la medida
        en que resulten aplicables. Si no está de acuerdo, no utilice el sitio.
      </p>

      <h2>2. Servicios descritos</h2>
      <p>
        El sitio describe servicios de consultoría y apoyo (por ejemplo,
        orientación crediticia, formación de LLC o proyectos relacionados)
        con carácter informativo. La contratación de un servicio concreto puede
        requerir un acuerdo separado, documentación adicional y verificación de
        identidad o elegibilidad.
      </p>

      <h2>3. Consulta inicial</h2>
      <p>
        La mención de una «consulta por $1» en el sitio es informativa. El envío
        del formulario de contacto constituye una solicitud; no implica, por sí
        solo, que se haya cobrado un pago ni que exista un resultado garantizado.
      </p>

      <h2>4. Uso aceptable</h2>
      <ul>
        <li>No use el sitio para fines ilícitos o fraudulentos.</li>
        <li>No intente vulnerar la seguridad o el funcionamiento del sitio.</li>
        <li>Proporcione información veraz en los formularios.</li>
      </ul>

      <h2>5. Limitación</h2>
      <p>
        El contenido del sitio se ofrece «tal cual». En la medida permitida por
        la ley, J&amp;H Multiservices LLC no garantiza resultados específicos,
        plazos ni mejoras de puntaje crediticio.
      </p>

      <h2>6. Contacto</h2>
      <p>
        Preguntas sobre estos términos:{" "}
        <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>{" "}
        · (872) 202-0156.
      </p>
    </LegalShell>
  );
}
