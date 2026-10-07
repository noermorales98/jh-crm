import { redirect } from "next/navigation";

/**
 * Casos ya no es sección del menú: la operación vive en /crm/clientes/:id.
 * Las rutas técnicas /crm/casos/:id/* siguen activas este sprint.
 */
export default function CasesListRedirect() {
  redirect("/crm/clientes");
}
