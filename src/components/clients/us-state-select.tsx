"use client";

import { Select } from "@/src/components/ui";
import { US_STATES, normalizeStateCode } from "@/src/lib/us-states";

/** Selector de estado de EE. UU. con el Select del CRM; envía el código (TX). */
export function UsStateSelect({
  name = "state",
  defaultValue,
  id,
}: {
  name?: string;
  defaultValue?: string | null;
  id?: string;
}) {
  return (
    <Select
      id={id}
      name={name}
      defaultValue={normalizeStateCode(defaultValue) ?? ""}
      pickerTitle="Estado donde vive"
      aria-label="Estado"
    >
      <option value="">Sin estado</option>
      {US_STATES.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name} ({s.code})
        </option>
      ))}
    </Select>
  );
}
