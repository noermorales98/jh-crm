import type { Metadata } from "next";
import { FondifyLayout } from "@/src/components/fondify";
import { Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Planes · Fondify Agency",
};

export default function AgencyPlansPage() {
  const plans = [
    {
      name: "Gratis por afiliación",
      price: "$0",
      period: "",
      current: false,
    },
    {
      name: "Pro",
      price: "$197",
      period: "/mes",
      current: true,
    },
    {
      name: "Empresarial",
      price: "$697",
      period: "/mes",
      current: false,
    },
  ];

  return (
    <FondifyLayout>
      <div className="mx-auto max-w-[var(--ff-content-max)] space-y-6">
        <header className="space-y-3">
          <h1 className="ff-page-title">Planes</h1>
          <p className="ff-page-subtitle">Elige el plan que mejor se adapte a tu agencia.</p>
        </header>

        <div className="flex justify-center gap-2 mb-8">
          <button className="rounded-[var(--ff-radius-full)] bg-[var(--ff-primary)] px-6 py-2 text-[var(--ff-fs-sm)] font-medium text-white">
            Mensual
          </button>
          <button className="rounded-[var(--ff-radius-full)] border border-[var(--ff-border)] px-6 py-2 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text-secondary)]">
            Anual
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-[var(--ff-radius-xl)] bg-[var(--ff-surface)] p-6 shadow-[var(--ff-shadow-sm)] ${
                plan.current
                  ? "ring-2 ring-[var(--ff-primary)]"
                  : "ring-1 ring-[var(--ff-border)]"
              }`}
            >
              <h3 className="mb-2 text-lg font-semibold text-[var(--ff-text)]">{plan.name}</h3>
              <div className="mb-6 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-[var(--ff-text)]">{plan.price}</span>
                <span className="text-sm text-[var(--ff-text-secondary)]">{plan.period}</span>
              </div>
              {plan.current ? (
                <div className="rounded-[var(--ff-radius-md)] bg-[var(--ff-primary-soft)] px-4 py-2 text-center text-[var(--ff-fs-sm)] font-medium text-[var(--ff-primary)]">
                  TU NIVEL ACTUAL
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full rounded-[var(--ff-radius-md)] bg-[var(--ff-primary)] px-4 py-2 text-[var(--ff-fs-sm)] font-medium text-white transition-colors hover:bg-[var(--ff-primary-hover)]"
                >
                  <Zap className="mr-2 inline size-4" strokeWidth={2} />
                  Actualizar
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-warning-bg)] p-6 ring-1 ring-[var(--ff-warning-border)]">
          <h3 className="mb-2 font-semibold text-[var(--ff-warning-fg)]">Plan Lifetime</h3>
          <p className="text-sm text-[var(--ff-warning-fg)]">
            El plan Lifetime de $7,500 no está disponible actualmente.
          </p>
        </div>
      </div>
    </FondifyLayout>
  );
}
