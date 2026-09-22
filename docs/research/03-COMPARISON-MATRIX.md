# 03 — Matriz comparativa (módulo a módulo)

> Objetivo: patrones útiles para J&H. No hay “ganador”.  
> Celdas descriptivas (no solo checkmarks).

| Área | J&H | ClientFlow | NextCRM | Frappe | HisaabScore | CredGate |
|------|-----|------------|---------|--------|-------------|----------|
| Client 360 | Hub denso V2: 8/4, rail, peeks, scores, chart | Ficha customer + related | Contact/customer pages genéricas | Record workspace + side panel | N/A (score app) | N/A |
| Dashboard | “Para hacer” + KPIs crédito | Dashboard métricas demo | Dashboard Tremor | Views Frappe | Dashboard scores | On-chain dash |
| Lead pipeline | Opportunity + UI leads; sin tabla Lead | Deals mock | Opportunities | Lead.vue pipeline | N/A | N/A |
| Client profile | Tabs + 360 overview | Customer details | Customers | Contact.vue | N/A | Wallets |
| Tasks | Task rica + automations; títulos lead flojos | RelatedTasks + modal | Tasks module | Tasks.vue + activities | N/A | N/A |
| Activity | ActivityLog + Note | RecordActivityList | Activity logs | Activities unificadas | N/A | N/A |
| Notes | Note table + QuickAdd modal | Inline notes | Notes | Comments en Activities | N/A | N/A |
| Documents | S3 + checklist DC-005 | Débil/demo | Documents module | Files en Activities | N/A | N/A |
| Payments | Quote/Payment/Stripe/peeks | Débil | Invoices+payments fuerte | Limitado CRM | Financiero propio | Lending on-chain |
| Credit scores | EXP/EQX/TU reales + deltas | N/A | N/A | N/A | Gauges/tooltips visuales | Wallet score |
| Credit reports | Full módulo + PDF AI | N/A | N/A | N/A | Report dialogs | Proofs on-chain |
| Dispute rounds | CreditRound + DisputeItem + peeks | N/A | N/A | N/A | N/A | N/A |
| Timeline | CreditTimeline + Activity | Activity list | Limitado | Activities hub | Sparklines | N/A |
| Search | Spotlight / universal search | Básico | Search | Frappe search | N/A | N/A |
| Navigation | Sidebar + SplitView + mobile bottom | App nav | App shell | Desk | App nav | Web3 nav |
| Mobile | Bottom nav + sheets | Responsive demo | Responsive | Mobile-ish | Responsive | Web |
| Quick actions | ClientQuickAdd | Add Deal/Task modals | Row actions | Contextual actions | N/A | N/A |
| Progressive disclosure | Peeks + details secundarios | Modals | Sheets | Panels | Dialogs | Modals |
| Charts | SVG ScoreEvolutionChart | N/A | Tremor | Limitado | Rich charts | N/A |
| Tooltips | Local hover (no DB) | Title tips | shadcn | Frappe tips | Custom chart tooltip | N/A |
| Peek modals | Round/Payment/Report | Task/Deal modals | Detail drawers | Side panels | Report-view-dialog | N/A |
| Performance | Overview slim + peeks click; MySQL risk | Client mock | Postgres | Frappe server | Client charts | Chain RPCs |
| Permissions | Role matrix can() | Débil demo | Roles | Frappe perms | Auth app | Wallet auth |

## Lecturas clave por problema

### Ficha fragmentada

- **J&H:** V2 ya concentra above-the-fold; intake/integraciones aún en details.
- **Frappe/ClientFlow:** stay-on-record + related.
- **Conclusión:** ampliar Resumen con intake; no nuevo hub.

### Atención diaria (tareas)

- **J&H:** dashboard existe; títulos lead genéricos.
- **ClientFlow:** related tasks con contexto.
- **Conclusión:** mejorar título + detalle; no nuevo módulo tareas.

### Finanzas

- **J&H:** Stripe+Quote sólido.
- **NextCRM:** claridad invoice actions.
- **Conclusión:** copy/UX; no reescribir pagos.

### Scores

- **J&H:** datos reales + chart.
- **HisaabScore:** polish visual.
- **Conclusión:** no nueva lib; no copiar scoring.
