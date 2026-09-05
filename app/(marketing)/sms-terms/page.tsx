import type { Metadata } from "next";
import { LegalShell } from "@/src/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Términos de mensajería SMS",
  description:
    "Plantilla de términos SMS de J&H Multiservices LLC (borrador — requiere revisión legal).",
};

export default function SmsTermsPage() {
  return (
    <LegalShell title="Términos de mensajería SMS">
      <p>
        Plantilla / borrador de J&amp;H Multiservices LLC sobre mensajes de texto
        (SMS). Requiere revisión legal y alineación con proveedores y normas
        aplicables (p. ej. consentimiento y opt-out) antes de usarse de forma
        definitiva.
      </p>

      <h2>1. Consentimiento opcional</h2>
      <p>
        El consentimiento para recibir SMS es independiente de la aceptación de
        la política de privacidad. Solo le enviaremos mensajes relacionados con
        su consulta o servicio si usted marca expresamente la casilla de
        consentimiento SMS en el formulario (o otorga consentimiento por otro
        medio documentado).
      </p>

      <h2>2. Tipos de mensajes</h2>
      <p>Según el caso, los mensajes podrían incluir:</p>
      <ul>
        <li>Confirmaciones o seguimientos de su solicitud.</li>
        <li>Recordatorios de citas o documentación pendiente.</li>
        <li>Actualizaciones operativas relacionadas con su expediente.</li>
      </ul>

      <h2>3. Frecuencia y costos</h2>
      <p>
        La frecuencia varía según su interacción con nosotros. Pueden aplicar
        tarifas de mensajería de su operador. J&amp;H Multiservices LLC no
        controla las tarifas del operador.
      </p>

      <h2>4. Cómo cancelar (opt-out)</h2>
      <p>
        Puede solicitar dejar de recibir SMS respondiendo STOP (si el canal lo
        soporta) o contactándonos en{" "}
        <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>{" "}
        / (872) 202-0156. El consentimiento de privacidad y el de SMS son
        independientes.
      </p>

      <h2>5. Ayuda</h2>
      <p>
        Para ayuda sobre mensajería, escriba HELP al número desde el que reciba
        mensajes (si está habilitado) o use los datos de contacto anteriores.
      </p>
    </LegalShell>
  );
}
