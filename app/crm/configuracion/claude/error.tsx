"use client";

import { Alert, Button } from "@/src/components/ui";

export default function ClaudeSettingsError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Alert tone="error">No se pudo cargar la configuración de Claude.</Alert>
      <Button variant="secondary" onClick={reset}>
        Reintentar
      </Button>
    </div>
  );
}
