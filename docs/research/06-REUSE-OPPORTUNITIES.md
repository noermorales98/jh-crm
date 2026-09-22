# 06 — Reuse opportunities

> Evitar construir lo que ya existe. Formato: Idea → Referencia → ¿J&H? → Acción.

---

### Idea: Resumen de intake en ficha

**Referencia:** Frappe Activities / side panel fields.  
**¿J&H ya tiene algo similar?** Sí: `IntakeSubmission.payloadJson` + Accesos e integraciones (solo links).  
**Acción recomendada:** Mejorar — leer submission en overview y mostrar card compacta en Resumen.  
**NO:** Nueva tabla; nuevo módulo “Formularios”.

---

### Idea: Abrir expediente desde empty state

**Referencia:** ClientFlow “Add Deal” desde customer.  
**¿J&H?** Sí: `CreateCaseButton` + `listVerticalServiceOptions` en `/servicios`.  
**Acción:** Reusar CreateCaseButton en empty state del overview con verticales.  
**NO:** Nuevo wizard multi-página; no forzar Opportunity primero (decisión D2).

---

### Idea: markWon multi-vertical

**Referencia:** Dominio propio ARCHITECTURE_V1.  
**¿J&H?** Sí: `createServiceCase(serviceCode)` ya soporta verticales.  
**Acción:** Pasar serviceCode a markWon; UI de WON con selector.  
**NO:** Nueva entidad Conversion; no hardcode segundo path.

---

### Idea: Título de tarea con nombre del cliente

**Referencia:** ClientFlow related tasks; J&H ya usa `Contactar · Name` en follow-ups.  
**¿J&H?** Parcial: `onNewLead` título fijo; follow-up sí incluye nombre.  
**Acción:** Unificar título a `Contactar a [nombre] nuevo lead`; dashboard muestra title.  
**NO:** Nuevo componente AttentionTasks.

---

### Idea: “Qué necesita el cliente” al abrir tarea

**Referencia:** Frappe Lead fields; kanban J&H `resolveLeadIntent`.  
**¿J&H?** Sí: `serviceRequested`, intake payload, leads-intent util.  
**Acción:** Cargar en `getTask` / panel: intent + link al cliente.  
**NO:** Duplicar kanban dentro de tareas.

---

### Idea: Timeline / Activities hub

**Referencia:** Frappe `Activities.vue`.  
**¿J&H?** Sí: ActivityLog + CreditTimeline + Note + actividad compacta en 360.  
**Acción:** Mejorar presentación si hace falta después de Fase A.  
**NO:** Segunda timeline AGPL-style; no mezclar Note y ActivityLog.

---

### Idea: Side operational rail

**Referencia:** Frappe SidePanelLayout; ClientFlow sidebar.  
**¿J&H?** Sí: `client-operational-rail.tsx` (V2).  
**Acción:** Reutilizar; meter intake summary en columna principal o rail si cabe.  
**NO:** Nuevo rail library / drawers extra.

---

### Idea: Chart tooltips / gauges

**Referencia:** HisaabScore custom tooltip.  
**¿J&H?** Sí: CreditScoreChart hover local + BureauScoreInteractive.  
**Acción:** Ninguna en Fase A.  
**NO:** Recharts; no copiar HisaabScore.

---

### Idea: Invoice/payment clarity

**Referencia:** NextCRM invoices.  
**¿J&H?** Sí: PaymentsSummaryStrip + Stripe Ver/Compartir/Copiar.  
**Acción:** Ninguna urgente.  
**NO:** Reescribir pagos.

---

### Idea: CredGate / on-chain credit

**Referencia:** CredGate.  
**¿J&H?** N/A.  
**Acción:** **NO NECESARIO.**  
**NO:** Integrar wallets/CreditCoin.
