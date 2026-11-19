import { NextResponse } from "next/server";
import { URL_BASE, ajustes, subirFoto } from "@/lib/db";
import { hayIA, jsonIA } from "@/lib/ia";
import { no, permitido } from "@/lib/panel";

// Diseñador de posts: la IA escribe los textos y escoge el encuadre; también guarda los logos de las
// organizadoras de ferias para no tener que subirlos otra vez, y trae fotos de la tienda para dibujarlas.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Logo = { id: string; nombre: string; url: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DE_LA_TIENDA = `${URL_BASE}/storage/v1/object/public/fotos/`;

const ESQUEMA = {
  type: "object", additionalProperties: false,
  required: ["etiqueta", "titular", "bajada", "detalles", "llamado", "caption", "plantilla", "foco"],
  properties: {
    etiqueta: { type: "string", description: "1 a 3 palabras arriba del titular, ej.: «Feria», «Colección nueva», «Nuevo»" },
    titular: { type: "string", description: "El mensaje principal, corto y con gancho, máximo 5 palabras" },
    bajada: { type: "string", description: "Una frase corta que complementa, máximo 12 palabras; puede ir vacía" },
    detalles: { type: "array", items: { type: "string" }, description: "0 a 3 datos concretos (fecha, hora, lugar, precio) tal como te los di" },
    llamado: { type: "string", description: "Invitación corta, máximo 4 palabras, ej.: «¡Te esperamos!»; puede ir vacía" },
    caption: { type: "string", description: "Texto para Instagram: 2 a 4 frases cálidas en español de Costa Rica con voseo, con los datos y 3 a 6 hashtags al final" },
    plantilla: { type: "string", enum: ["ventana", "etiqueta", "marco"], description: "ventana si la foto es protagonista y tiene espacio abajo; marco si la foto tiene mucho detalle; etiqueta para anuncios con varios datos" },
    foco: {
      type: "object", additionalProperties: false, required: ["x", "y"],
      properties: { x: { type: "number", description: "0 a 1, dónde está lo importante horizontalmente" }, y: { type: "number", description: "0 a 1, dónde está lo importante verticalmente (cara y prenda)" } },
    },
  },
};

export async function GET(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  // Trae una foto de la tienda para dibujarla en el teléfono sin problemas de permisos del navegador.
  const url = new URL(req.url).searchParams.get("foto") ?? "";
  if (!url.startsWith(DE_LA_TIENDA) || !/^[A-Za-z0-9/_.-]+$/.test(url.slice(DE_LA_TIENDA.length))) return no("Esa foto no es de la tienda.", 400);
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r?.ok) return no("No pude traer la foto.", 502);
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") ?? "image/webp", "cache-control": "private, max-age=3600" } });
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;

  // Logo de una organizadora (PNG con transparencia): se guarda para la próxima vez.
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const f = await req.formData().catch(() => null);
    const logo = f?.get("logo");
    const id = String(f?.get("id") ?? "").toLowerCase();
    const nombre = String(f?.get("nombre") ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60) || "Organizadora";
    if (!(logo instanceof Blob) || !UUID.test(id)) return no("No llegó el logo.", 400);
    if (logo.size > 2 * 1024 * 1024) return no("El logo es muy pesado.", 413);
    const datos = await logo.arrayBuffer();
    const b = new Uint8Array(datos, 0, 8);
    if (!(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)) return no("El logo tiene que ser una imagen.", 415);
    try {
      const url = await subirFoto(`logos/${id}.png`, datos, "image/png");
      const lista = ((await ajustes.leer<Logo[]>("panel_logos")) ?? []).filter((l) => l.id !== id && l.nombre.toLowerCase() !== nombre.toLowerCase());
      const nuevo = { id, nombre, url };
      await ajustes.guardar("panel_logos", [nuevo, ...lista].slice(0, 30));
      return NextResponse.json({ ok: true, logo: nuevo });
    } catch (e) {
      console.error("[disenos/logo]", (e as Error).message);
      return no("No se pudo guardar el logo. Probá de nuevo.", 502);
    }
  }

  // Textos con IA
  const b = (await req.json().catch(() => null)) as { tipo?: string; datos?: string; imagen?: string; formato?: string } | null;
  const tipo = String(b?.tipo ?? "otro").slice(0, 20);
  const datos = String(b?.datos ?? "").replace(/[\u0000-\u0008]/g, "").slice(0, 1500);
  const imagen = typeof b?.imagen === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.imagen) && b.imagen.length < 600_000 ? b.imagen : undefined;
  if (!datos.trim()) return no("Contame de qué es el post.", 400);
  if (!hayIA()) return no("La IA no está conectada.", 501);
  try {
    const r = await jsonIA<Record<string, unknown>>({
      instrucciones: [
        "Sos la diseñadora y redactora de Eucalipto Chic, marca de ropa cómoda para mujer de Andrea Bermúdez en Costa Rica (tono cálido, elegante, cercano; voseo tico).",
        "Escribís los textos de un post de Instagram que se dibuja sobre la foto. Los textos de la imagen son MUY cortos y se leen de un vistazo.",
        "Usá solo los datos que te doy: no inventés fechas, horas, precios, descuentos ni lugares. Si un dato no está, no lo pongás.",
        "Mirá la foto para escoger la plantilla y el foco (dónde está la cara y la prenda), así el recorte no la corta.",
        "Nada de emojis en los textos de la imagen. En el caption podés usar uno o dos, con moderación.",
      ].join(" "),
      pedido: `Tipo de post: ${tipo}. Formato: ${b?.formato === "story" ? "historia (vertical)" : "post del feed"}.\nDatos:\n${datos}`,
      esquema: ESQUEMA, imagen, esfuerzo: "low", max: 1800,
    });
    const t = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
    const foco = (r.foco ?? {}) as { x?: number; y?: number };
    const n = (v: unknown, def: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : def);
    return NextResponse.json({
      etiqueta: t(r.etiqueta, 30), titular: t(r.titular, 60), bajada: t(r.bajada, 120), llamado: t(r.llamado, 40), caption: t(r.caption, 2200),
      detalles: (Array.isArray(r.detalles) ? r.detalles : []).slice(0, 3).map((x) => t(x, 60)).filter(Boolean),
      plantilla: ["ventana", "etiqueta", "marco"].includes(String(r.plantilla)) ? r.plantilla : "ventana",
      foco: { x: n(foco.x, 0.5), y: n(foco.y, 0.35) },
    });
  } catch (e) {
    console.error("[disenos]", (e as Error).message);
    return no("La IA no respondió. Probá de nuevo.", 502);
  }
}
