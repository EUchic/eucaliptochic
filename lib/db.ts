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

// Igual que supabase-js: la llave va en apikey y en Authorization (Supabase la traduce a su token interno).
const cabeceras = (llave: string, tipo = "application/json"): Record<string, string> =>
  ({ apikey: llave, authorization: `Bearer ${llave}`, "content-type": tipo, accept: "application/json" });

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
  slug: string; nombre: string; tipo: string; precio: number; nuevo: boolean; orden: number; coleccion: string | null; url_vieja?: string | null;
  variantes: { sku: string | null; talla: string; color: string | null }[]; fotos: string[];
};
export const catalogoBase = () => rpc<FilaCatalogo[]>("catalogo_publico", {}, { next: { revalidate: 300, tags: ["catalogo"] } });

/** Próximas ferias para la página (máximo 6). Se cachea con la etiqueta "ferias". */
export type FeriaPublica = { nombre: string; fecha: string; lugar: string | null; direccion: string | null; lat: number | null; lng: number | null; foto: string | null };
export const feriasPublicas = () => rpc<FeriaPublica[]>("ferias_publicas", {}, { next: { revalidate: 300, tags: ["ferias"] } });

type EstadoCrudo = {
  piezas: (Pieza & { foto: string | null; lista?: { id: string; url: string }[] })[];
  colecciones: string[];
  ferias: { id: string; nombre: string; fecha: string; lugar: string | null; direccion?: string | null; lat?: number | null; lng?: number | null; foto?: string | null }[];
  movs: (Mov & { feria: string | null })[];
  fotos: Record<string, string>;
  categorias?: Datos["categorias"];
  aprendido?: Datos["aprendido"];
  personas?: Datos["personas"];
  memoria?: Datos["memoria"];
  ajustes?: Datos["ajustes"];
};

/** Todo lo que el panel necesita para pintarse, ya en el formato del panel. */
export async function estadoPanel(): Promise<{ piezas: Pieza[]; colecciones: string[]; datos: Datos }> {
  const e = await rpc<EstadoCrudo>("estado_panel", {}, { secreta: true });
  return {
    piezas: e.piezas.map((p) => ({
      ...p, precio: Number(p.precio), foto: p.foto ? img(p.foto, 300) : "", fotos: Number(p.fotos),
      lista: (p.lista ?? []).map((f) => ({ id: f.id, url: img(f.url, 300) })),
      propuesta: p.propuesta ? { id: p.propuesta.id, url: img(p.propuesta.url, 800), grande: img(p.propuesta.url, 1600) } : null,
      tallas: p.tallas ?? [], descripcion: p.descripcion ?? null,
    })),
    colecciones: e.colecciones,
    datos: {
      ...VACIO,
      colecciones: e.colecciones,
      ferias: e.ferias.map((f) => ({
        id: f.id, nombre: f.nombre, fecha: f.fecha, lugar: f.lugar ?? undefined, direccion: f.direccion ?? undefined,
        lat: f.lat ?? undefined, lng: f.lng ?? undefined, foto: f.foto ? img(f.foto, 800) : undefined,
      })),
      movs: e.movs.map((m) => ({ ...m, monto: Number(m.monto), crc: Number(m.crc), feria: m.feria ?? undefined })),
      fotos: e.fotos,
      categorias: e.categorias ?? [],
      aprendido: e.aprendido ?? [],
      personas: e.personas ?? [],
      memoria: e.memoria ?? [],
      ajustes: e.ajustes ?? {},
    },
  };
}

/** Guarda una acción ya validada. La base ignora la misma acción si llega dos veces (mismo id). */
export const guardarAccion = (
  a: (Accion & { crc?: number; tipoCambio?: number }) | { id: string; tipo: "foto_nueva" | "foto_propuesta"; slug: string; url: string } | { id: string; tipo: "feria_foto"; feria: string; url: string },
) =>
  rpc<{ ok: boolean; repetida?: boolean }>("aplicar_accion", { a }, { secreta: true });

/** Sube una foto al bucket público "fotos" y devuelve su URL pública. Si ya existe (reintento), la reutiliza. */
export async function subirFoto(ruta: string, datos: ArrayBuffer, tipo: string): Promise<string> {
  const r = await fetch(`${URL_BASE}/storage/v1/object/fotos/${ruta}`, {
    method: "POST",
    headers: { ...cabeceras(SECRETA, tipo), "cache-control": "max-age=31536000", "x-upsert": "false" },
    body: datos,
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok && r.status !== 409) {
    const j = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
    if (!/exist|Duplicate/i.test(j?.message ?? j?.error ?? "")) throw new ErrorBase(j?.message || `Storage respondió ${r.status}`);
  }
  return `${URL_BASE}/storage/v1/object/public/fotos/${ruta}`;
}

// Mudanza de las fotos viejas de Squarespace a Storage (una sola vez, desde /admin/mantenimiento).
export const fotosEnSquarespace = (lim: number) =>
  rpc<{ id: string; url: string; slug: string }[]>("fotos_en_squarespace", { lim }, { secreta: true });
export const fotoMudada = (id: string, url: string) => rpc<number>("foto_mudada", { p_id: id, p_url: url }, { secreta: true });
export const fotosPorMudar = () => rpc<number>("fotos_por_mudar", {}, { secreta: true });

// Tablas que solo usa el servidor (con la llave secreta): promociones de Meta y ajustes.
async function rest<T>(ruta: string, o: { metodo?: string; cuerpo?: unknown; prefer?: string } = {}): Promise<T> {
  if (!SECRETA) throw new ErrorBase("Falta la llave de la base de datos.");
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    method: o.metodo ?? "GET",
    headers: { ...cabeceras(SECRETA), ...(o.prefer ? { prefer: o.prefer } : {}) },
    body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    throw new ErrorBase(j?.message || `La base respondió ${r.status}`);
  }
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

export type Promo = {
  id: string; media_id: string; permalink: string | null; caption: string | null; miniatura: string | null;
  por_dia: number; dias: number; total: number; inicio: string; fin: string;
  campaign_id: string | null; adset_id: string | null; ad_id: string | null;
  estado: "creando" | "activa" | "detenida" | "terminada" | "error"; error: string | null;
  gastado: number; gasto_registrado: boolean; creado: string;
};

export const promos = {
  listar: () => rest<Promo[]>("promociones?select=*&order=creado.desc&limit=30"),
  uno: async (id: string) => (await rest<Promo[]>(`promociones?id=eq.${encodeURIComponent(id)}&select=*`))[0] ?? null,
  /** Crea la fila; si ese id ya existía (doble toque) no hace nada y devuelve null. */
  crear: async (p: Partial<Promo>) =>
    (await rest<Promo[]>("promociones?on_conflict=id", { metodo: "POST", cuerpo: p, prefer: "resolution=ignore-duplicates,return=representation" }))[0] ?? null,
  cambiar: (id: string, campos: Partial<Promo>) =>
    rest<Promo[]>(`promociones?id=eq.${encodeURIComponent(id)}`, { metodo: "PATCH", cuerpo: campos, prefer: "return=minimal" }),
};

export const ajustes = {
  leer: async <T>(clave: string) =>
    ((await rest<{ valor: T }[]>(`ajustes?clave=eq.${encodeURIComponent(clave)}&select=valor`))[0]?.valor ?? null) as T | null,
  guardar: (clave: string, valor: unknown) =>
    rest("ajustes?on_conflict=clave", { metodo: "POST", cuerpo: { clave, valor, actualizado: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal" }),
};

/** Categorías que Andrea agregó (para validar lo que llega del panel). */
/** Una pieza con sus fotos (las aprobadas/originales, de primera la portada), para hacerle foto de producto. */
export async function piezaConFotos(slug: string) {
  const [p] = await rest<{ id: string; slug: string; nombre: string; tipo: string; descripcion: string | null }[]>(`piezas?select=id,slug,nombre,tipo,descripcion&slug=eq.${encodeURIComponent(slug)}&limit=1`);
  if (!p) return null;
  const fotos = await rest<{ url: string; estado: string }[]>(`fotos?select=url,estado&pieza_id=eq.${p.id}&estado=neq.propuesta&order=orden.asc,creado.asc&limit=4`);
  return { ...p, fotos: fotos.map((f) => f.url) };
}

export const categoriasPropias = () => rest<{ nombre: string; sentido: "ingreso" | "gasto" }[]>("categorias?select=nombre,sentido").catch(() => []);

/** Guarda un aviso de un proveedor de pagos tal como llegó (si ya estaba, no lo repite). */
export const guardarEvento = (proveedor: string, evento_id: string, cuerpo: unknown) =>
  rest<null>("webhook_eventos", { metodo: "POST", cuerpo: { proveedor, evento_id, cuerpo }, prefer: "resolution=ignore-duplicates,return=minimal" });
