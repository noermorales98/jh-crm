import { Card, CardBody, CardHeader } from "@/src/components/ui";
import { TestimonialForm } from "@/src/components/testimonials/testimonial-form";
import { TestimonialList } from "@/src/components/testimonials/testimonial-list";

export function ClientTestimonialsPanel({
  clientId,
  defaultName,
  rows,
  cases,
  manage,
  publish,
}: {
  clientId: string;
  defaultName: string;
  rows: Parameters<typeof TestimonialList>[0]["rows"];
  cases: { id: string; label: string }[];
  manage: boolean;
  publish: boolean;
}) {
  return (
    <div className="space-y-4">
      {manage ? (
        <Card>
          <CardHeader
            title="Nuevo testimonio"
            description="Registra las palabras del cliente. El consentimiento, la aprobación y la publicación se completan por separado."
          />
          <CardBody>
            <TestimonialForm
              clientId={clientId}
              defaultName={defaultName}
              cases={cases}
            />
          </CardBody>
        </Card>
      ) : null}
      <TestimonialList
        rows={rows}
        cases={cases}
        manage={manage}
        publish={publish}
      />
    </div>
  );
}
