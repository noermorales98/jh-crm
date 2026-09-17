"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  DateInput,
  Field,
  Input,
  Select,
  Textarea,
} from "@/src/components/ui";
import { createQuote, updateQuote } from "@/src/actions/quotes";
import { playActionResult } from "@/src/lib/cuelume";

export interface QuoteClientOption {
  id: string;
  label: string;
}

export interface QuoteCaseOption {
  id: string;
  caseCode: string;
  clientId: string;
  stateLabel: string;
  /** Human label for the select (code · service · stage/state). */
  label: string;
}

export interface QuoteCatalogOption {
  id: string;
  name: string;
  defaultPrice: number;
}

export interface QuoteItemRow {
  key: number;
  kind: "service" | "package" | "manual";
  refId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

export interface QuoteFormInitial {
  clientId: string;
  caseId: string;
  items: QuoteItemRow[];
  validUntil: string;
  notes: string;
  terms: string;
  taxRate: string;
}

interface RowError {
  description?: string;
  quantity?: string;
  unitPrice?: string;
  discount?: string;
}

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

/**
 * Constructor de cotizaciones (crear y editar borradores).
 * Los totales se calculan en cliente como vista previa; el servidor
 * recalcula con Decimal antes de persistir.
 */
export function QuoteForm({
  mode,
  quoteId,
  clients,
  cases,
  services,
  packages,
  defaultTaxRate,
  defaultTerms,
  initialClientId = "",
  initialCaseId = "",
  initial,
}: {
  mode: "create" | "edit";
  quoteId?: string;
  clients: QuoteClientOption[];
  cases: QuoteCaseOption[];
  services: QuoteCatalogOption[];
  packages: QuoteCatalogOption[];
  defaultTaxRate: string;
  defaultTerms: string;
  initialClientId?: string;
  initialCaseId?: string;
  initial?: QuoteFormInitial;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(
    initial?.clientId ?? initialClientId,
  );
  const [caseId, setCaseId] = useState(initial?.caseId ?? initialCaseId);
  const [items, setItems] = useState<QuoteItemRow[]>(initial?.items ?? []);
  const [nextKey, setNextKey] = useState(initial?.items.length ?? 0);
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [taxRate, setTaxRate] = useState(initial?.taxRate ?? defaultTaxRate);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? defaultTerms);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, RowError>>({});
  const [pending, startTransition] = useTransition();

  const clientCases = useMemo(
    () => cases.filter((c) => c.clientId === clientId),
    [cases, clientId],
  );

  function handleClientChange(value: string) {
    setClientId(value);
    setCaseId((current) =>
      cases.some((c) => c.id === current && c.clientId === value)
        ? current
        : "",
    );
  }

  function addItem(kind: QuoteItemRow["kind"]) {
    setItems((rows) => [...rows, { key: nextKey, kind, refId: "", description: "", quantity: "1", unitPrice: "", discount: "" }]);
    setNextKey((k) => k + 1);
  }

  function updateItem(key: number, patch: Partial<QuoteItemRow>) {
    setItems((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removeItem(key: number) {
    setItems((rows) => rows.filter((row) => row.key !== key));
    setRowErrors((errs) => {
      const next = { ...errs };
      delete next[key];
      return next;
    });
  }

  function handleRefChange(row: QuoteItemRow, refId: string) {
    const source = row.kind === "service" ? services : packages;
    const selected = source.find((s) => s.id === refId);
    updateItem(row.key, {
      refId,
      description: selected?.name ?? "",
      unitPrice: selected ? selected.defaultPrice.toFixed(2) : "",
    });
  }

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (acc, row) => acc + toNumber(row.quantity) * toNumber(row.unitPrice),
      0,
    );
    const discount = items.reduce((acc, row) => acc + toNumber(row.discount), 0);
    const taxable = Math.max(subtotal - discount, 0);
    const tax = (taxable * toNumber(taxRate)) / 100;
    return {
      subtotal,
      discount,
      tax,
      total: taxable + tax,
    };
  }, [items, taxRate]);

  function validate(): boolean {
    const errs: Record<number, RowError> = {};
    for (const row of items) {
      const rowErr: RowError = {};
      if (row.kind !== "manual" && !row.refId) {
        rowErr.description =
          row.kind === "service" ? "Selecciona un servicio." : "Selecciona un paquete.";
      }
      if (row.kind === "manual" && !row.description.trim()) {
        rowErr.description = "La descripción es obligatoria.";
      }
      if (!(toNumber(row.quantity) > 0)) rowErr.quantity = "Cantidad > 0.";
      if (row.unitPrice === "" || toNumber(row.unitPrice) < 0)
        rowErr.unitPrice = "Precio inválido.";
      const gross = toNumber(row.quantity) * toNumber(row.unitPrice);
      if (toNumber(row.discount) > gross) rowErr.discount = "Mayor al importe.";
      if (Object.keys(rowErr).length > 0) errs[row.key] = rowErr;
    }
    setRowErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clientId) {
      setError("Selecciona un cliente.");
      return;
    }
    if (items.length === 0) {
      setError("Agrega al menos un ítem a la cotización.");
      return;
    }
    if (!validate()) {
      setError("Revisa los ítems marcados.");
      return;
    }
    startTransition(async () => {
      const payload = {
        items: items.map((row) => ({
          kind: row.kind,
          ...(row.kind === "service" ? { serviceId: row.refId } : {}),
          ...(row.kind === "package" ? { packageId: row.refId } : {}),
          ...(row.description.trim() ? { description: row.description.trim() } : {}),
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          ...(toNumber(row.discount) > 0 ? { discountAmount: row.discount } : {}),
        })),
        ...(validUntil ? { validUntil } : { validUntil: null }),
        taxRate,
        notes: notes.trim() ? notes.trim() : null,
        terms: terms.trim() ? terms.trim() : null,
      };
      const result =
        mode === "create"
          ? await createQuote({
              clientId,
              ...(caseId ? { caseId } : {}),
              ...payload,
            })
          : await updateQuote(quoteId as string, payload);
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      const id = mode === "create" ? result.data.id : (quoteId as string);
      router.push(`/crm/cotizaciones/${id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card>
        <CardHeader
          title="Cliente y caso"
          description="La cotización siempre pertenece a un cliente; el caso es opcional."
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente" htmlFor="quote-client" required>
              <Select
                id="quote-client"
                value={clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                required
                disabled={mode === "edit"}
              >
                <option value="" disabled>
                  Selecciona un cliente…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Caso (opcional)"
              htmlFor="quote-case"
              hint={
                clientId
                  ? clientCases.length === 0
                    ? "Este cliente no tiene casos."
                    : undefined
                  : "Primero selecciona un cliente."
              }
            >
              <Select
                id="quote-case"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                disabled={!clientId || mode === "edit"}
              >
                <option value="">Sin caso</option>
                {clientCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Ítems"
          description="Agrega servicios o paquetes del catálogo, o ítems manuales. El descuento es por ítem."
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => addItem("service")}>
                <Plus className="size-3.5" aria-hidden />
                Servicio
              </Button>
              <Button variant="secondary" size="sm" onClick={() => addItem("package")}>
                <Plus className="size-3.5" aria-hidden />
                Paquete
              </Button>
              <Button variant="secondary" size="sm" onClick={() => addItem("manual")}>
                <Plus className="size-3.5" aria-hidden />
                Manual
              </Button>
            </>
          }
        />
        <CardBody className="space-y-3">
          {items.length === 0 ? (
            <p className="rounded-control border border-dashed border-border-subtle px-4 py-6 text-center text-sm text-text-secondary">
              Sin ítems. Agrega un servicio, un paquete o un ítem manual.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((row, index) => {
                const rowErr = rowErrors[row.key] ?? {};
                const lineTotal =
                  toNumber(row.quantity) * toNumber(row.unitPrice) -
                  toNumber(row.discount);
                return (
                  <li
                    key={row.key}
                    className="rounded-control border border-border-subtle p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Ítem {index + 1} ·{" "}
                        {row.kind === "service"
                          ? "Servicio"
                          : row.kind === "package"
                            ? "Paquete"
                            : "Manual"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(row.key)}
                        aria-label={`Eliminar ítem ${index + 1}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-12">
                      {row.kind !== "manual" ? (
                        <Field
                          label={row.kind === "service" ? "Servicio" : "Paquete"}
                          className="sm:col-span-4"
                          error={rowErr.description}
                        >
                          <Select
                            value={row.refId}
                            onChange={(e) => handleRefChange(row, e.target.value)}
                            invalid={Boolean(rowErr.description)}
                          >
                            <option value="" disabled>
                              Selecciona…
                            </option>
                            {(row.kind === "service" ? services : packages).map(
                              (opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.name} ({money(opt.defaultPrice)})
                                </option>
                              ),
                            )}
                          </Select>
                        </Field>
                      ) : null}
                      <Field
                        label="Descripción"
                        className={row.kind === "manual" ? "sm:col-span-8" : "sm:col-span-8"}
                        error={row.kind === "manual" ? rowErr.description : undefined}
                      >
                        <Input
                          value={row.description}
                          onChange={(e) =>
                            updateItem(row.key, { description: e.target.value })
                          }
                          invalid={Boolean(
                            row.kind === "manual" && rowErr.description,
                          )}
                          maxLength={2000}
                          placeholder="Descripción visible en la cotización"
                        />
                      </Field>
                      <Field
                        label="Cantidad"
                        className="sm:col-span-2"
                        error={rowErr.quantity}
                      >
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={row.quantity}
                          onChange={(e) =>
                            updateItem(row.key, { quantity: e.target.value })
                          }
                          invalid={Boolean(rowErr.quantity)}
                          required
                        />
                      </Field>
                      <Field
                        label="Precio unitario"
                        className="sm:col-span-3"
                        error={rowErr.unitPrice}
                      >
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={row.unitPrice}
                          onChange={(e) =>
                            updateItem(row.key, { unitPrice: e.target.value })
                          }
                          invalid={Boolean(rowErr.unitPrice)}
                          required
                        />
                      </Field>
                      <Field
                        label="Descuento"
                        className="sm:col-span-3"
                        error={rowErr.discount}
                      >
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={row.discount}
                          onChange={(e) =>
                            updateItem(row.key, { discount: e.target.value })
                          }
                          invalid={Boolean(rowErr.discount)}
                          placeholder="0.00"
                        />
                      </Field>
                      <div className="sm:col-span-4 sm:self-end sm:text-right">
                        <span className="text-xs text-text-secondary">Importe: </span>
                        <span className="text-sm font-medium tabular-nums text-ink">
                          {money(Math.max(lineTotal, 0))}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-end border-t border-border-subtle pt-4">
            <dl className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Subtotal</dt>
                <dd className="tabular-nums text-ink">{money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Descuento</dt>
                <dd className="tabular-nums text-ink">
                  −{money(totals.discount)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Impuesto (%)</dt>
                <dd className="w-24">
                  <Input
                    aria-label="Tasa de impuesto (%)"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Impuesto</dt>
                <dd className="tabular-nums text-ink">{money(totals.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-border-subtle pt-1 text-base font-semibold">
                <dt className="text-ink">Total</dt>
                <dd className="tabular-nums text-ink">{money(totals.total)}</dd>
              </div>
              <p className="pt-1 text-right text-xs text-text-secondary">
                Vista previa: el servidor recalcula los totales al guardar.
              </p>
            </dl>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Condiciones" />
        <CardBody className="space-y-4">
          <Field label="Válida hasta" htmlFor="quote-valid-until">
            <DateInput
              id="quote-valid-until"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </Field>
          <Field label="Notas (internas y del documento)" htmlFor="quote-notes">
            <Textarea
              id="quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
            />
          </Field>
          <Field
            label="Términos"
            htmlFor="quote-terms"
            hint="Precargados desde Configuración; puedes ajustarlos por cotización."
          >
            <Textarea
              id="quote-terms"
              rows={4}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              maxLength={10000}
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Guardando…"
            : mode === "create"
              ? "Crear cotización"
              : "Guardar cambios"}
        </Button>
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
