import { redirect } from "next/navigation";

/** Origen de leads / atribución retirado del producto — no se usa. */
export default function AtribucionPage() {
  redirect("/crm/dashboard");
}
