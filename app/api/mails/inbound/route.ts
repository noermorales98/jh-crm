import { NextResponse } from "next/server";
import { z } from "zod";
import { safeEqual } from "@/src/lib/security/tokens";
import { emailSchema } from "@/src/lib/validation/common";
import { apiErrorResponse } from "@/src/server/http";
import {
  findOrganizationIdForRecipient,
  recordInbound,
} from "@/src/server/mails";

const inboundSchema = z.object({
  from: z.string().trim().min(1).max(300),
  to: z.union([z.array(emailSchema).min(1), emailSchema]),
  cc: z.union([z.array(emailSchema), emailSchema]).optional(),
  subject: z.string().trim().max(500).optional(),
  text: z.string().max(50_000).optional(),
  html: z.string().max(200_000).optional(),
  messageId: z.string().trim().max(255).optional(),
  organizationId: z.string().trim().min(1).optional(),
});

/**
 * POST /api/mails/inbound — entrada de correo (reenvío o parseo del proveedor).
 * Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!secret || !safeEqual(token, secret)) {
      return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
    }

    const json = inboundSchema.parse(await request.json());
    const recipients = Array.isArray(json.to) ? json.to : [json.to];
    let organizationId = json.organizationId ?? null;
    if (!organizationId) {
      for (const recipient of recipients) {
        organizationId = await findOrganizationIdForRecipient(recipient);
        if (organizationId) break;
      }
    }
    if (!organizationId) {
      return NextResponse.json(
        { ok: false, error: "No se encontró la organización destinataria." },
        { status: 404 },
      );
    }

    const result = await recordInbound(organizationId, {
      from: json.from,
      to: recipients,
      cc: json.cc,
      subject: json.subject ?? "(Sin asunto)",
      text: json.text,
      html: json.html,
      messageId: json.messageId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
