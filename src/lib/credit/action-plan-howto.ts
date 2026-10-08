/**
 * Catálogo educativo de prioridades (adaptado de Fondify Action Plan).
 * Revisar legalmente antes de publicar como asesoría.
 */

export type ActionPlanPriorityId =
  | "charge_offs"
  | "late_payments"
  | "high_utilization"
  | "no_high_limit"
  | "combined_limit"
  | "bank_relationships";

export type ActionPlanHowTo = {
  id: ActionPlanPriorityId;
  title: string;
  severity: "CRITICO" | "IMPORTANTE";
  summary: string;
  ficoImpact: string;
  timeline: string;
  why: string;
  steps: string[];
  commonMistakes: string[];
  professionalOrder: string[];
  expectations: string;
};

export const ACTION_PLAN_HOWTO: Record<ActionPlanPriorityId, ActionPlanHowTo> = {
  charge_offs: {
    id: "charge_offs",
    title: "Charge-offs, reposesiones o información inexacta",
    severity: "CRITICO",
    summary:
      "Los charge-offs y las reposesiones son marcas derogatorias severas, y cualquier dato inexacto es motivo de eliminación.",
    ficoImpact: "+40 a +100 puntos FICO",
    timeline: "60-120+ días",
    why: "Bajo la FCRA los burós deben reportar con la máxima exactitud posible y eliminar lo que no puedan verificar. La jugada es una disputa escalonada: reinvestigación → método de verificación → eliminación → escalamiento.",
    steps: [
      "Ronda 1 — Carta 1 a los burós (correo + CFPB): Request for Reinvestigation and Correction. Detalla cada cuenta y exige corrección en 30 días (FCRA §611 / §1681i).",
      "Ronda 2 — Carta 2: Request for Description of Investigation Process (método de verificación) en 15 días (FCRA §611(a)(7)).",
      "Ronda 3 — Carta 3 con copia al departamento legal: Request for Investigation and Removal en 30 días.",
      "Última opción: Carta 4 al Departamento Legal del acreedor, queja FTC y escalamiento CFPB.",
      "Siempre adjunta: ID, SSN, prueba de dirección y screenshot de discrepancias entre burós.",
    ],
    commonMistakes: [
      "Disputar ítems exactos en vez de documentar inexactitudes reales.",
      "Mandar disputas genéricas en línea en vez de cartas con cita FCRA.",
      "Saltar al departamento legal / FTC antes de agotar las 3 rondas.",
      "No adjuntar ID, SSN, prueba de dirección y screenshots.",
      "Dejar vencer los plazos (30 / 15 / 30 días).",
    ],
    professionalOrder: [
      "Bajar los 3 reportes y documentar discrepancias.",
      "Ronda 1 por correo a cada buró (+ CFPB).",
      "Ronda 2 método de verificación.",
      "Ronda 3 remoción con copia legal.",
      "Si no se resuelve: Carta 4 → FTC → CFPB.",
      "Volver a sacar reportes después de cada ronda.",
    ],
    expectations:
      "Los charge-offs exactos y verificables pueden permanecer hasta 7 años; la eliminación depende de inexactitud o falta de verificación — no está garantizada.",
  },
  late_payments: {
    id: "late_payments",
    title: "Pagos atrasados",
    severity: "CRITICO",
    summary:
      "El historial de pagos es el factor #1 de FICO — un solo tardío puede bajar mucho el puntaje.",
    ficoImpact: "+50 a +100 puntos FICO",
    timeline: "60-180 días",
    why: "Dos caminos en paralelo: disputa de inexactitudes y carta de buena voluntad cuando el atraso es puntual y el resto del historial es limpio.",
    steps: [
      "Identifica atrasos por buró y verifica fechas/estado.",
      "Si hay inexactitud: disputa FCRA con evidencia.",
      "Si el dato es exacto pero aislado: goodwill letter al acreedor.",
      "Mantén 6–12 meses de pagos perfectos en paralelo.",
      "Documenta cada respuesta y vuelve a bajar reportes.",
    ],
    commonMistakes: [
      "Ignorar atrasos 'pequeños' de 30 días.",
      "Pedir goodwill sin historial limpio reciente.",
      "Disputar sin evidencia cuando el dato es correcto.",
    ],
    professionalOrder: [
      "Auditar atrasos en los 3 burós.",
      "Disputar inexactos; goodwill en exactos recuperables.",
      "Estabilizar pagos y utilización.",
      "Re-chequear reportes en 30–45 días.",
    ],
    expectations:
      "Los atrasos verificables pueden permanecer años; el impacto baja con el tiempo y con un historial limpio posterior.",
  },
  high_utilization: {
    id: "high_utilization",
    title: "Alta utilización (más del 10%)",
    severity: "CRITICO",
    summary:
      "La utilización es el factor #2 de FICO y mata aprobaciones de fondeo si está alta.",
    ficoImpact: "+30 a +80 puntos FICO",
    timeline: "15-30 días",
    why: "Los prestamistas ven utilización alta como riesgo. El umbral operativo de este plan es ≤10% por buró.",
    steps: [
      "Lista tarjetas por utilización y paga primero las más altas.",
      "Objetivo intermedio 30%; objetivo fondeo ≤10%.",
      "Pide aumento de límite solo si no genera hard pull agresivo.",
      "Evita nuevos cargos hasta estabilizar.",
      "Confirma en el siguiente reporte que los burós reflejen saldos bajos.",
    ],
    commonMistakes: [
      "Cerrar tarjetas con saldo en vez de pagarlas.",
      "Pagar después del statement date sin timing.",
      "Ignorar utilización por buró (no solo promedio).",
    ],
    professionalOrder: [
      "Calcular utilización por buró.",
      "Plan de pago ordenado (Score Plan).",
      "Verificar en el próximo ciclo de reporte.",
    ],
    expectations:
      "La utilización puede mejorar en un ciclo de facturación si pagas antes del reporte al buró.",
  },
  no_high_limit: {
    id: "no_high_limit",
    title: "Sin tarjetas de límite alto",
    severity: "CRITICO",
    summary:
      "Sin un tradeline de límite alto, las aprobaciones se quedan pequeñas.",
    ficoImpact: "+20 a +50 puntos FICO",
    timeline: "60-120 días",
    why: "Los prestamistas evalúan capacidad. Perfiles topados en $300–$1,500 se ven como bajo trust.",
    steps: [
      "Identifica la tarjeta primaria con mayor límite.",
      "Solicita aumento en banco grande si el perfil lo permite.",
      "Evalúa AU de tarjeta ≥ $15K de titular confiable (opcional).",
      "No abras muchas tarjetas nuevas en poco tiempo.",
    ],
    commonMistakes: [
      "Abrir 3–5 tarjetas a la vez (hard pulls).",
      "Depender solo de AU para fondeo de negocio.",
    ],
    professionalOrder: [
      "Mapear límites actuales.",
      "Aumentos / AU selectivo.",
      "Revisar estructura en el siguiente reporte.",
    ],
    expectations:
      "Construir un límite alto lleva semanas a meses según ingreso y relación bancaria.",
  },
  combined_limit: {
    id: "combined_limit",
    title: "Alto límite de crédito combinado",
    severity: "CRITICO",
    summary:
      "Perfiles con menos de ~$40K combinados (incl. AU) se ven débiles para fondeo.",
    ficoImpact: "+20 a +50 puntos FICO",
    timeline: "60-120 días",
    why: "El límite combinado comunica capacidad de crédito personal usada en calificación de financiamiento.",
    steps: [
      "Suma límites primarios + AU activos.",
      "Prioriza aumentos en cuentas con buen historial.",
      "Mantén utilización baja mientras subes límites.",
    ],
    commonMistakes: [
      "Subir límites y gastar hasta el tope.",
      "Contar tarjetas cerradas en el total.",
    ],
    professionalOrder: [
      "Calcular gap vs $40K.",
      "Plan de aumentos / AU.",
      "Revalidar en reporte actualizado.",
    ],
    expectations:
      "El umbral de $40K es una guía operativa de este plan, no una garantía de aprobación.",
  },
  bank_relationships: {
    id: "bank_relationships",
    title: "Construcción de Relaciones Bancarias",
    severity: "IMPORTANTE",
    summary:
      "Mientras reparas, construye relaciones bancarias en paralelo.",
    ficoImpact: "Impacto indirecto",
    timeline: "90 días",
    why: "Los bancos dan mejores límites a quien deposita y opera con ellos de forma consistente.",
    steps: [
      "Abre/fortalece cuenta de cheques + savings en 1–2 bancos objetivo.",
      "Deposita flujo real (nómina / ventas) por 90+ días.",
      "Evita overdrafts y mantén saldo promedio saludable.",
      "Documenta relación antes de pedir productos de crédito/fondeo.",
    ],
    commonMistakes: [
      "Pedir fondeo el mismo mes de abrir la cuenta.",
      "Dispersar depósitos en muchos bancos sin profundidad.",
    ],
    professionalOrder: [
      "Elegir banco(s) objetivo.",
      "90 días de historial limpio.",
      "Aplicar cuando el crédito personal también califique.",
    ],
    expectations:
      "Las relaciones bancarias no sustituyen un perfil crediticio sano; se construyen en paralelo.",
  },
};
