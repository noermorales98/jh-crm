/**
 * Smoke sin DB: taskWorkBadge (misma regla para dashboard y tabla de tareas).
 * Uso: npm run smoke:work-badge
 */
import type { TaskDueBucket } from "../../src/lib/format/dates";
import {
  taskWorkBadge,
  type TaskWorkBadgeInput,
} from "../../src/lib/task-work-badge";

let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const base: TaskWorkBadgeInput = {
  type: "OTHER",
  title: "Llamar",
  status: "PENDING",
};

const cases: Array<{
  note: string;
  task: TaskWorkBadgeInput;
  bucket: TaskDueBucket;
  label: string;
  tone: string;
}> = [
  { note: "vencida abierta → Urgente", task: base, bucket: "overdue", label: "Urgente", tone: "danger" },
  { note: "vencida de cobro abierta → Urgente", task: { ...base, type: "REQUEST_PAYMENT" }, bucket: "overdue", label: "Urgente", tone: "danger" },
  { note: "vencida COMPLETED no es Urgente", task: { ...base, status: "COMPLETED" }, bucket: "overdue", label: "Pendiente", tone: "neutral" },
  { note: "vencida CANCELLED de cobro → Cobrar", task: { ...base, type: "REQUEST_PAYMENT", status: "CANCELLED" }, bucket: "overdue", label: "Cobrar", tone: "warning" },
  { note: "REQUEST_PAYMENT → Cobrar", task: { ...base, type: "REQUEST_PAYMENT" }, bucket: "later", label: "Cobrar", tone: "warning" },
  { note: "REQUEST_DOCUMENT → Docs", task: { ...base, type: "REQUEST_DOCUMENT" }, bucket: "today", label: "Docs", tone: "warning" },
  { note: "externalKey opportunity: → Lead", task: { ...base, externalKey: "opportunity:abc:followup" }, bucket: "week", label: "Lead", tone: "warning" },
  { note: "título Contactar → Lead", task: { ...base, title: "Contactar · Ana" }, bucket: "week", label: "Lead", tone: "warning" },
  { note: "externalKey :nextAction → Próxima", task: { ...base, externalKey: "serviceCase:abc:nextAction" }, bucket: "today", label: "Próxima", tone: "neutral" },
  { note: "description nextAction → Próxima", task: { ...base, description: "Próxima acción del expediente. (nextAction:abc)" }, bucket: "week", label: "Próxima", tone: "neutral" },
  { note: "título Próxima acción → Próxima", task: { ...base, title: "Próxima acción · SC-1" }, bucket: "none", label: "Próxima", tone: "neutral" },
  { note: "hoy sin tipo especial → Hoy", task: base, bucket: "today", label: "Hoy", tone: "warning" },
  { note: "futura sin tipo especial → Pendiente", task: base, bucket: "later", label: "Pendiente", tone: "neutral" },
  { note: "sin fecha → Pendiente", task: base, bucket: "none", label: "Pendiente", tone: "neutral" },
];

console.log("taskWorkBadge");
for (const c of cases) {
  const got = taskWorkBadge(c.task, c.bucket);
  check(
    `${c.note}`,
    got.label === c.label && got.tone === c.tone,
    `got ${got.label}/${got.tone}`,
  );
}

if (failed > 0) {
  console.error(`\n${failed} fallo(s).`);
  process.exit(1);
}
console.log("\nOK");
