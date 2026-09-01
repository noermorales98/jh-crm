export function GET() {
  // Sin secretos ni detalles de BD: solo un latido.
  return Response.json({ ok: true });
}
