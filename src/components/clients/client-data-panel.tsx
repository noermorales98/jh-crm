"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, Mail, MessageCircle, Pencil, Phone } from "lucide-react";
import { Button } from "@/src/components/ui";
import { CLIENT_STATUS_LABELS } from "@/src/lib/labels";
import { normalizeStateCode, stateName } from "@/src/lib/us-states";
import { whatsappLink } from "@/src/lib/brand/contact-links";

type ClientData = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  status: string;
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copiar ${label}`}
      title={`Copiar ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        } catch {
          setDone(false);
        }
      }}
      className="grid size-7 shrink-0 place-items-center rounded-control text-text-secondary hover:bg-nav-hover hover:text-ink"
    >
      {done ? <Check className="size-3.5 text-success-ink" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

function IconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      aria-label={label}
      title={label}
      className="grid size-7 shrink-0 place-items-center rounded-control text-text-secondary hover:bg-nav-hover hover:text-action-primary"
    >
      {children}
    </a>
  );
}

function Item({
  label,
  value,
  actions,
  wide = false,
  onMissing,
}: {
  label: string;
  value: ReactNode | null;
  actions?: ReactNode;
  wide?: boolean;
  onMissing?: () => void;
}) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11px] font-medium text-text-secondary">{label}</dt>
      <dd className="mt-0.5 flex min-h-7 items-center gap-1 text-[14px] text-ink">
        {value ? (
          <>
            <span className="min-w-0 flex-1 break-words">{value}</span>
            {actions}
          </>
        ) : onMissing ? (
          <button type="button" onClick={onMissing} className="text-[13px] text-text-placeholder hover:text-action-primary">
            Agregar
          </button>
        ) : (
          <span className="text-[13px] text-text-placeholder">Sin dato</span>
        )}
      </dd>
    </div>
  );
}

/**
 * Datos del cliente de un vistazo: nombre, contacto, dónde vive y estatus.
 * Copiar, llamar, escribir; «Editar» abre el formulario del cliente.
 */
export function ClientDataPanel({ client, onEdit }: { client: ClientData; onEdit?: () => void }) {
  const code = normalizeStateCode(client.state);
  const state = stateName(client.state);
  const address = [client.addressLine1, client.addressLine2].filter((v) => v?.trim()).join(", ") || null;
  const wa = whatsappLink(client.phone);
  const fullAddress = [address, client.city, code ?? client.state, client.postalCode].filter((v) => v?.trim()).join(", ");

  return (
    <section className="rounded-surface bg-surface-panel p-4" aria-labelledby="client-data-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="client-data-title" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Datos del cliente
        </h2>
        {onEdit ? (
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" aria-hidden />
            Editar
          </Button>
        ) : null}
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Nombre" value={client.firstName} />
        <Item label="Apellido" value={client.lastName?.trim() || null} onMissing={onEdit} />
        <Item
          label="Estado donde vive"
          value={state ? (code ? `${state} (${code})` : state) : null}
          onMissing={onEdit}
        />
        <Item label="Estatus" value={CLIENT_STATUS_LABELS[client.status] ?? client.status} />
        <Item
          label="Correo"
          value={client.email}
          onMissing={onEdit}
          actions={
            client.email ? (
              <>
                <CopyButton value={client.email} label="correo" />
                <IconLink href={`mailto:${client.email}`} label="Enviar correo">
                  <Mail className="size-3.5" aria-hidden />
                </IconLink>
              </>
            ) : null
          }
        />
        <Item
          label="Teléfono"
          value={client.phone}
          onMissing={onEdit}
          actions={
            client.phone ? (
              <>
                <CopyButton value={client.phone} label="teléfono" />
                <IconLink href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} label="Llamar">
                  <Phone className="size-3.5" aria-hidden />
                </IconLink>
                {wa ? (
                  <IconLink href={wa} label="Escribir por WhatsApp">
                    <MessageCircle className="size-3.5" aria-hidden />
                  </IconLink>
                ) : null}
              </>
            ) : null
          }
        />
        <Item label="Ciudad" value={client.city?.trim() || null} onMissing={onEdit} />
        <Item label="Código postal" value={client.postalCode?.trim() || null} onMissing={onEdit} />
        <Item
          label="Dirección"
          value={address}
          wide
          onMissing={onEdit}
          actions={fullAddress ? <CopyButton value={fullAddress} label="dirección completa" /> : null}
        />
        <Item label="Origen" value={client.source?.trim() || null} wide />
      </dl>
    </section>
  );
}
