// Liveness check only. Must not expose secrets or integration configuration.
export function GET() {
  return Response.json({ ok: true });
}
