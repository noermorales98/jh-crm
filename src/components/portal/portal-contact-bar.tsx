import { CalendarDays, MessageCircle } from "lucide-react";
import { normalizeBookingUrl, whatsappLink } from "@/src/lib/brand/contact-links";

/** Botones para que el cliente escriba por WhatsApp o agende una llamada. */
export function PortalContactBar({
  whatsappNumber,
  bookingUrl,
  clientName,
}: {
  whatsappNumber: string | null;
  bookingUrl: string | null;
  clientName?: string | null;
}) {
  const wa = whatsappLink(whatsappNumber, clientName ? `Hola, soy ${clientName}. Tengo una pregunta.` : undefined);
  const booking = normalizeBookingUrl(bookingUrl);
  if (!wa && !booking) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-surface bg-surface-panel px-4 py-3">
      <p className="text-[13px] text-text-secondary">¿Tienes dudas? Habla con tu asesor.</p>
      <div className="flex flex-wrap gap-2">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-control bg-[light-dark(#1f8f4e,#2fbf6a)] px-3 py-2 text-[13px] font-semibold text-[light-dark(#ffffff,#0b1f12)] transition-transform active:scale-[0.98]"
          >
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp
          </a>
        ) : null}
        {booking ? (
          <a
            href={booking}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-control bg-nav-hover/70 px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-nav-hover"
          >
            <CalendarDays className="size-4" aria-hidden />
            Agendar llamada
          </a>
        ) : null}
      </div>
    </div>
  );
}
