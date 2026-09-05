/**
 * Webhook Meta Lead Ads — retirado del producto.
 * Responde 410; el CRM no usa origen de leads de Meta.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Meta Lead Ads no está disponible en este CRM." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Meta Lead Ads no está disponible en este CRM." },
    { status: 410 },
  );
}
