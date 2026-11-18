import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { guardarAccion, guardarEvento } from "@/lib/db";
import { tipoCambioHacienda } from "@/lib/hacienda";
import { refrescarTienda } from "@/lib/panel";
import { idSeguro } from "@/lib/validar";

// ONVO avisa aquí cada vez que entra un pago. Si el aviso viene firmado por ONVO (X-Onvo-Signature),
// el pago se anota solo en Plata como ingreso "Venta web" por ONVO. El mismo pago nunca se anota dos veces.
// Variables en Vercel: ONVO_WEBHOOK_SECRET (whsec_…, obligatoria) y ONVO_SECRET_KEY (para consultar el pago si hace falta).

export const dynamic = "force-dynamic";

/** Firma de ONVO: t=<unix>,v1=<hex HMAC-SHA256 de "t.cuerpo">; máximo 5 minutos de diferencia. */
function firmaValida(cuerpo: Buffer, cabecera: string, secreto: string) {
  let t = NaN;
  const firmas: string[] = [];
  for (const parte of cabecera.split(",")) {
    const [k, v = ""] = parte.trim().split("=");
    if (k === "t") t = Number(v);
    if (k === "v1") firmas.push(v);
  }
  if (!Number.isInteger(t) || Math.abs(Math.floor(Date.now() / 1000) - t) > 300) return false;
  const esperada = createHmac("sha256", secreto).update(`${t}.`).update(cuerpo).digest();
  return firmas.some((h) => /^[0-9a-f]{64}$/i.test(h) && timingSafeEqual(Buffer.from(h, "hex"), esperada));
}

type Intento = { id?: string; amount?: number; currency?: string; description?: string | null; createdAt?: string; status?: string };

async function consultar(id: string): Promise<Intento | null> {
  const llave = process.env.ONVO_SECRET_KEY;
  if (!llave) return null;
  try {
    const r = await fetch(`${process.env.ONVO_API_URL || "https://api.onvopay.com/v1"}/payment-intents/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${llave}` }, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    return r.ok ? ((await r.json()) as Intento) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const secreto = process.env.ONVO_WEBHOOK_SECRET;
  if (!secreto) return NextResponse.json({ error: "Falta ONVO_WEBHOOK_SECRET" }, { status: 503 });
  const cuerpo = Buffer.from(await req.arrayBuffer());
  if (cuerpo.length > 1024 * 1024) return NextResponse.json({ error: "muy grande" }, { status: 413 });
  if (!firmaValida(cuerpo, req.headers.get("x-onvo-signature") ?? "", secreto)) return NextResponse.json({ error: "firma inválida" }, { status: 401 });

  let ev: { id?: string; type?: string; mode?: string; data?: { object?: Intento } & Intento };
  try { ev = JSON.parse(cuerpo.toString("utf8")); } catch { return NextResponse.json({ error: "json" }, { status: 400 }); }
  const tipo = String(ev.type ?? "").replace(/_/g, "-");
  const eventoId = ev.id || createHash("sha256").update(cuerpo).digest("hex").slice(0, 40);

  try {
    await guardarEvento("onvo", eventoId, ev).catch((e) => console.error("[onvo] no se guardó el aviso:", e instanceof Error ? e.message : e));
    if (tipo !== "payment-intent.succeeded") return NextResponse.json({ ok: true, ignorado: tipo });
    if (ev.mode === "test") return NextResponse.json({ ok: true, ignorado: "modo de prueba" });

    let pi: Intento = ev.data?.object ?? ev.data ?? {};
    if (pi.id && !(Number(pi.amount) > 0)) pi = { ...pi, ...(await consultar(pi.id)) };
    const monto = Number(pi.amount) / 100; // ONVO manda montos en la unidad más chica (céntimos)
    if (!pi.id || !(monto > 0)) {
      console.error("[onvo] pago sin id o monto", eventoId);
      return NextResponse.json({ ok: true, ignorado: "sin monto" });
    }
    const moneda = String(pi.currency ?? "CRC").toUpperCase() === "USD" ? "USD" : "CRC";
    let tipoCambio: number | undefined;
    if (moneda === "USD") {
      const tc = await tipoCambioHacienda();
      if (!tc) return NextResponse.json({ error: "sin tipo de cambio" }, { status: 503 }); // ONVO reintenta
      tipoCambio = tc.compra;
    }
    const fecha = new Date(Date.parse(pi.createdAt ?? "") || Date.now()).getTime() - 6 * 3600e3;
    await guardarAccion({
      id: idSeguro("onvo-" + pi.id), tipo: "movimiento", sentido: "ingreso", monto, moneda,
      categoria: "Venta web", metodo: "ONVO",
      concepto: (pi.description ? `Pago con ONVO: ${pi.description}` : "Pago con ONVO").slice(0, 300),
      fecha: new Date(fecha).toISOString().slice(0, 10),
      tipoCambio, crc: Math.round(monto * (tipoCambio ?? 1) * 100) / 100,
    });
    refrescarTienda();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[onvo]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "no se pudo anotar" }, { status: 500 }); // ONVO reintenta
  }
}
