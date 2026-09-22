# 02 — Repositorios de referencia

> Solo patrones UX/arquitectura. No copiar código. No añadir como dependencias.

## Tabla de licencias

| Repo | Licencia | ¿Reutilizar código? | Recomendación |
|------|----------|---------------------|---------------|
| [frappe/crm](https://github.com/frappe/crm) | **AGPL-3.0** | **No** | Estudiar UX; recrear de forma independiente |
| [pdovhomilja/nextcrm-app](https://github.com/pdovhomilja/nextcrm-app) | **MIT** | Posible con atribución | Preferir patrones; no importar módulos |
| [mujahiiid/CRM](https://github.com/mujahiiid/CRM) (ClientFlow) | **Sin licencia raíz** | **No** | Solo patrones |
| [AliAbdullahpgr/HisaabScore](https://github.com/AliAbdullahpgr/HisaabScore) | **Sin licencia** | **No** | Solo tipografía/tooltips de chart |
| [bristinWild/CredGate](https://github.com/bristinWild/CredGate) | **Sin licencia** | **No** | **No aporta** al CRM de burós J&H |

---

## Frappe CRM

**Qué hace bien**

- Record workspace (Lead/Deal/Contact) sin abandonar el registro.
- `Activities.vue`: timeline unificada (notas, emails, tareas, llamadas).
- `SidePanelLayout.vue`: campos operativos siempre visibles.
- Acciones contextuales en el mismo panel.

**Qué hace mal / no aplica**

- Stack Frappe/Vue distinto; AGPL obliga a copyleft si se incorpora código.
- Modelo genérico CRM, no Credit Repair.

**Aporta a J&H**

- Patrón “OS del registro”: next action + actividad + peeks sin navegar.
- Actividad como centro operativo (J&H ya tiene ActivityLog + Note; mejorar presentación).

**No aporta**

- Reemplazar App Router / Prisma / dominio ServiceCase.

**Patrones estudiar:** side panel, activities hub, stay-on-record.  
**Patrones evitar:** copiar AGPL; tabs infinitas sin jerarquía.

Archivos de referencia (estudio):

```text
frontend/src/pages/Lead.vue
frontend/src/pages/Deal.vue
frontend/src/components/Activities/Activities.vue
frontend/src/components/SidePanelLayout.vue
```

---

## ClientFlow (mujahiiid/CRM)

**Qué hace bien**

- `CustomerDetailsPage`: main + related deals/tasks + modales inline.
- `RelatedTasks` / `RecordActivityList`: contexto compacto.
- Alta vía modal sin salir de la ficha.

**Qué hace mal**

- Demo/mock data; no es producto multi-tenant serio.
- Sin licencia clara → no copiar.

**Aporta a J&H**

- Título de tarea ligado al cliente en listas.
- Related tasks en ficha (J&H ya tiene ≤3 en rail).

**No aporta**

- Sustituir Client 360 V2; reinventar peeks.

Archivos:

```text
components/customer-details/CustomerDetailsPage.tsx
components/record-details/RecordActivityList.tsx
components/record-details/RelatedTasks.tsx
```

---

## NextCRM

**Qué hace bien**

- Invoices / payments con acciones claras.
- Tablas + formularios maduros (Next.js + Prisma).
- MIT permite aprendizaje libre.

**Qué hace mal / no aplica**

- CRM genérico; no burós/rondas.
- Stack overlapping pero no idéntico (shadcn, etc.) — no mezclar design systems.

**Aporta a J&H**

- Claridad financiera invoice→payment (J&H ya tiene Quote/Payment/Stripe; pulir copy/estados).

**No aporta**

- Migrar a su UI kit; reescribir pagos.

---

## HisaabScore

**Qué hace bien**

- Tooltips de chart, gauges, breakdown visual.

**Qué hace mal**

- Scoring propio; no Experian/Equifax/TU reales.
- Sin licencia.

**Aporta a J&H**

- Tipografía compacta de score (ya cubierto por `BureauScoreInteractive` + SVG).

**No aporta**

- Lógica de scoring; nuevas libs de charts (J&H tiene SVG).

Archivo de interés: `src/components/custom-chart-tooltip.tsx` (estudio visual).

---

## CredGate

**Qué es:** infraestructura on-chain (CreditCoin), score de wallets, préstamos sin colateral.

**Aporta a J&H:** nada material para operación de reparación de crédito con burós tradicionales.

**Veredicto:** **NO NECESARIO**. No justificar uso artificial.

---

## Principio de reutilización para J&H

```text
1. ¿J&H ya lo tiene? → mejorar / hacer visible
2. ¿Es solo UX? → recrear patrón sin copiar archivos
3. ¿Licencia restrictiva o ausente? → cero código ajeno
4. ¿Resuelve un problema de Hugo en ≤5s? → priorizar
5. ¿Requiere schema? → solo si no hay otra vía
```
