# CRM de Hugo: qué falta y cómo probarlo

Auditoría del 2 de noviembre de 2026, sobre `main` @ `dc61037`.

**Veredicto: todavía no está listo para Hugo.** B1 y B2 están reparados en el código de trabajo el 2 de noviembre, pero falta desplegarlos, cerrar B3 y B4, y hacer el piloto.

## Qué se revisó y qué no

| Fuente | Resultado |
|---|---|
| Granola | Solo se pudo leer la **Sesión 3** (6 de octubre). El plan gratis limita el historial a 30 días. Las sesiones 1 y 2 no están al alcance, y la 3 sale de la ventana cerca del 5 de noviembre. |
| Código | `ci:qa` pasa completo en local tras la reparación del 2 de noviembre. |
| CI de GitHub | Estaba en rojo. La causa local (lint en `.agents`) ya está corregida; falta confirmarlo en GitHub. |
| Base DEV (`u627288392_dev`, solo conteos) | 5 clientes, 1 reporte, 1 documento, **0 rondas y 0 pagos**. Stripe en modo test. SMTP, WhatsApp, enlace de agenda y firma vacíos. |
| Producción | Las páginas públicas responden, `/crm` pide login y los cron rechazan sin secreto. `/empieza` (29 de octubre) ya está en vivo, así que el bloqueo del 23 de octubre probablemente también. |
| No verificado | Panel de Vercel (el conector y el CLI no ven el proyecto), datos y variables de producción, si Preview comparte base con producción, cron-job.org, backups y pantallas con sesión iniciada. |

## Bloqueadores

### B1. Envío de rondas (reparado, falta desplegar)

Desde `170ecb0` (23 de octubre) ninguna ronda podía marcarse como enviada, porque se exigía una política que no se podía guardar. Ahora se exige un contrato firmado del cliente, para ese caso o sin caso asignado. Si falta, la pantalla lo explica.

También se corrigió el calendario, que se abría detrás del diálogo cuando había dos modales abiertos.

### B2. Pagos (reparado, falta desplegar)

Stripe podía cobrar sin que el CRM lo registrara, porque el webhook respondía 400. Ahora lo ya cobrado y los pagos manuales siempre se registran. El contrato firmado se exige antes, al generar el enlace de pago de una cotización ligada a un caso.

**Pendiente:** después de desplegar, revisar en Stripe los webhooks fallidos desde el 23 de octubre y reenviarlos.

### B3. Falta revisión legal antes de cobrar a clientes reales

Las páginas legales en vivo dicen "borrador — requiere revisión legal". Esto es para llevar a un abogado, no es una conclusión legal:

- **Cancelación:** el código exige 3 días naturales en UTC. CROA habla de 3 días *hábiles*, así que el plazo actual podría quedar corto.
- **Cobro por adelantado:** CROA restringe cobrar antes de completar el servicio. Hay que validar el modelo de cobro de Hugo, sus cotizaciones y sus planes de pago.
- **Entidad:** los textos dicen J&H Multiservices LLC, y Stripe ahora muestra `hugomontenegro.site`. Hay que aclarar quién vende y quién firma el contrato.
- **Estados:** varios piden registro o fianza a las empresas de reparación de crédito. El CRM filtra por estado, pero no valida eso.

### B4. Datos sensibles y operación

- **IA:** los reportes de crédito se procesan con modelos `:free` de OpenRouter. El smoke de PII pasa, pero hay que decidir si un proveedor gratuito es aceptable para estos datos. Recomiendo un modelo de pago sin retención de datos.
- **Backups:** falta ensayar una restauración de la base.
- **Errores:** no hay monitoreo. Un webhook fallido como el de B2 pasaría desapercibido.
- **Entornos:** falta confirmar que Preview no escriba en producción.

## Lo que pidió Hugo (Sesión 3)

| Pedido | Estado |
|---|---|
| Dominio y enlace en Stripe | Hecho en la reunión |
| Abrir un documento al hacer clic en su nombre | Probar en pantalla |
| Simplificar subir y solicitar documentos | Hay subida en el portal; probar cuántos clics toma |
| Reducir clics en la navegación | Hubo varios commits; falta que Hugo lo valide |
| Onboarding en un paso (contrato, documentos y portal) | **No encontré ese flujo unificado.** Era una recomendación, no un pedido confirmado |
| Vista de próximas rondas o actualizaciones | Hay alertas de reporte vencido; probar si cubre lo que pidió |
| Portal para que el cliente vea su progreso | Existe; falta decidir si se activa para Agustín |
| Disputar bancarrotas | Hay categoría y plan de acción; probar la carta de principio a fin |
| Prueba completa con Agustín | **No hecha en DEV: hay 0 rondas.** Falta confirmar en producción |
| Rondas anteriores de Agustín | Sin decidir: recuperar las 4 rondas o empezar desde la actual |
| Análisis de Negocio Capital | Sin confirmar; el acceso de prueba pudo haber vencido |

## Orden de trabajo

1. **Desplegar B1 y B2.** Ya están reparados y probados en local.
2. **Confirmar el CI en verde en GitHub.** En local, `ci:qa` ya pasa. `smoke:contract-gates-db` necesita MySQL y todavía no corre en el CI.
3. **Recuperar pagos perdidos.** Revisar en Stripe los webhooks fallidos desde el 23 de octubre.
4. **Configurar producción.** SMTP si se usará correo, WhatsApp, agenda, firma, logo, Stripe live, cron-job.org y backup.
5. **Revisión legal** de B3, y cambios de textos y plazos.
6. **Correr las pruebas** de abajo en un entorno que no sea producción.
7. **Piloto con Agustín,** con Hugo manejando el CRM y tú observando.
8. **Ajustar** lo que salga del piloto y abrir a más clientes.

## Pruebas

Se hacen en DEV o Preview, con datos inventados y Stripe en modo test.

### 1. Recorrido principal: tiene que pasar completo

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Entrar por `/empieza` como prospecto | Aparece como lead con su canal de origen |
| 2 | Convertirlo en cliente | Sin duplicados, conserva su origen |
| 3 | Enviar y firmar el contrato | Plazo de cancelación correcto, con la firma de la agencia |
| 4 | Crear y enviar una cotización | El cliente recibe el enlace; sin contrato firmado, el enlace de un caso se rechaza |
| 5 | Pagar con tarjeta de prueba de Stripe | Pago, recibo y saldo en el CRM; webhook 200 |
| 6 | Reenviar el mismo evento de Stripe | No se duplica el pago |
| 7 | Cliente sube su ID y comprobante desde el enlace | El documento aparece en su ficha y abre con un clic |
| 8 | Subir un reporte en PDF | Termina el análisis, los puntajes coinciden con el PDF |
| 9 | Revisar las cuentas negativas | Bien agrupadas, sin cuentas inventadas |
| 10 | Generar el Plan de Score y sus PDF | Los números cuadran, con logo y marca correctos |
| 11 | Crear la ronda 1 y sus cartas | Una por buró y método, sin datos de otro cliente |
| 12 | **Marcar la ronda como enviada** | Se crean la fecha de revisión, la tarea y el recordatorio |
| 13 | Registrar resultados y subir un reporte nuevo | La comparación y el gráfico muestran el avance |
| 14 | Crear la ronda 2 | Conserva el historial de la ronda 1 |
| 15 | Entrar al portal como cliente | Solo ve lo suyo y su progreso |

### 2. Casos que deben fallar sin hacer daño

- **Pagos:** tarjeta rechazada, pago cancelado, reembolso y anulación de recibo.
- **Contratos:** enviar uno incompleto, cancelar dentro del plazo.
- **Archivos:** tipo inválido, muy grande, PDF escaneado o de 100 páginas, PDF con contraseña.
- **Duplicados:** mismo correo o teléfono, importación de CSV con errores.
- **Fechas:** rondas alrededor de medianoche y cambio de horario.

### 3. Seguridad

- Cliente A cambia la URL para abrir un documento o reporte de B: debe negarse.
- Un enlace de documento vencido no debe abrir.
- Un usuario sin permisos no entra a pagos, usuarios ni auditoría.
- Sin sesión, `/crm` redirige a login. Los cron responden 401 sin secreto.
- El SSN no aparece completo en pantallas, PDF, logs ni en el chat de IA.
- Probar MFA y que la sesión expire.

### 4. Precisión del crédito

Con **3 reportes reales**, Hugo compara el resultado del CRM contra Fondify y MyFreeScoreNow: puntajes, cuentas, saldos, utilización y consultas. Uno debe tener bancarrota. El nombre "MyFreeScoreNow" es mi suposición: las notas de Granola dicen "MyFrisco"; confírmalo con Hugo.

### 5. Prueba de usabilidad con Hugo

Sin ayuda y en su celular y su computadora, Hugo debe poder crear un cliente, pedir documentos, encontrar los clientes con ronda pendiente, subir un reporte y enviar un enlace de pago. Anota dónde se detiene y cuántos clics le toma.

### 6. Listo para lanzar

- [ ] B1 a B4 cerrados
- [ ] CI en verde
- [ ] Recorrido principal aprobado en Preview
- [ ] Restauración de backup ensayada
- [ ] Stripe live: webhook apuntando a producción y un cobro real pequeño, luego reembolsado
- [ ] Cron con ejecuciones correctas en cron-job.org
- [ ] Piloto con Agustín terminado
- [ ] Manual corto y sesión de capacitación con Hugo

## Reparto entre las IAs

**Reglas para todas:** nunca reciben reportes reales, SSN, contraseñas ni `.env`. Nunca tocan producción ni la base directamente. Cada cambio pasa por una rama y una revisión.

| Herramienta | Mejor uso |
|---|---|
| **Claude Code** | B1 y B2, pagos, seguridad, base de datos y revisión final de todo |
| **Cursor** | Cambios pequeños de interfaz con archivos exactos |
| **Aside** | Ejecutar las pruebas en el navegador y reportar bugs |
| **Kimi K3** | Segunda revisión de código, sin editar |
| **ChatGPT** | Manual de Hugo, textos para clientes y preguntas para el abogado |

### Prompt para Aside

```text
Eres QA manual de un CRM de reparación de crédito. Trabaja SOLO en esta URL de pruebas: [URL de Preview].
Si la URL es www.jh-multiservices.com, detente y avísame.

Usa únicamente datos inventados y las tarjetas de prueba de Stripe.
No envíes mensajes a personas reales, no borres datos y no cambies la configuración.

Sigue estos pasos, uno por uno: [pega la tabla del recorrido principal].

Por cada paso reporta: número, PASA o FALLA, URL, qué esperabas, qué pasó, captura y errores de consola.
No corrijas nada ni te saltes pasos. Si uno te bloquea, repórtalo y sigue con el siguiente que sea posible.
Al final, lista cada lugar donde la tarea tomó más clics de lo razonable.
```

### Prompt para Cursor

```text
Lee AGENTS.md y la guía de Next.js en node_modules/next/dist/docs/ que aplique antes de escribir código.

Tarea: [un solo cambio concreto].
Archivos permitidos: [rutas exactas].
No toques src/server/payments, src/server/rounds, prisma/ ni .env*.
No agregues dependencias ni refactorices nada más.

Termina cuando: [comportamiento verificable].
Corre npm run typecheck y lint solo sobre los archivos cambiados. Muéstrame el diff y no hagas commit.
```

### Prompt para Kimi K3

```text
Revisa este diff de un CRM que maneja datos de crédito y pagos. No edites nada.
Busca solo problemas reales: datos de otro cliente, pagos duplicados o perdidos, permisos y fechas.
Por cada hallazgo da archivo, línea, un caso concreto que lo provoque y severidad. Si no encuentras nada, dilo.
```

### Prompt para ChatGPT

```text
Redacta un manual en español simple para Hugo, dueño de un negocio de reparación de crédito.
Temas: [flujo probado].
Usa pasos cortos por tarea, sin términos técnicos. No inventes pantallas ni prometas resultados de crédito.
Marca con [CONFIRMAR] lo que no sepas.
```

## Lo que necesito de ti

1. Notas de las Sesiones 1 y 2, y de cualquier sesión posterior al 6 de octubre. Exporta la Sesión 3 antes del 5 de noviembre o amplía el plan de Granola.
2. Acceso al proyecto de Vercel para este conector, o que revises el panel.
3. Respuestas de Hugo: rondas anteriores de Agustín, acceso al portal y entidad legal.
4. Un abogado para B3.
