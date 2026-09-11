import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

/**
 * Feedback inline (patrón elegido en lugar de toasts globales):
 * cada formulario muestra su propio <Alert> de error/éxito.
 */
export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: ReactNode;
}) {
  const styles = {
    info: "bg-info-soft text-info-ink",
    error: "bg-danger-soft text-danger-ink",
    success: "bg-success-soft text-success-ink",
  }[tone];
  const Icon = tone === "error" ? CircleAlert : tone === "success" ? CircleCheck : Info;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-control px-4 py-3 text-[13px] ${styles}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
