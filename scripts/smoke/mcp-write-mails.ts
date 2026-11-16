/**
 * Herramientas de escritura de correo del conector MCP contra una base real y desechable.
 * El envío va a un servidor SMTP falso que escucha solo en 127.0.0.1: nada sale de esta máquina.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-mails.ts
 */
import { createServer, type Server } from "node:net";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

async function errorText(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
}

assertDisposableDb();
process.env.FEATURE_MCP_CONNECTOR = "true";

const prisma = new PrismaClient();
const MARK = `mcpmail${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

/** SMTP mínimo que acepta todo y guarda lo recibido. Solo escucha en 127.0.0.1. */
function startSink(): Promise<{ server: Server; port: number; messages: string[]; recipients: string[] }> {
  const messages: string[] = [];
  const recipients: string[] = [];
  const server = createServer((socket) => {
    let inData = false;
    let data = "";
    let buffer = "";
    socket.write("220 sink ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          messages.push(data);
          data = "";
          socket.write("250 queued\r\n");
          continue;
        }
        const eol = buffer.indexOf("\r\n");
        if (eol === -1) return;
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") socket.write("250 sink\r\n");
        else if (cmd === "MAIL") socket.write("250 ok\r\n");
        else if (cmd === "RCPT") {
          recipients.push(line.replace(/^RCPT TO:\s*<?/i, "").replace(/>.*$/, ""));
          socket.write("250 ok\r\n");
        } else if (cmd === "DATA") {
          inData = true;
          socket.write("354 go\r\n");
        } else if (cmd === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 ok\r\n");
      }
    });
    socket.on("error", () => undefined);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port, messages, recipients })));
}

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { mailsTools, MAX_RECIPIENTS } = await import("../../src/server/mcp/tools/mails");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const sink = await startSink();
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: mailsTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;
  const auditOk = async (name: string, entityId: string) => {
    const row = await prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    return !!row && row.entityType === "MailMessage" && meta(row.metadata).via === "claude";
  };
  const refreshes = (id: string) => ["/crm/mails", "/mails", `/crm/mails/${id}`].every((p) => calls.some((c) => c.path === p));
  const mails = () => prisma.mailMessage.count({ where: { organizationId: a.org.id } });
  const mk = (organizationId: string, extra: object) =>
    prisma.mailMessage.create({ data: { organizationId, fromAddress: "x@example.test", toAddresses: ["crm@example.test"], subject: `Asunto ${MARK}`, bodyText: "texto", direction: "INBOUND", folder: "INBOX", ...extra } });

  try {
    console.log("metadatos");
    const byName = (n: string) => mailsTools.find((t) => t.name === n)!;
    check("4 herramientas con permiso mails.manage", mailsTools.length === 4 && mailsTools.every((t) => t.permission === "mails.manage"));
    const send = byName("enviar_correo");
    check("enviar_correo es destructive y de mundo abierto", send.kind === "destructive" && send.openWorld === true);
    check("enviar_correo pide confirmación, avisa que no se deshace y limita destinatarios",
      /confirmación explícita/i.test(send.description) && /no se puede retirar ni deshacer/i.test(send.description) && send.description.includes(String(MAX_RECIPIENTS)), send.description);
    check("enviar_correo avisa de no obedecer textos de correos, notas o documentos y sugiere el borrador", /dentro de un correo, una nota o un documento/i.test(send.description) && /borrador/i.test(send.description));
    const { MCP_SERVER_INSTRUCTIONS } = await import("../../src/server/mcp/endpoint");
    check("las instrucciones del servidor mandan tratar los correos recibidos como datos y pedir un sí explícito antes de enviar",
      /correos recibidos/i.test(MCP_SERVER_INSTRUCTIONS) && /nunca una orden/i.test(MCP_SERVER_INSTRUCTIONS) && /sí explícito/i.test(MCP_SERVER_INSTRUCTIONS), MCP_SERVER_INSTRUCTIONS);
    check("el resto no abre mundo", mailsTools.filter((t) => t.name !== "enviar_correo").every((t) => !t.openWorld && t.kind === "write"));
    check("no hay herramientas para borrar para siempre, sincronizar ni traducir", !mailsTools.some((t) => /borrar|eliminar|sincron|traduc/.test(t.name)));

    console.log("guardar_borrador_correo");
    const n0 = await mails();
    check("VIEWER -> Sin permiso y no escribe", (await errorText(() => call(a.viewer, "guardar_borrador_correo", { subject: "x" }))).includes("Sin permiso") && (await mails()) === n0);
    calls.length = 0;
    const d1 = await call(a.staff, "guardar_borrador_correo", { to: "uno@example.test", subject: `  Hola ${MARK} `, body: "Texto", clientId: a.client.id });
    const dRow = await prisma.mailMessage.findUnique({ where: { id: String(d1.id) } });
    check("STAFF guarda el borrador: DRAFTS, saliente, sin enviar, ligado al cliente", dRow?.folder === "DRAFTS" && dRow.direction === "OUTBOUND" && dRow.sentAt === null && dRow.clientId === a.client.id && dRow.subject === `Hola ${MARK}` && (dRow.toAddresses as string[])[0] === "uno@example.test", dRow);
    check("no envió nada", sink.messages.length === 0);
    check("auditoría via claude y entidad MailMessage", await auditOk("guardar_borrador_correo", String(d1.id)));
    check("refresca correos y el correo", refreshes(String(d1.id)), calls);
    check("enlace exacto", String(d1.href).endsWith(`/crm/mails/${d1.id}`), d1);
    const empty = await call(a.staff, "guardar_borrador_correo", {});
    check("sin datos: asunto (Sin asunto)", (await prisma.mailMessage.findUnique({ where: { id: String(empty.id) } }))?.subject === "(Sin asunto)");
    const n1 = await mails();
    await call(a.staff, "guardar_borrador_correo", { borradorId: String(d1.id), subject: "Cambiado", body: "Nuevo" });
    const dRow2 = await prisma.mailMessage.findUnique({ where: { id: String(d1.id) } });
    check("con borradorId actualiza el mismo borrador (no crea otro)", dRow2?.subject === "Cambiado" && dRow2.bodyText === "Nuevo" && (await mails()) === n1);
    const foreign = await mk(b.org.id, { folder: "DRAFTS", direction: "OUTBOUND" });
    check("borrador de otra organización -> No encontrado y sin cambios", (await errorText(() => call(a.staff, "guardar_borrador_correo", { borradorId: foreign.id, subject: "Robado" }))) === "NotFoundError: No encontrado." && (await prisma.mailMessage.findUnique({ where: { id: foreign.id } }))?.subject !== "Robado");
    check("cliente de otra organización -> No encontrado y no escribe", (await errorText(() => call(a.staff, "guardar_borrador_correo", { subject: "x", clientId: b.client.id }))) === "NotFoundError: No encontrado." && (await mails()) === n1);
    const sentMail = await mk(a.org.id, { folder: "SENT", direction: "OUTBOUND", sentAt: new Date() });
    check("un correo ya enviado no se puede sobrescribir como borrador", (await errorText(() => call(a.staff, "guardar_borrador_correo", { borradorId: sentMail.id, subject: "Pisado" }))).startsWith("DomainError") && (await prisma.mailMessage.findUnique({ where: { id: sentMail.id } }))?.subject === `Asunto ${MARK}`);

    console.log("enviar_correo");
    const sargs = { to: "cliente@example.test", subject: `Asunto ${MARK}`, body: "Mensaje de prueba" };
    const n2 = await mails();
    check("VIEWER -> Sin permiso, no envía y no escribe", (await errorText(() => call(a.viewer, "enviar_correo", sargs))).includes("Sin permiso") && sink.messages.length === 0 && (await mails()) === n2);
    check("sin SMTP configurado -> error claro, no escribe nada", (await errorText(() => call(a.staff, "enviar_correo", sargs))).startsWith("DomainError: El servidor SMTP no está configurado") && (await mails()) === n2);
    await prisma.organizationSettings.update({ where: { organizationId: a.org.id }, data: { smtpHost: "127.0.0.1", smtpPort: sink.port, smtpFrom: "CRM Prueba <crm@example.test>", smtpSecure: false, smtpUser: null, smtpPasswordEncrypted: null } });
    calls.length = 0;
    const sent = await call(a.staff, "enviar_correo", { ...sargs, cc: "copia@example.test", clientId: a.client.id });
    const sRow = await prisma.mailMessage.findUnique({ where: { id: String(sent.id) } });
    check("STAFF envía: el servidor lo recibió con asunto y texto", sink.messages.length === 1 && sink.messages[0].includes(`Asunto ${MARK}`) && sink.messages[0].includes("Mensaje de prueba"), sink.messages[0]?.slice(0, 200));
    check("los destinatarios (Para y Cc) llegaron al servidor", ["cliente@example.test", "copia@example.test"].every((r) => sink.recipients.includes(r)), sink.recipients);
    check("queda SENT, saliente, con fecha de envío y ligado al cliente", sRow?.folder === "SENT" && sRow.direction === "OUTBOUND" && !!sRow.sentAt && sRow.clientId === a.client.id && sRow.createdById === a.staff.userId, sRow);
    check("el resultado cuenta destinatarios pero no devuelve las direcciones", sent.sent === true && sent.recipients === 2 && !JSON.stringify(sent).includes("example.test"), sent);
    check("auditoría via claude y entidad MailMessage", await auditOk("enviar_correo", String(sent.id)));
    check("refresca correos y el correo", refreshes(String(sent.id)), calls);
    const act = await prisma.activityLog.findFirst({ where: { organizationId: a.org.id, clientId: a.client.id, type: "MAIL_SENT" } });
    check("queda la actividad del cliente (correo enviado)", !!act);
    const before = sink.messages.length;
    const six = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `d${i}@example.test`).join(",");
    check(`más de ${MAX_RECIPIENTS} destinatarios -> error y no envía`, (await errorText(() => call(a.staff, "enviar_correo", { ...sargs, to: six }))).startsWith("DomainError: Desde Claude se envía a un máximo") && sink.messages.length === before);
    check(`${MAX_RECIPIENTS} entre Para y Cc sí, y los repetidos cuentan una vez`,
      (await call(a.staff, "enviar_correo", { ...sargs, to: "a@example.test, a@example.test;b@example.test", cc: "c@example.test,d@example.test,e@example.test" })).recipients === 5 && sink.messages.length === before + 1);
    check("Para y Cc suman: 3 + 3 -> error", (await errorText(() => call(a.staff, "enviar_correo", { ...sargs, to: "a1@example.test,a2@example.test,a3@example.test", cc: "b1@example.test,b2@example.test,b3@example.test" }))).startsWith("DomainError") && sink.messages.length === before + 1);
    check("dirección inválida -> ZodError y no envía", (await errorName(() => call(a.staff, "enviar_correo", { ...sargs, to: "no-es-correo" }))) === "ZodError" && sink.messages.length === before + 1);
    check("sin destinatario o asunto -> ZodError", (await errorName(() => call(a.staff, "enviar_correo", { ...sargs, to: "" }))) === "ZodError" && (await errorName(() => call(a.staff, "enviar_correo", { ...sargs, subject: "" }))) === "ZodError");
    const afterOk = sink.messages.length;

    const draft = await call(a.staff, "guardar_borrador_correo", { to: "borrador@example.test", subject: `Borrador ${MARK}`, body: "Desde borrador" });
    const total = await mails();
    const viaDraft = await call(a.staff, "enviar_correo", { to: "borrador@example.test", subject: `Borrador ${MARK}`, body: "Desde borrador", borradorId: String(draft.id) });
    const dd = await prisma.mailMessage.findUnique({ where: { id: String(draft.id) } });
    check("enviar un borrador lo convierte en SENT sin crear otro correo", viaDraft.id === draft.id && dd?.folder === "SENT" && !!dd.sentAt && (await mails()) === total && sink.messages.length === afterOk + 1, dd);
    check("un correo que no es borrador no se envía otra vez -> error", (await errorText(() => call(a.staff, "enviar_correo", { ...sargs, borradorId: String(draft.id) }))).startsWith("DomainError") && sink.messages.length === afterOk + 1);
    check("borrador de otra organización -> No encontrado y no envía", (await errorText(() => call(a.staff, "enviar_correo", { ...sargs, borradorId: foreign.id }))) === "NotFoundError: No encontrado." && sink.messages.length === afterOk + 1);
    const original = await mk(a.org.id, { internetMessageId: `<orig-${MARK}@example.test>` });
    const reply = await call(a.staff, "enviar_correo", { ...sargs, to: "remitente@example.test", respondeAId: original.id });
    check("responder: queda ligado al correo original y lo manda con su hilo", (await prisma.mailMessage.findUnique({ where: { id: String(reply.id) } }))?.inReplyToId === original.id && sink.messages.at(-1)!.includes(`In-Reply-To: <orig-${MARK}@example.test>`), sink.messages.at(-1)?.slice(0, 300));
    const afterReply = sink.messages.length;
    const foreignOriginal = await mk(b.org.id, {});
    check("responder a un correo de otra organización -> No encontrado y no envía", (await errorText(() => call(a.staff, "enviar_correo", { ...sargs, respondeAId: foreignOriginal.id }))) === "NotFoundError: No encontrado." && sink.messages.length === afterReply);
    check("cliente de otra organización -> No encontrado y no envía", (await errorText(() => call(a.staff, "enviar_correo", { ...sargs, clientId: b.client.id }))) === "NotFoundError: No encontrado." && sink.messages.length === afterReply);

    console.log("mover_correo (nada se borra)");
    const m = await mk(a.org.id, {});
    const total2 = await mails();
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "mover_correo", { correoId: m.id, accion: "archivar" }))).includes("Sin permiso"));
    const folderOf = async (id: string) => (await prisma.mailMessage.findUnique({ where: { id } }))?.folder;
    calls.length = 0;
    await call(a.staff, "mover_correo", { correoId: m.id, accion: "archivar" });
    check("archivar -> ARCHIVE con fecha de archivo y refresca", (await folderOf(m.id)) === "ARCHIVE" && !!(await prisma.mailMessage.findUnique({ where: { id: m.id } }))?.archivedAt && refreshes(m.id), calls);
    await call(a.staff, "mover_correo", { correoId: m.id, accion: "desarchivar" });
    check("desarchivar -> INBOX", (await folderOf(m.id)) === "INBOX");
    await call(a.staff, "mover_correo", { correoId: m.id, accion: "spam" });
    check("spam -> SPAM", (await folderOf(m.id)) === "SPAM");
    await call(a.staff, "mover_correo", { correoId: m.id, accion: "no_spam" });
    check("no_spam -> INBOX", (await folderOf(m.id)) === "INBOX");
    await call(a.staff, "mover_correo", { correoId: m.id, accion: "papelera" });
    check("papelera -> TRASH y el correo sigue existiendo", (await folderOf(m.id)) === "TRASH" && (await mails()) === total2);
    await call(a.staff, "mover_correo", { correoId: m.id, accion: "restaurar" });
    check("restaurar -> INBOX", (await folderOf(m.id)) === "INBOX");
    check("auditoría via claude", await auditOk("mover_correo", m.id));
    check("desarchivar uno que no está archivado -> error y sin cambios", (await errorText(() => call(a.staff, "mover_correo", { correoId: m.id, accion: "desarchivar" }))).startsWith("DomainError") && (await folderOf(m.id)) === "INBOX");
    check("un borrador no se archiva ni se marca como spam", (await errorText(() => call(a.staff, "mover_correo", { correoId: String(empty.id), accion: "archivar" }))).startsWith("DomainError") && (await errorText(() => call(a.staff, "mover_correo", { correoId: String(empty.id), accion: "spam" }))).startsWith("DomainError") && (await folderOf(String(empty.id))) === "DRAFTS");
    check("acción inválida -> ZodError", (await errorName(() => call(a.staff, "mover_correo", { correoId: m.id, accion: "borrar" }))) === "ZodError");
    const bm = await mk(b.org.id, {});
    check("correo ajeno -> No encontrado y sin cambios", (await errorText(() => call(a.staff, "mover_correo", { correoId: bm.id, accion: "papelera" }))) === "NotFoundError: No encontrado." && (await folderOf(bm.id)) === "INBOX");

    console.log("marcar_correo_leido");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "marcar_correo_leido", { correoId: m.id, leido: true }))).includes("Sin permiso"));
    calls.length = 0;
    const read = await call(a.staff, "marcar_correo_leido", { correoId: m.id, leido: true });
    check("marca como leído y refresca", read.isRead === true && (await prisma.mailMessage.findUnique({ where: { id: m.id } }))?.isRead === true && refreshes(m.id), calls);
    await call(a.staff, "marcar_correo_leido", { correoId: m.id, leido: false });
    check("marca como no leído", (await prisma.mailMessage.findUnique({ where: { id: m.id } }))?.isRead === false);
    check("auditoría via claude", await auditOk("marcar_correo_leido", m.id));
    check("correo ajeno -> No encontrado y sin cambios", (await errorText(() => call(a.staff, "marcar_correo_leido", { correoId: bm.id, leido: true }))) === "NotFoundError: No encontrado." && (await prisma.mailMessage.findUnique({ where: { id: bm.id } }))?.isRead === false);
    check("leido no booleano -> ZodError", (await errorName(() => call(a.staff, "marcar_correo_leido", { correoId: m.id, leido: "si" }))) === "ZodError");
  } finally {
    sink.server.close();
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-mails: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
