import { NextResponse } from "next/server";
import { ajustes, ErrorBase, guardarAccion, promos, type Promo } from "@/lib/db";
import { alcanceEstimado, crearEnPausa, detener, encender, ErrorMeta, hayMeta, postsRecientes, PUBLICO_TEXTO, resultados } from "@/lib/meta";
import { no, permitido } from "@/lib/panel";
import { idSeguro } from "@/lib/validar";

// Promociones de Instagram desde el panel.
// Reglas que no se negocian: nada se enciende sin "confirmo: true" que manda el botón de confirmación de Andrea,
// nunca se pasa del tope mensual que ella puso, y cada promoción tiene presupuesto TOTAL (Meta no gasta más).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IVA = 1.13;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIA = 864e5;
const hoyCR = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const sumarDias = (f: string, n: number) => new Date(Date.parse(f + "T12:00:00Z") + n * DIA).toISOString().slice(0, 10);
const conIva = (n: number) => Math.round(n * IVA);

/** Lo que este mes ya está gastado o comprometido (con IVA): lo gastado si ya terminó, el máximo si sigue corriendo. */
function comprometido(lista: Promo[]) {
  const mes = new Date(hoyCR().slice(0, 7) + "-01T00:00:00-06:00").getTime();
  return lista
    .filter((p) => Date.parse(p.creado) >= mes && p.estado !== "error")
    .reduce((s, p) => s + conIva(p.gasto_registrado || p.estado === "terminada" ? Number(p.gastado) : p.total), 0);
}

async function estado() {
  const tope = await ajustes.leer<number>("tope_mensual");
  const lista = await promos.listar();
  const ahora = Date.now();
  const vista = await Promise.all(lista.map(async (p) => {
    let alcance = 0, mensajes = 0;
    if (p.campaign_id && (p.estado === "activa" || p.estado === "detenida" || (p.estado === "terminada" && !p.gasto_registrado))) {
      try {
        const r = await resultados(p.campaign_id);
        alcance = r.alcance; mensajes = r.mensajes;
        const cambios: Partial<Promo> = {};
        if (r.gastado !== Number(p.gastado)) cambios.gastado = r.gastado;
        if (p.estado === "activa" && ahora > Date.parse(p.fin)) cambios.estado = "terminada";
        // Doce horas después del final, lo gastado (más el 13% de IVA que cobra el banco) entra solo en Plata.
        if (!p.gasto_registrado && ahora > Date.parse(p.fin) + 12 * 3600e3) {
          const monto = conIva(r.gastado);
          if (monto > 0) {
            await guardarAccion({
              id: idSeguro("gasto-promo-" + p.id), tipo: "movimiento", sentido: "gasto", moneda: "CRC", monto, crc: monto,
              categoria: "Publicidad", metodo: "Tarjeta", fecha: p.fin.slice(0, 10),
              concepto: `Promoción en Instagram: ${(p.caption ?? "post").slice(0, 60)} (incluye 13% de IVA)`,
            });
          }
          cambios.gasto_registrado = true;
        }
        if (Object.keys(cambios).length) { await promos.cambiar(p.id, cambios); Object.assign(p, cambios); }
      } catch (e) {
        console.error("[anuncios] resultados", p.id, (e as Error).message);
      }
    }
    return { ...p, alcance, mensajes };
  }));
  const usado = comprometido(vista);
  return { conectado: true, tope, usado, restante: tope === null ? null : Math.max(0, tope - usado), publico: PUBLICO_TEXTO, promos: vista };
}

export async function GET(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  if (!hayMeta()) return NextResponse.json({ conectado: false });
  try {
    if (new URL(req.url).searchParams.get("que") === "posts") return NextResponse.json({ posts: await postsRecientes() });
    return NextResponse.json(await estado());
  } catch (e) {
    return no(e instanceof ErrorMeta || e instanceof ErrorBase ? e.message : "No pude hablar con Meta.", 502);
  }
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  if (!hayMeta()) return no("Falta conectar Meta.", 503);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return no("No entendí.", 400); }

  try {
    if (b.accion === "tope") {
      const monto = Math.round(Number(b.monto));
      if (!Number.isFinite(monto) || monto < 0 || monto > 1_000_000) return no("Ese tope no se ve bien.", 400);
      await ajustes.guardar("tope_mensual", monto);
      return NextResponse.json(await estado());
    }

    if (b.accion === "estimar") {
      const porDia = Math.round(Number(b.porDia));
      if (!(porDia >= 500 && porDia <= 50_000)) return no("Ese monto no se ve bien.", 400);
      return NextResponse.json({ alcance: await alcanceEstimado(porDia) });
    }

    if (b.accion === "detener") {
      const p = await promos.uno(String(b.id ?? ""));
      if (!p || !p.campaign_id) return no("No encontré esa promoción.", 404);
      if (p.estado === "activa") { await detener(p.campaign_id); await promos.cambiar(p.id, { estado: "detenida" }); }
      return NextResponse.json(await estado());
    }

    if (b.accion === "promocionar") {
      if (b.confirmo !== true) return no("Falta tu confirmación. No se hizo nada.", 400);
      const id = String(b.id ?? "");
      const porDia = Math.round(Number(b.porDia));
      const dias = Math.round(Number(b.dias));
      const inicio = String(b.inicio ?? "");
      const hoy = hoyCR();
      if (!UUID.test(id)) return no("No entendí.", 400);
      if (!(porDia >= 1000 && porDia <= 20_000)) return no("El monto por día tiene que estar entre ₡1 000 y ₡20 000.", 400);
      if (!(dias >= 1 && dias <= 14)) return no("La promoción puede durar de 1 a 14 días.", 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || inicio < hoy || inicio > sumarDias(hoy, 60)) return no("La fecha de inicio no se ve bien.", 400);

      const ya = await promos.uno(id);
      if (ya) return NextResponse.json({ ok: true, repetida: true, ...(await estado()) });

      const tope = await ajustes.leer<number>("tope_mensual");
      if (tope === null) return no("Primero poné cuánto querés gastar como máximo al mes.", 409);
      const total = porDia * dias;
      const usado = comprometido(await promos.listar());
      if (usado + conIva(total) > tope) {
        return no(`Con esta promoción te pasarías de tu tope del mes (₡${tope.toLocaleString("es-CR")}). Te quedan ₡${Math.max(0, tope - usado).toLocaleString("es-CR")}. Probá con menos días o menos por día, o subí el tope.`, 409);
      }

      const post = (await postsRecientes()).find((x) => x.id === String(b.mediaId ?? ""));
      if (!post) return no("No encontré ese post en el Instagram de la marca.", 400);

      const empieza = inicio === hoy ? new Date(Date.now() + 5 * 60e3) : new Date(`${inicio}T06:00:00-06:00`);
      const termina = new Date(`${sumarDias(inicio, dias - 1)}T23:59:00-06:00`);
      const fila = await promos.crear({
        id, media_id: post.id, permalink: post.permalink, caption: post.caption.slice(0, 300), miniatura: post.miniatura,
        por_dia: porDia, dias, total, inicio: empieza.toISOString(), fin: termina.toISOString(), estado: "creando",
      });
      if (!fila) return NextResponse.json({ ok: true, repetida: true, ...(await estado()) });

      const nombre = `Panel · ${post.caption.split("\n")[0].slice(0, 40) || "Post"} · ${inicio}`;
      try {
        const ids = await crearEnPausa({ nombre, mediaId: post.id, inicio: empieza, fin: termina, total });
        await promos.cambiar(id, { ...ids });
        try {
          await encender(ids);
        } catch (e) {
          await detener(ids.campaign_id).catch(() => {});
          throw e;
        }
        await promos.cambiar(id, { estado: "activa" });
      } catch (e) {
        const msg = (e as Error).message;
        console.error("[anuncios] crear", msg);
        await promos.cambiar(id, { estado: "error", error: msg.slice(0, 300) }).catch(() => {});
        return no(`Meta no aceptó la promoción, así que no se cobró nada. Detalle: ${msg}`, 502);
      }
      return NextResponse.json({ ok: true, ...(await estado()) });
    }

    return no("No entendí.", 400);
  } catch (e) {
    return no(e instanceof ErrorMeta || e instanceof ErrorBase ? e.message : "No pude hablar con Meta.", 502);
  }
}
