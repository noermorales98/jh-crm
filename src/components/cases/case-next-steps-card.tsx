import Link from "next/link";
import {
  ChevronRight,
  CircleCheck,
  Clock,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/src/components/ui";
import type { CaseNextStep } from "@/src/server/cases/next-steps";

const TONE_STYLES: Record<
  NonNullable<CaseNextStep["tone"]>,
  { icon: LucideIcon; chip: string; title: string }
> = {
  danger: {
    icon: TriangleAlert,
    chip: "bg-danger-soft text-danger-ink",
    title: "text-danger-ink",
  },
  warning: {
    icon: Clock,
    chip: "bg-warning-soft text-warning-ink",
    title: "text-ink",
  },
  neutral: {
    icon: CircleCheck,
    chip: "bg-nav-active text-action-primary",
    title: "text-ink",
  },
};

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
                  className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-nav-hover"
                >
                  <StepRow step={step} />
                  <ChevronRight
                    className="size-4 shrink-0 text-text-placeholder"
                    aria-hidden
                  />
                </Link>
              ) : (
                <div className="px-5 py-3.5">
                  <StepRow step={step} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function StepRow({ step }: { step: CaseNextStep }) {
  const tone = TONE_STYLES[step.tone ?? "neutral"];
  const Icon = tone.icon;

  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-control ${tone.chip}`}
        aria-hidden
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${tone.title}`}>{step.title}</p>
        {step.detail ? (
          <p className="mt-0.5 text-[13px] text-text-secondary">{step.detail}</p>
        ) : null}
      </div>
    </div>
  );
}
