import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/src/server/http";
import { getIntakeFormData, isIntakeEnabled, validateIntakeToken } from "@/src/server/intake";

/**
 * GET /api/public/intake/[token]
 * Valida el token y devuelve datos mínimos no sensibles del formulario.
 * Feature flag: FEATURE_PUBLIC_INTAKE=true, si no → 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isIntakeEnabled()) {
    return NextResponse.json({ ok: false, error: "No encontrado." }, { status: 404 });
  }
  try {
    const { token } = await params;
    const link = await validateIntakeToken(token);
    const data = await getIntakeFormData(link);
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
