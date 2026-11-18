import { NextResponse } from "next/server";
import { buscarLugares } from "@/lib/lugares";
import { no, permitido } from "@/lib/panel";

// Buscador de lugares del panel (pestaña Ferias). Solo con sesión del panel.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 600) return no("Escribí el nombre del lugar o pegá el link del mapa.", 400);
  try {
    return NextResponse.json({ lugares: await buscarLugares(q) });
  } catch (e) {
    const m = e instanceof Error && /Google Maps ni de Waze/.test(e.message) ? e.message : "No pude buscar ahora. Probá de nuevo en un momento.";
    console.error("[lugares]", e instanceof Error ? e.message : e);
    return no(m, 502);
  }
}
