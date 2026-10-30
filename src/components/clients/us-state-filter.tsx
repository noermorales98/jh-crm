"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/src/components/ui";
import { US_STATES } from "@/src/lib/us-states";

/** Filtra la lista de clientes por el estado donde viven (?state=TX). */
export function UsStateFilter({ value }: { value: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="w-full max-w-[14rem]">
      <Select
        value={value ?? ""}
        pickerTitle="Estado donde vive"
        aria-label="Filtrar por estado"
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("cursor");
          if (e.target.value) params.set("state", e.target.value);
          else params.delete("state");
          const query = params.toString();
          router.push(query ? `/crm/clientes?${query}` : "/crm/clientes");
        }}
      >
        <option value="">Todos los estados</option>
        {US_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name} ({s.code})
          </option>
        ))}
      </Select>
    </div>
  );
}
