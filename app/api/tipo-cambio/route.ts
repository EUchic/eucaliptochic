import { NextResponse } from "next/server";

export const revalidate = 3600;

/** Tipo de cambio oficial del dólar, de la API pública del Ministerio de Hacienda. */
export async function GET() {
  try {
    const r = await fetch("https://api.hacienda.go.cr/indicadores/tc/dolar", { next: { revalidate: 3600 } });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { venta?: { fecha: string; valor: number }; compra?: { fecha: string; valor: number } };
    if (!j.venta?.valor || !j.compra?.valor) throw new Error("formato");
    return NextResponse.json({ compra: j.compra.valor, venta: j.venta.valor, fecha: j.venta.fecha });
  } catch {
    return NextResponse.json({ error: "Hacienda no respondió." }, { status: 503 });
  }
}
