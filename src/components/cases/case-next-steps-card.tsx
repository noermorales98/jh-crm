import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/src/components/ui";
import type { CaseNextStep } from "@/src/server/cases/next-steps";

export function CaseNextStepsCard({ steps }: { steps: CaseNextStep[] }) {
  return (
    <Card>
      <CardHeader
        title="Qué sigue"
        description="Próximas acciones de este caso."
      />
      <CardBody className="p-0">
        <ul className="divide-y divide-border-subtle">
          {steps.map((step) => (
            <li key={step.id}>
              {step.href ? (
                <Link
                  href={step.href}
                  className="flex items-start justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-nav-hover"
                >
                  <StepText step={step} />
                  <ArrowRight
                    className="mt-0.5 size-4 shrink-0 text-text-secondary"
                    aria-hidden
                  />
                </Link>
              ) : (
                <div className="px-5 py-3.5">
                  <StepText step={step} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function StepText({ step }: { step: CaseNextStep }) {
  const titleColor =
    step.tone === "danger"
      ? "text-danger-ink"
      : step.tone === "warning"
        ? "text-ink"
        : "text-ink";

  return (
    <div className="min-w-0">
      <p className={`text-sm font-semibold ${titleColor}`}>{step.title}</p>
      {step.detail ? (
        <p className="mt-0.5 text-[13px] text-text-secondary">{step.detail}</p>
      ) : null}
    </div>
  );
}
