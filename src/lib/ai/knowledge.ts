/**
 * Mapa de rutas y cómo-hacer del CRM. Se inyecta en el system prompt
 * para que el asistente pueda guiar con enlaces reales.
 */

export const CRM_ROUTES = [
  { href: "/crm/dashboard", label: "Inicio", how: "Resumen operativo: clientes activos, casos abiertos, tareas y pagos." },
  { href: "/crm/tareas", label: "Pendientes", how: "Tareas con vencimiento y asignación. También se crean desde el caso o el cliente." },
  { href: "/crm/oportunidades", label: "Leads", how: "Pipeline comercial de oportunidades. Seguimiento y conversión a cliente/caso." },
  { href: "/crm/clientes", label: "Clientes", how: "Lista y filtros de clientes. Alta en /crm/clientes/nuevo." },
  { href: "/crm/clientes/nuevo", label: "Nuevo cliente", how: "Formulario de alta: nombre, contacto, dirección, fuente y responsable. Los datos sensibles se capturan después en el expediente." },
  { href: "/crm/clientes/{id}", label: "Ficha de cliente", how: "Resumen del cliente. Pestañas: expediente, casos y actividad." },
  { href: "/crm/clientes/{id}/expediente", label: "Expediente", how: "Datos del cliente, perfil sensible (SSN, licencia) y documentos." },
  { href: "/crm/clientes/{id}/casos", label: "Casos del cliente", how: "Casos de crédito del cliente. Aquí se crea un caso nuevo." },
  { href: "/crm/clientes/{id}/actividad", label: "Actividad del cliente", how: "Bitácora de notas y eventos del cliente." },
  { href: "/crm/casos", label: "Casos", how: "Pipeline de casos de crédito. Un caso se crea desde la ficha del cliente (Casos)." },
  { href: "/crm/casos/{id}", label: "Detalle de caso", how: "Resumen, etapa, responsable y próxima revisión." },
  { href: "/crm/casos/{id}/credito", label: "Crédito del caso", how: "Reportes, ítems, burós y scores del caso." },
  { href: "/crm/casos/{id}/rondas", label: "Rondas del caso", how: "Rondas de disputa de ese caso." },
  { href: "/crm/casos/{id}/comparaciones/{comparisonId}", label: "Comparación de reportes", how: "Resultados DELETED/UPDATED/VERIFIED entre dos reportes." },
  { href: "/crm/casos/{id}/tareas", label: "Tareas del caso", how: "Tareas ligadas al caso." },
  { href: "/crm/casos/{id}/documentos", label: "Documentos del caso", how: "Archivos asociados al caso." },
  { href: "/crm/casos/{id}/cotizaciones", label: "Cotizaciones del caso", how: "Cotizaciones ligadas al caso." },
  { href: "/crm/casos/{id}/pagos", label: "Pagos del caso", how: "Pagos ligados al caso." },
  { href: "/crm/rondas", label: "Rondas", how: "Rondas de disputa ligadas a un caso. Crear desde /crm/casos/{id}/rondas." },
  { href: "/crm/consultas", label: "Consultas", how: "Consultas de $1 desde el sitio (REQUESTED). No marcar PAID sin pasarela." },
  { href: "/crm/contratos", label: "Contratos", how: "Plantillas y contratos de cliente; firma desde el portal." },
  { href: "/crm/testimonios", label: "Testimonios", how: "Reseñas de clientes con consentimiento." },
  { href: "/crm/procesadores", label: "Procesadores", how: "Monitores y afiliados de crédito (Credit Karma, etc.)." },
  { href: "/portal", label: "Portal del cliente", how: "Acceso del cliente (FEATURE_CLIENT_PORTAL). Progreso, documentos, pagos." },
  { href: "/crm/servicios", label: "Servicios", how: "Catálogo de servicios. Paquetes en /crm/servicios/paquetes." },
  { href: "/crm/servicios/paquetes", label: "Paquetes", how: "Paquetes armados a partir de servicios del catálogo." },
  { href: "/crm/cotizaciones", label: "Cotizaciones", how: "Lista de cotizaciones. Nueva en /crm/cotizaciones/nueva." },
  { href: "/crm/cotizaciones/nueva", label: "Nueva cotización", how: "Elegir cliente (y caso opcional), añadir ítems del catálogo o sueltos, guardar y enviar." },
  { href: "/crm/cotizaciones/{id}", label: "Detalle de cotización", how: "Ítems, totales, envío y PDF." },
  { href: "/crm/pagos", label: "Pagos", how: "Pagos pendientes y recibidos. Registrar en /crm/pagos/nuevo." },
  { href: "/crm/pagos/nuevo", label: "Registrar pago", how: "Cliente, cotización opcional, monto, método (Zelle, Stripe, efectivo, transferencia)." },
  { href: "/crm/planes-pago", label: "Cuotas", how: "Planes de pago e installments por cliente." },
  { href: "/crm/recibos", label: "Recibos", how: "Recibos emitidos al confirmar un pago. Se pueden anular (admin)." },
  { href: "/crm/chats", label: "Chats", how: "Historial de conversaciones con el asistente. Crear un chat nuevo o continuar uno reciente." },
  { href: "/crm/mails", label: "Correos", how: "Bandeja de la organización: ver, enviar, archivar, traducir al español y eliminar correos. Redactar en /crm/mails/nuevo. cron-job.org llama /api/cron/mails-sync cada minuto para IMAP y avisos." },
  { href: "/crm/mails/nuevo", label: "Redactar correo", how: "Enviar un correo por SMTP. La copia queda en Enviados. Se puede enlazar a un cliente." },
  { href: "/crm/usuarios", label: "Usuarios", how: "Miembros de la organización e invitaciones (solo admin/owner)." },
  { href: "/crm/auditoria", label: "Auditoría", how: "Eventos sensibles: perfil, documentos, recibos (solo admin/owner)." },
  { href: "/crm/configuracion", label: "Configuración", how: "Datos de empresa, moneda, prefijos, hasta 4 números WhatsApp CallMeBot." },
  { href: "/crm/configuracion/etapas", label: "Etapas del pipeline", how: "Etapas del caso: nombre, color y orden." },
] as const;

export const HOW_TO_GUIDE = `
## Cómo hacer las operaciones más comunes

### Agregar un cliente
1. Ir a [Clientes](/crm/clientes/nuevo) o [lista de clientes](/crm/clientes) → Nuevo.
2. Completar nombre (obligatorio), apellido, correo, teléfono, dirección, fuente y responsable.
3. Guardar. Luego abrir el cliente → pestaña Expediente para SSN, licencia y documentos.

### Editar un cliente / expediente / documentos
1. [Clientes](/crm/clientes) → abrir el cliente.
2. Pestaña Expediente: datos a la izquierda, sensibles y documentos a la derecha.
3. Documentos: elegir categoría y sensibilidad, soltar el archivo (PDF/JPG/PNG, máx. 15 MB).

### Crear un caso
1. Abrir el cliente → pestaña Casos → botón de crear caso.
2. Elegir etapa (o se usa la primera activa), responsable, resumen y próxima revisión.
3. El caso aparece en [Casos](/crm/casos). Detalle: /crm/casos/{id}.

### Crear una ronda de disputa
1. Abrir el caso → pestaña Rondas, o [Rondas](/crm/rondas).
2. Crear ronda, marcar enviada cuando salga la carta, luego revisar resultado.

### Ver progreso crediticio
1. Abrir el caso → [Crédito](/crm/casos) (pestaña crédito del caso).
2. Comparar reportes desde Comparaciones. Solo contar eliminaciones con outcome DELETED o resultado de comparación.

### Consultas
1. [Consultas](/crm/consultas) — solicitudes de consulta del sitio.

### Portal y contratos
1. Invitar al portal desde la ficha del cliente (si FEATURE_CLIENT_PORTAL).
2. [Contratos](/crm/contratos) — enviar y firmar desde el portal.

### Crear una tarea
1. [Tareas](/crm/tareas) o desde el caso/cliente.
2. Tipo, prioridad, vencimiento, asignado. Completar o cancelar desde la fila.

### Crear una cotización
1. [Nueva cotización](/crm/cotizaciones/nueva).
2. Cliente, ítems (servicio/paquete o personalizado), guardar.
3. Enviar al cliente; al aceptar, registrar pagos.

### Registrar un pago y ver el recibo
1. [Registrar pago](/crm/pagos/nuevo) (se puede partir de una cotización).
2. Al marcar recibido se emite recibo con folio. Ver [Recibos](/crm/recibos) o PDF.

### Formulario de contacto del sitio
1. En la portada (/) hay un formulario de contacto. Al enviar se pide un desliz para confirmar que no es un robot.
2. Cada envío nuevo se guarda como cliente Prospecto (LEAD) en [Clientes](/crm/clientes), fuente Sitio web.
3. Avisa en la campana y por WhatsApp (CallMeBot). Si el correo o teléfono ya existe, se anota la consulta en el expediente y no se vuelve a notificar.

### Enviar un correo
1. [Correos](/crm/mails) → Redactar, o /crm/mails/nuevo.
2. Para, asunto y mensaje. Opcional: enlazar un cliente.
3. Enviar (SMTP de Configuración → Notificaciones) o guardar borrador. Archivar o eliminar desde el detalle.
4. En el detalle: Traducir al español (IA, o MyMemory si no hay clave). Los correos nuevos se sincronizan cada minuto y avisan en la campana y por WhatsApp.

### Invitar un usuario
1. [Usuarios](/crm/usuarios) (admin/owner). Invitar con correo y rol.

Roles: VIEWER (solo lectura), STAFF (operación, sin sensibles), SPECIALIST (incluye SSN/documentos sensibles), ADMIN/OWNER (todo + usuarios, auditoría, anular recibos).

## Empresa
J&H MultiServices LLC. Servicios: formación de LLC, páginas web, consultoría personalizada, proyectos personales y de negocio. Tel. (872) 202-0156. Web https://jh-multiservices.com/
`.trim();

export function routesForPrompt(): string {
  return CRM_ROUTES.map((r) => {
    if (r.href.includes("{")) {
      return `- ${r.label}: ${r.href} (sustituye {id} por el id real; si no lo tienes, enlaza la lista) — ${r.how}`;
    }
    return `- [${r.label}](${r.href}) — ${r.how}`;
  }).join("\n");
}
