import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { PageHeader } from "@/src/components/ui";
import { TestimonialList } from "@/src/components/testimonials/testimonial-list";
import { testimonialPageData } from "@/src/server/testimonials/page-data";
import { TESTIMONIAL_STATUS_LABELS } from "@/src/lib/labels";

export const metadata: Metadata = { title: "Testimonios" };
export default async function TestimonialsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requirePermission("testimonials.view");
  const { status } = await searchParams;
  const { rows } = await testimonialPageData(ctx);
  const filtered =
    status === "PUBLISHED"
      ? rows.filter((row) => row.publishedAt)
      : status && Object.hasOwn(TESTIMONIAL_STATUS_LABELS, status)
        ? rows.filter((row) => row.status === status)
        : rows;
  return (
    <div>
      <PageHeader
        title="Testimonios"
        description="Revisa el consentimiento y las palabras del cliente. Aprobar y publicar son decisiones separadas. Se muestran los 100 testimonios más recientes."
      />
      <p className="mb-4 text-sm text-text-secondary">
        Para crear un testimonio, abre la pestaña Testimonios en la{" "}
        <Link className="text-action-primary" href="/crm/clientes">
          ficha del cliente
        </Link>
        .
      </p>
      <nav
        aria-label="Filtrar testimonios"
        className="mb-5 flex flex-wrap gap-4 text-sm text-action-primary"
      >
        <Link
          href="/crm/testimonios"
          aria-current={!status ? "page" : undefined}
        >
          Todos
        </Link>
        {Object.entries({
          ...TESTIMONIAL_STATUS_LABELS,
          PUBLISHED: "Publicados",
        }).map(([key, label]) => (
          <Link
            key={key}
            href={`/crm/testimonios?status=${key}`}
            aria-current={status === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <TestimonialList
        rows={filtered}
        manage={can(ctx.role, "testimonials.manage")}
        publish={can(ctx.role, "testimonials.publish")}
      />
    </div>
  );
}
