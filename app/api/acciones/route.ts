import { NextResponse } from "next/server";
import type { Accion } from "@/lib/asistente";
import { ErrorBase, estadoPanel, guardarAccion } from "@/lib/db";
import { tipoCambioHacienda } from "@/lib/hacienda";
import { no, permitido, refrescarTienda } from "@/lib/panel";
import { Invalida, tocaTienda, validar } from "@/lib/validar";

// Guarda lo que Andrea confirmó en el panel y refresca la tienda.
// Doble candado: el middleware y esta ruta revisan la sesión. Sin clave del panel no se guarda nada.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  try {
    return NextResponse.json(await estadoPanel());
  } catch (e) {
    return no((e as Error).message, 502);
  }
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;

  const crudo = await req.text();
  if (crudo.length > 30_000) return no("Demasiadas cosas a la vez.", 413);
  let lista: unknown[];
  try {
    const j = JSON.parse(crudo) as { acciones?: unknown };
    if (!Array.isArray(j.acciones) || !j.acciones.length || j.acciones.length > 12) throw 0;
    lista = j.acciones;
  } catch {
    return no("No entendí lo que había que guardar.", 400);
  }

  let acciones: Accion[];
  try {
    acciones = lista.map(validar);
  } catch (e) {
    return no(e instanceof Invalida ? e.message : "No entendí lo que había que guardar.", 400);
  }

  // Dólares a colones con el tipo de cambio de Hacienda del día (compra para lo que entra, venta para lo que sale).
  const usd = acciones.some((a) => a.tipo === "movimiento" && a.moneda === "USD");
  const tc = usd ? await tipoCambioHacienda() : null;
  if (usd && !tc) return no("Hacienda no respondió con el tipo de cambio. Decímelo en colones, o probá en un rato.", 503);

  const hechas: string[] = [];
  try {
    for (const a of acciones) {
      if (a.tipo === "movimiento") {
        const tipoCambio = a.moneda === "USD" ? (a.sentido === "ingreso" ? tc!.compra : tc!.venta) : undefined;
        await guardarAccion({ ...a, tipoCambio, crc: Math.round(a.monto * (tipoCambio ?? 1) * 100) / 100 });
      } else {
        await guardarAccion(a);
      }
      hechas.push(a.id);
    }
  } catch (e) {
    const msg = e instanceof ErrorBase ? e.message : "No se pudo guardar.";
    console.error("[acciones]", msg);
    if (hechas.length && acciones.some((a) => hechas.includes(a.id) && tocaTienda(a))) refrescarTienda();
    return NextResponse.json({ error: legible(msg), hechas }, { status: 502 });
  }

  if (acciones.some(tocaTienda)) refrescarTienda();
  try {
    return NextResponse.json({ ok: true, hechas, estado: await estadoPanel() });
  } catch {
    return NextResponse.json({ ok: true, hechas });
  }
}

function legible(msg: string) {
  if (/No encontré/.test(msg)) return msg.replace(/ [a-z0-9-]+$/, "") + ".";
  if (/check constraint|violates/.test(msg)) return "Algún dato no se ve bien. Probá decirlo de otra forma.";
  return "No se pudo guardar. Probá de nuevo en un momento.";
}
