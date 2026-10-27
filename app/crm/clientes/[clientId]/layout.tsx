import type { ReactNode } from "react";

/** Raíz de la ficha del cliente (permite revalidar todas sus subrutas). */
export default function ClientLayout({ children }: { children: ReactNode }) {
  return children;
}
