import { NextResponse } from "next/server";
import { ajustes, ErrorBase, guardarAccion, promos, type Promo } from "@/lib/db";
import { alcanceEstimado, buscarIntereses, crearEnPausa, diagnostico, detener, encender, ErrorMeta, hayMeta, historias, permisos, postsRecientes, PUBLICO_TEXTO, resultados, type Publico } from "@/lib/meta";
import { hayIA, jsonIA } from "@/lib/ia";
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
    const que = new URL(req.url).searchParams.get("que");
    if (que === "posts") return NextResponse.json({ posts: await postsRecientes() });
    if (que === "historias") return NextResponse.json({ posts: await historias() });
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

    if (b.accion === "diagnostico") {
      // Nunca enciende nada: solo pregunta a Meta y arma/borra una prueba en pausa.
      return NextResponse.json(await diagnostico());
    }

    if (b.accion === "permisos") return NextResponse.json({ permisos: await permisos() });

    if (b.accion === "segmentar") {
      // La IA mira la foto y el texto del post y propone a quién mostrárselo; los intereses son reales de Meta.
      if (!hayIA()) return NextResponse.json({ publico: null });
      const lista = b.que === "story" ? await historias() : await postsRecientes();
      const post = lista.find((x) => x.id === String(b.mediaId ?? ""));
      if (!post) return no("No encontré ese post.", 404);
      const ia = await jsonIA<{ texto: string; edad_min: number; edad_max: number; intereses: string[] }>({
        instrucciones: "Sos experta en anuncios de Instagram para marcas pequeñas de ropa de mujer en Costa Rica. Proponé a quién mostrarle este anuncio para que le escriban por mensaje y compren. Sé concreta y realista: el presupuesto es bajo.",
        pedido: `Marca: Eucalipto Chic, ropa de diseño costarricense para mujer, cómoda y elegante, de precio medio. Texto del post: «${post.caption.slice(0, 600) || "(sin texto)"}». Devolvé: texto (una frase sencilla en español de Costa Rica para Andrea, que no es técnica, explicando a quién se le va a mostrar y por qué), edad_min y edad_max (entre 18 y 65), e intereses (3 a 6 palabras de intereses de Meta en español, como 'Moda', 'Ropa de mujer', 'Compras', 'Diseño de modas', 'Boutique').`,
        esquema: { type: "object", additionalProperties: false, required: ["texto", "edad_min", "edad_max", "intereses"], properties: {
          texto: { type: "string" }, edad_min: { type: "integer" }, edad_max: { type: "integer" }, intereses: { type: "array", items: { type: "string" } },
        } },
        imagen: post.miniatura,
      });
      const encontrados = (await Promise.all(ia.intereses.slice(0, 6).map((t) => buscarIntereses(t).then((r) => r[0]).catch(() => undefined))))
        .filter((x): x is NonNullable<typeof x> => !!x);
      const intereses = [...new Map(encontrados.map((i) => [i.id, { id: i.id, name: i.name }])).values()];
      const publico: Publico = { texto: ia.texto, edad_min: Math.max(18, Math.min(65, ia.edad_min)), edad_max: Math.max(18, Math.min(65, ia.edad_max)), intereses };
      return NextResponse.json({ publico });
    }

    if (b.accion === "caption") {
      if (!hayIA()) return no("El texto con IA se activa con OpenAI.", 501);
      const ia = await jsonIA<{ caption: string }>({
        instrucciones: "Escribís los textos de Instagram de Eucalipto Chic, marca de ropa de mujer de Costa Rica (diseño nacional, cómoda y elegante). Voz cálida, cercana y elegante, español de Costa Rica con voseo, sin exagerar. Máximo 3 frases cortas, 1 o 2 emojis discretos como mucho, termina invitando a escribir por mensaje directo, y 3 a 5 hashtags relevantes al final.",
        pedido: `Escribí el texto para un ${b.que === "story" ? "story" : "post"}. Idea de Andrea: «${String(b.idea ?? "").slice(0, 400) || "presentar la prenda"}». ${b.pieza ? `Prenda: ${String(b.pieza).slice(0, 200)}.` : ""}`,
        esquema: { type: "object", additionalProperties: false, required: ["caption"], properties: { caption: { type: "string" } } },
        imagen: typeof b.imagen === "string" && /^https:\/\//.test(b.imagen) ? b.imagen : undefined,
      });
      return NextResponse.json({ caption: ia.caption.slice(0, 2000) });
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

      const que = b.que === "story" ? "story" : "post";
      const post = (que === "story" ? await historias() : await postsRecientes()).find((x) => x.id === String(b.mediaId ?? ""));
      if (!post) return no(que === "story" ? "Esa historia ya no está en vivo (duran 24 horas). Escogé otra." : "No encontré ese post en el Instagram de la marca.", 400);
      const publico = leerPublico(b.publico);

      const empieza = inicio === hoy ? new Date(Date.now() + 5 * 60e3) : new Date(`${inicio}T06:00:00-06:00`);
      const termina = new Date(`${sumarDias(inicio, dias - 1)}T23:59:00-06:00`);
      const fila = await promos.crear({
        id, media_id: post.id, permalink: post.permalink, caption: post.caption.slice(0, 300), miniatura: post.miniatura,
        por_dia: porDia, dias, total, inicio: empieza.toISOString(), fin: termina.toISOString(), estado: "creando",
      });
      if (!fila) return NextResponse.json({ ok: true, repetida: true, ...(await estado()) });

      const nombre = `Panel · ${post.caption.split("\n")[0].slice(0, 40) || "Post"} · ${inicio}`;
      try {
        const ids = await crearEnPausa({ nombre, mediaId: post.id, inicio: empieza, fin: termina, total, publico, que });
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

/** Solo pasa un público con edades razonables e intereses con id numérico de Meta. */
function leerPublico(v: unknown): Publico | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const min = Number(o.edad_min), max = Number(o.edad_max);
  if (!(min >= 18 && min <= 65 && max >= min && max <= 65)) return null;
  const intereses = (Array.isArray(o.intereses) ? o.intereses : []).slice(0, 10).flatMap((i) => {
    const x = (i ?? {}) as Record<string, unknown>;
    return /^\d{5,20}$/.test(String(x.id)) && typeof x.name === "string" ? [{ id: String(x.id), name: x.name.slice(0, 80) }] : [];
  });
  return { texto: String(o.texto ?? "").slice(0, 300), edad_min: Math.round(min), edad_max: Math.round(max), intereses };
}
