import type { Metadata } from "next";
import { LegalShell } from "@/src/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Divulgaciones",
  description:
    "Plantilla de divulgaciones de J&H Multiservices LLC (borrador — requiere revisión legal).",
};

export default function DisclosuresPage() {
  return (
    <LegalShell title="Divulgaciones">
      <p>
        Divulgaciones informativas de J&amp;H Multiservices LLC. Plantilla /
        borrador — requiere revisión legal. No es asesoría jurídica, crediticia
        ni financiera personalizada.
      </p>

      <h2>1. Naturaleza de los servicios</h2>
      <p>
        Ofrecemos orientación y acompañamiento relacionados con consultoría,
        educación crediticia, revisión de reportes, apoyo en procesos de disputa
        y otros servicios descritos en el sitio. No somos un buró de crédito ni
        un banco.
      </p>

      <h2>2. Sin garantías de resultado</h2>
      <p>
        No prometemos aumentos de puntaje crediticio, eliminaciones garantizadas
        de cuentas o ítems, ni plazos o resultados específicos. Los resultados
        dependen de su situación, de las respuestas de terceros (por ejemplo,
        burós o acreedores) y de factores fuera de nuestro control.
      </p>

      <h2>3. Información del sitio</h2>
      <p>
        El contenido web es general e informativo. Puede no reflejar la
        legislación de todas las jurisdicciones. Verifique siempre con un
        profesional calificado antes de tomar decisiones.
      </p>

      <h2>4. Relación con terceros</h2>
      <p>
        Mencionar proveedores, herramientas o sitios externos no implica
        respaldo mutuo salvo que se indique expresamente por escrito.
      </p>

      <h2>5. Contacto</h2>
      <p>
        J&amp;H Multiservices LLC ·{" "}
        <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>{" "}
        · (872) 202-0156.
      </p>
    </LegalShell>
  );
}
