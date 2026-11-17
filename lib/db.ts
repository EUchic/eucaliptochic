import "server-only";
import { img } from "./catalog";
import { VACIO, type Accion, type Datos, type Feria, type Mov, type Pieza } from "./asistente";

// Conexión a la base de datos de Supabase (proyecto de Andrea), siempre desde el servidor.
// - Lectura pública del catálogo: con la llave publicable (es pública por diseño; solo puede llamar catalogo_publico()).
// - Panel: con la llave secreta SUPABASE_SECRET_KEY, que vive solo en Vercel. Las tablas no aceptan nada más.

const URL_BASE = (process.env.SUPABASE_URL || "https://bfeyxeabulbuxsgacnpv.supabase.co").replace(/\/$/, "");
const PUBLICA = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_myw_WA8jFAFt9RvFoPY6OQ_vFgvB8co";
const SECRETA = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const hayBase = () => Boolean(SECRETA);

function cabeceras(llave: string): HeadersInit {
  const h: Record<string, string> = { apikey: llave, "content-type": "application/json", accept: "application/json" };
  if (llave.startsWith("eyJ")) h.authorization = `Bearer ${llave}`; // llaves viejas (JWT)
  return h;
}

export class ErrorBase extends Error {}

async function rpc<T>(fn: string, args: object, opciones: { secreta?: boolean; cache?: RequestInit["cache"]; next?: NextFetchRequestConfig } = {}): Promise<T> {
  const llave = opciones.secreta ? SECRETA : PUBLICA;
  if (!llave) throw new ErrorBase("Falta la llave de la base de datos.");
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: cabeceras(llave),
    body: JSON.stringify(args),
    ...(opciones.next ? { next: opciones.next } : { cache: opciones.cache ?? "no-store" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    throw new ErrorBase(j?.message || `La base respondió ${r.status}`);
  }
  return (await r.json()) as T;
}

/** Catálogo publicado, tal como lo guarda la base. Se cachea con la etiqueta "catalogo". */
export type FilaCatalogo = {
  slug: string; nombre: string; tipo: string; precio: number; nuevo: boolean; orden: number; coleccion: string | null;
  variantes: { sku: string | null; talla: string; color: string | null }[]; fotos: string[];
};
export const catalogoBase = () => rpc<FilaCatalogo[]>("catalogo_publico", {}, { next: { revalidate: 300, tags: ["catalogo"] } });

type EstadoCrudo = {
  piezas: (Pieza & { foto: string | null })[];
  colecciones: string[];
  ferias: Feria[];
  movs: (Mov & { feria: string | null })[];
  fotos: Record<string, string>;
};

/** Todo lo que el panel necesita para pintarse, ya en el formato del panel. */
export async function estadoPanel(): Promise<{ piezas: Pieza[]; colecciones: string[]; datos: Datos }> {
  const e = await rpc<EstadoCrudo>("estado_panel", {}, { secreta: true });
  return {
    piezas: e.piezas.map((p) => ({ ...p, precio: Number(p.precio), foto: p.foto ? img(p.foto, 300) : "", fotos: Number(p.fotos) })),
    colecciones: e.colecciones,
    datos: {
      ...VACIO,
      colecciones: e.colecciones,
      ferias: e.ferias.map((f) => ({ ...f, lugar: f.lugar ?? undefined })),
      movs: e.movs.map((m) => ({ ...m, monto: Number(m.monto), crc: Number(m.crc), feria: m.feria ?? undefined })),
      fotos: e.fotos,
    },
  };
}

/** Guarda una acción ya validada. La base ignora la misma acción si llega dos veces (mismo id). */
export const guardarAccion = (a: Accion & { crc?: number; tipoCambio?: number }) =>
  rpc<{ ok: boolean; repetida?: boolean }>("aplicar_accion", { a }, { secreta: true });
