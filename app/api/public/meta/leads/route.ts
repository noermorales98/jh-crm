import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apiErrorResponse, clientIpFromRequest } from "@/src/server/http";
import {
  assertRateLimit,
  sweepOldRateLimitBuckets,
} from "@/src/server/security/rate-limit";
import {
  isMetaLeadAdsEnabled,
  processMetaLead,
  type MetaLeadInput,
} from "@/src/server/meta/leads";

/**
 * Webhook Meta Lead Ads.
 * GET  — verificación hub.mode / hub.verify_token / hub.challenge
 * POST — leadgen (firma X-Hub-Signature-256) o body smoke/dev
 */

function verifyToken(): string | undefined {
  return process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || undefined;
}

function appSecret(): string | undefined {
  return process.env.META_APP_SECRET?.trim() || undefined;
}

function pageAccessToken(): string | undefined {
  return process.env.META_PAGE_ACCESS_TOKEN?.trim() || undefined;
}

function verifyHubSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = appSecret();
  if (!secret) return false;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type GraphLead = {
  id?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
};

async function fetchLeadFromGraph(leadgenId: string): Promise<GraphLead | null> {
  const token = pageAccessToken();
  if (!token) return null;
  const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set(
    "fields",
    "id,created_time,ad_id,adset_id,campaign_id,form_id,field_data",
  );
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    console.error("[meta/webhook] Graph API error:", res.status, await res.text());
    return null;
  }
  return (await res.json()) as GraphLead;
}

function parseSmokeBody(body: unknown): MetaLeadInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const externalLeadId =
    (typeof raw.externalLeadId === "string" && raw.externalLeadId) ||
    (typeof raw.leadgen_id === "string" && raw.leadgen_id) ||
    null;
  if (!externalLeadId) return null;
  return {
    externalLeadId,
    pageId: typeof raw.pageId === "string" ? raw.pageId : null,
    formId: typeof raw.formId === "string" ? raw.formId : null,
    adId: typeof raw.adId === "string" ? raw.adId : null,
    adsetId: typeof raw.adsetId === "string" ? raw.adsetId : null,
    campaignId: typeof raw.campaignId === "string" ? raw.campaignId : null,
    campaignName: typeof raw.campaignName === "string" ? raw.campaignName : null,
    fullName: typeof raw.fullName === "string" ? raw.fullName : null,
    firstName: typeof raw.firstName === "string" ? raw.firstName : null,
    lastName: typeof raw.lastName === "string" ? raw.lastName : null,
    email: typeof raw.email === "string" ? raw.email : null,
    phone: typeof raw.phone === "string" ? raw.phone : null,
    fieldData:
      raw.fieldData && typeof raw.fieldData === "object"
        ? (raw.fieldData as MetaLeadInput["fieldData"])
        : null,
  };
}

type LeadgenChange = {
  field?: string;
  value?: {
    leadgen_id?: string;
    page_id?: string;
    form_id?: string;
    ad_id?: string;
    adgroup_id?: string;
    campaign_id?: string;
  };
};

function extractLeadgenChanges(body: unknown): LeadgenChange[] {
  if (!body || typeof body !== "object") return [];
  const raw = body as { entry?: Array<{ changes?: LeadgenChange[] }> };
  const out: LeadgenChange[] = [];
  for (const entry of raw.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        out.push(change);
      }
    }
  }
  return out;
}

export async function GET(request: Request) {
  try {
    if (!isMetaLeadAdsEnabled()) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const ip = clientIpFromRequest(request);
    await assertRateLimit({
      key: `meta:leads:get:ip:${ip}`,
      limit: 60,
      windowSeconds: 60 * 60,
    });

    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = verifyToken();

    if (mode === "subscribe" && expected && token === expected && challenge) {
      return new NextResponse(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new NextResponse("Forbidden", { status: 403 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!isMetaLeadAdsEnabled()) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const secret = appSecret();
    if (!secret) {
      // Seguro por defecto: sin secreto no aceptamos POST.
      return NextResponse.json(
        { ok: false, error: "META_APP_SECRET no configurado." },
        { status: 403 },
      );
    }

    const ip = clientIpFromRequest(request);
    await assertRateLimit({
      key: `meta:leads:post:ip:${ip}`,
      limit: 120,
      windowSeconds: 60 * 60,
    });
    sweepOldRateLimitBuckets();

    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    const signatureOk = verifyHubSignature(rawBody, signature);

    let parsed: unknown = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
    }

    // Responder 200 rápido: Meta reintenta si no hay 200.
    // Procesamos de forma síncrona pero acotada (pocos leads por webhook).
    const changes = extractLeadgenChanges(parsed);
    const results: Array<{ externalLeadId: string; ok: boolean; deduped?: boolean }> = [];

    if (changes.length > 0) {
      if (!signatureOk) {
        return NextResponse.json({ ok: false, error: "Firma inválida." }, { status: 403 });
      }

      for (const change of changes.slice(0, 20)) {
        const leadgenId = change.value?.leadgen_id;
        if (!leadgenId) continue;

        const graph = await fetchLeadFromGraph(leadgenId);
        const input: MetaLeadInput = {
          externalLeadId: leadgenId,
          pageId: change.value?.page_id ?? null,
          formId: graph?.form_id ?? change.value?.form_id ?? null,
          adId: graph?.ad_id ?? change.value?.ad_id ?? null,
          adsetId: graph?.adset_id ?? change.value?.adgroup_id ?? null,
          campaignId: graph?.campaign_id ?? change.value?.campaign_id ?? null,
          fieldData: graph?.field_data ?? null,
        };

        try {
          const result = await processMetaLead(input);
          results.push({
            externalLeadId: leadgenId,
            ok: true,
            deduped: result.deduped,
          });
        } catch (error) {
          console.error(
            "[meta/webhook] processMetaLead:",
            leadgenId,
            error instanceof Error ? error.message : "error",
          );
          results.push({ externalLeadId: leadgenId, ok: false });
        }
      }

      return NextResponse.json({ ok: true, processed: results.length, results });
    }

    // Smoke / dev: body plano con externalLeadId (requiere firma válida).
    if (!signatureOk) {
      return NextResponse.json({ ok: false, error: "Firma inválida." }, { status: 403 });
    }

    const smoke = parseSmokeBody(parsed);
    if (!smoke) {
      // Webhook de prueba sin leadgen: aceptar 200.
      return NextResponse.json({ ok: true, processed: 0 });
    }

    const result = await processMetaLead(smoke);
    return NextResponse.json({
      ok: true,
      processed: 1,
      deduped: result.deduped,
      clientId: result.clientId,
      opportunityId: result.opportunityId,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
