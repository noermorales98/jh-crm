import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createOpenRouterModel, isOpenRouterConfigured } from "@/src/lib/ai/openrouter";
import { buildSystemPrompt } from "@/src/lib/ai/prompt";
import { apiErrorResponse } from "@/src/server/http";
import { requireApiOrganization } from "@/src/server/auth/guards";
import { getCompanySnapshot } from "@/src/server/ai/queries";
import { saveChatMessages } from "@/src/server/ai/chats";
import { buildCrmTools } from "@/src/server/ai/tools";

export const maxDuration = 60;

export async function GET() {
  try {
    await requireApiOrganization();
    return NextResponse.json({
      ok: true,
      configured: isOpenRouterConfigured(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiOrganization();
    if (!isOpenRouterConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La IA no está configurada. Añade OPENROUTER_API_KEY en las variables de entorno.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as { id?: string; messages?: UIMessage[] };
    const chatId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
    const uiMessages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    const tools = buildCrmTools(ctx);
    const company = await getCompanySnapshot(ctx);
    const modelMessages = await convertToModelMessages(uiMessages, {
      tools,
      ignoreIncompleteToolCalls: true,
    });

    const result = streamText({
      model: createOpenRouterModel(),
      system: buildSystemPrompt(
        ctx,
        company.legalName || company.organizationName,
        typeof company.timezone === "string" ? company.timezone : undefined,
      ),
      messages: modelMessages,
      tools,
      stopWhen: isStepCount(8),
      maxRetries: 1,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: uiMessages,
        generateMessageId: () => crypto.randomUUID(),
        onError: () => "No pude completar la respuesta. Intenta de nuevo.",
        onEnd: async ({ messages }) => {
          if (!chatId || messages.length === 0) return;
          try {
            await saveChatMessages(ctx, chatId, messages);
            revalidatePath("/crm/chats");
            revalidatePath(`/crm/chats/${chatId}`);
          } catch (error) {
            console.error("[ai] no se pudo guardar el chat:", error);
          }
        },
      }),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
