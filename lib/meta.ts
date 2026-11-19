import "server-only";
import { createHmac } from "node:crypto";

// Conexión con Meta (Instagram y Facebook) para las promociones del panel.
// La llave (META_ACCESS_TOKEN) es de un usuario de sistema del negocio "Eucalipto Chic" con acceso solo a su
// cuenta de anuncios, su página y su Instagram. Vive en Vercel; nunca llega al navegador.
// Todo se crea en PAUSA y solo se enciende después de que Andrea confirma en el panel.

const V = process.env.META_GRAPH_VERSION || "v25.0";
const BASE = (process.env.META_GRAPH_URL || "https://graph.facebook.com").replace(/\/$/, "");
const TOKEN = process.env.META_ACCESS_TOKEN || "";
const SECRETO_APP = process.env.META_APP_SECRET || "";

export const META = {
  cuenta: process.env.META_AD_ACCOUNT_ID || "1526368135998369",
  pagina: process.env.META_PAGE_ID || "102722891601241",
  instagram: process.env.META_IG_ACCOUNT_ID || "17841442915340332",
};
export const hayMeta = () => Boolean(TOKEN);

/** Público por defecto: mujeres de 25 a 60 en Costa Rica, y Meta amplía sola hacia quien tenga más chance de escribir. */
export const PUBLICO = {
  geo_locations: { countries: ["CR"] },
  // Con el público Advantage+ de Meta, la edad máxima va como sugerencia (age_range), no como límite.
  age_min: 25,
  age_max: 65,
  age_range: [25, 60],
  genders: [2],
  targeting_automation: { advantage_audience: 1 },
  publisher_platforms: ["instagram"],
  instagram_positions: ["stream", "story", "reels"],
};
export const PUBLICO_TEXTO = "Mujeres en Costa Rica, sobre todo de 25 a 60 años. Meta además busca sola a quienes tienen más chance de escribirte.";

export class ErrorMeta extends Error {
  constructor(mensaje: string, public codigo?: number) { super(mensaje); }
}

type Datos = Record<string, unknown>;

async function graph<T>(ruta: string, metodo: "GET" | "POST" | "DELETE" = "GET", datos: Datos = {}): Promise<T> {
  if (!TOKEN) throw new ErrorMeta("Falta conectar Meta (META_ACCESS_TOKEN en Vercel).");
  const url = new URL(`${BASE}/${V}/${ruta}`);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(datos)) if (v !== undefined) params.set(k, typeof v === "string" ? v : JSON.stringify(v));
  if (SECRETO_APP) params.set("appsecret_proof", createHmac("sha256", SECRETO_APP).update(TOKEN).digest("hex"));
  if (metodo === "GET") params.forEach((v, k) => url.searchParams.set(k, v));
  const r = await fetch(url, {
    method: metodo,
    headers: { authorization: `Bearer ${TOKEN}`, ...(metodo === "GET" ? {} : { "content-type": "application/x-www-form-urlencoded" }) },
    body: metodo === "GET" ? undefined : params,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; error_user_msg?: string; code?: number } } & T;
  if (!r.ok || j.error) throw new ErrorMeta(j.error?.error_user_msg || j.error?.message || `Meta respondió ${r.status}`, j.error?.code);
  return j;
}

export type Post = { id: string; caption: string; tipo: string; miniatura: string; permalink: string; fecha: string; story?: boolean };
export type Interes = { id: string; name: string };
export type Publico = { texto: string; edad_min: number; edad_max: number; intereses: Interes[] };

/** Público de una promoción: lo que propuso la IA (como sugerencia para Meta) y el lugar donde se ve. */
export function segmentacion(publico: Publico | null, que: "post" | "story") {
  const base = { ...PUBLICO, instagram_positions: que === "story" ? ["story"] : PUBLICO.instagram_positions };
  if (!publico) return base;
  const min = Math.max(18, Math.min(65, Math.round(publico.edad_min)));
  const max = Math.max(min, Math.min(65, Math.round(publico.edad_max)));
  return {
    ...base,
    age_min: Math.min(25, min), age_max: 65, age_range: [min, max],
    ...(publico.intereses.length ? { flexible_spec: [{ interests: publico.intereses.slice(0, 10).map((i) => ({ id: i.id, name: i.name })) }] } : {}),
  };
}

/** Intereses reales de Meta para una palabra ("moda", "boutiques"…). */
export async function buscarIntereses(termino: string): Promise<(Interes & { audiencia?: number })[]> {
  const j = await graph<{ data: { id: string; name: string; audience_size_upper_bound?: number }[] }>("search", "GET", { type: "adinterest", q: termino, limit: "3", locale: "es_LA" });
  return (j.data ?? []).map((i) => ({ id: String(i.id), name: i.name, audiencia: i.audience_size_upper_bound }));
}

/** Historias que están en vivo ahora (duran 24 horas). Solo esas se pueden promocionar. */
export async function historias(): Promise<Post[]> {
  const j = await graph<{ data: { id: string; caption?: string; media_type: string; thumbnail_url?: string; media_url?: string; permalink: string; timestamp: string }[] }>(
    `${META.instagram}/stories`, "GET", { fields: "id,caption,media_type,thumbnail_url,media_url,permalink,timestamp" },
  );
  return (j.data ?? []).map((m) => ({
    id: m.id, caption: (m.caption ?? "").trim(), tipo: m.media_type === "VIDEO" ? "Historia en video" : "Historia",
    miniatura: m.thumbnail_url || m.media_url || "", permalink: m.permalink, fecha: m.timestamp, story: true,
  })).filter((m) => m.miniatura);
}

/** Borra una historia (o post) del Instagram de la marca. Solo se llama con la confirmación de Andrea. */
export async function borrarMedia(id: string) {
  try { await graph(id, "DELETE"); }
  catch (e) { console.error("[instagram] borrar:", (e as ErrorMeta).codigo, (e as Error).message); throw e; }
}

export type Cuenta = { username: string; nombre?: string; foto?: string; seguidores?: number; fuente: "exacta" | "conocida" };

/** Busca una cuenta de Instagram por su usuario exacto (solo cuentas de empresa o creadoras; Instagram no deja buscar por pedazos). */
export async function buscarCuenta(usuario: string): Promise<Cuenta | null> {
  const u = usuario.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(u)) return null;
  try {
    const j = await graph<{ business_discovery?: { username: string; name?: string; profile_picture_url?: string; followers_count?: number } }>(
      META.instagram, "GET", { fields: `business_discovery.username(${u}){username,name,profile_picture_url,followers_count}` });
    const b = j.business_discovery;
    return b ? { username: b.username, nombre: b.name, foto: b.profile_picture_url, seguidores: b.followers_count, fuente: "exacta" } : null;
  } catch (e) { console.error("[instagram] buscar cuenta:", (e as ErrorMeta).codigo, (e as Error).message); return null; }
}

/** Cuentas que ya tienen que ver con Eucalipto: quienes comentan sus posts y quienes la etiquetan (si Meta da permiso). */
let conocidasGuardadas: { lista: string[]; cuando: number } | null = null;
export async function cuentasConocidas(): Promise<string[]> {
  if (conocidasGuardadas && Date.now() - conocidasGuardadas.cuando < 30 * 60e3) return conocidasGuardadas.lista;
  const nombres = new Set<string>();
  const menciones = (t?: string) => { for (const m of (t ?? "").matchAll(/@([A-Za-z0-9._]{1,30})/g)) nombres.add(m[1].replace(/\.+$/, "").toLowerCase()); };
  // Las cuentas que ella misma ha mencionado (@) en sus posts e historias.
  try {
    const j = await graph<{ data: { caption?: string }[] }>(`${META.instagram}/media`, "GET", { fields: "caption", limit: "100" });
    for (const m of j.data ?? []) menciones(m.caption);
  } catch {}
  try { for (const h of (await graph<{ data: { caption?: string }[] }>(`${META.instagram}/stories`, "GET", { fields: "caption" })).data ?? []) menciones(h.caption); } catch {}
  try {
    const j = await graph<{ data: { comments?: { data: { username?: string }[] } }[] }>(`${META.instagram}/media`, "GET", { fields: "comments.limit(50){username}", limit: "25" });
    for (const m of j.data ?? []) for (const c of m.comments?.data ?? []) if (c.username) nombres.add(c.username.toLowerCase());
  } catch {}
  try {
    const j = await graph<{ data: { username?: string }[] }>(`${META.instagram}/tags`, "GET", { fields: "username", limit: "50" });
    for (const t of j.data ?? []) if (t.username) nombres.add(t.username.toLowerCase());
  } catch {}
  nombres.delete("eucaliptochicr");
  const lista = [...nombres].filter((u) => /^[a-z0-9._]{1,30}$/.test(u)).slice(0, 300);
  conocidasGuardadas = { lista, cuando: Date.now() };
  return lista;
}

/** Publica una foto (JPEG con URL pública) en el feed o en historias. Solo se llama con la confirmación de Andrea. */
/** Paso 1 y 2: Instagram baja la foto y la prepara (todavía no se publica nada). */
/** Etiquetas: en los posts van en un punto de la foto; en las historias solo el usuario. */
function etiquetasDe(usuarios: string[] | undefined, que: "post" | "story") {
  const u = (usuarios ?? []).slice(0, 20);
  if (!u.length) return undefined;
  if (que === "story") return u.map((username) => ({ username }));
  // Repartidas en la parte de abajo de la foto, para que no tapen la cara.
  return u.map((username, i) => ({ username, x: Math.round((0.2 + (0.6 * (i % 4)) / 3) * 100) / 100, y: Math.round((0.72 + 0.08 * Math.floor(i / 4)) * 100) / 100 }));
}

async function preparar(p: { imagen: string; caption: string; que: "post" | "story"; etiquetas?: string[] }): Promise<string> {
  let contenedor: string;
  const user_tags = etiquetasDe(p.etiquetas, p.que);
  try {
    contenedor = (await graph<{ id: string }>(`${META.instagram}/media`, "POST",
      p.que === "story" ? { image_url: p.imagen, media_type: "STORIES", user_tags } : { image_url: p.imagen, caption: p.caption, user_tags })).id;
  } catch (e) { console.error("[instagram] preparar:", (e as ErrorMeta).codigo, (e as Error).message); throw e; }
  for (let i = 0; i < 20; i++) {
    const e = await graph<{ status_code?: string; status?: string }>(contenedor, "GET", { fields: "status_code,status" });
    if (e.status_code === "FINISHED") return contenedor;
    if (e.status_code === "ERROR" || e.status_code === "EXPIRED") {
      console.error("[instagram] procesar:", e.status_code, e.status);
      throw new ErrorMeta(`Instagram no pudo procesar esa foto${e.status ? ` (${e.status})` : ""}. Probá con otra.`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return contenedor;
}

/** Revisa que se pueda publicar sin publicar nada: prepara la foto en Instagram y la deja sin publicar (se descarta sola). */
export async function probarPublicar(imagen: string, etiquetas?: string[], que: "post" | "story" = "post") {
  await preparar({ imagen, caption: "", que, etiquetas });
  return true;
}

export async function publicar(p: { imagen: string; caption: string; que: "post" | "story"; etiquetas?: string[] }): Promise<{ id: string; permalink?: string }> {
  const contenedor = await preparar(p);
  let id: string;
  try { id = (await graph<{ id: string }>(`${META.instagram}/media_publish`, "POST", { creation_id: contenedor })).id; }
  catch (e) { console.error("[instagram] publicar:", (e as ErrorMeta).codigo, (e as Error).message); throw e; }
  const link = await graph<{ permalink?: string }>(id, "GET", { fields: "permalink" }).catch(() => ({ permalink: undefined }));
  return { id, permalink: link.permalink };
}

/** Qué puede hacer la conexión en cada página de Facebook (y su Instagram): para publicar hace falta CREATE_CONTENT. */
export async function accesos() {
  const j = await graph<{ data: { name: string; tasks?: string[]; instagram_business_account?: { id: string; username?: string } }[] }>(
    "me/accounts", "GET", { fields: "name,tasks,instagram_business_account{id,username}", limit: "50" });
  return (j.data ?? []).map((p) => ({ pagina: p.name, tareas: p.tasks ?? [], instagram: p.instagram_business_account?.username ?? null, esLaDeLaMarca: p.instagram_business_account?.id === META.instagram }));
}

/** Permisos que tiene la conexión con Meta (para saber si puede publicar). */
export async function permisos(): Promise<string[]> {
  const j = await graph<{ data: { permission: string; status: string }[] }>("me/permissions", "GET");
  return (j.data ?? []).filter((x) => x.status === "granted").map((x) => x.permission);
}

/** Últimos posts y reels del Instagram de la marca (las historias no se promocionan desde aquí). */
export async function postsRecientes(): Promise<Post[]> {
  const j = await graph<{ data: { id: string; caption?: string; media_type: string; media_product_type?: string; thumbnail_url?: string; media_url?: string; permalink: string; timestamp: string }[] }>(
    `${META.instagram}/media`, "GET",
    { fields: "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp", limit: "30" },
  );
  return j.data
    .filter((m) => m.media_product_type !== "STORY")
    .map((m) => ({
      id: m.id,
      caption: (m.caption ?? "").trim(),
      tipo: m.media_type === "VIDEO" ? "Video" : m.media_type === "CAROUSEL_ALBUM" ? "Varias fotos" : "Foto",
      miniatura: m.thumbnail_url || m.media_url || "",
      permalink: m.permalink,
      fecha: m.timestamp,
    }))
    .filter((m) => m.miniatura)
    .slice(0, 18);
}

/**
 * Cuánta gente le podría llegar por día con ese monto (estimación de Meta). Si Meta no la da, null y el panel
 * simplemente no muestra esa línea. (Nov 2026: Meta solo devuelve el tamaño del público, sin curva por monto.)
 */
export async function alcanceEstimado(porDia: number): Promise<{ min: number; max: number } | null> {
  try {
    const j = await graph<{ data: { daily_outcomes_curve?: { spend: number; reach: number }[] }[] }>(
      `act_${META.cuenta}/delivery_estimate`, "GET",
      { optimization_goal: "CONVERSATIONS", targeting_spec: PUBLICO, promoted_object: { page_id: META.pagina } },
    );
    const curva = j.data?.[0]?.daily_outcomes_curve ?? [];
    if (!curva.length) return null;
    const p = curva.reduce((a, b) => (Math.abs(b.spend - porDia) < Math.abs(a.spend - porDia) ? b : a));
    if (!p.reach || Math.abs(p.spend - porDia) > porDia * 0.5) return null;
    const r = (p.reach * porDia) / (p.spend || porDia);
    return { min: Math.round((r * 0.7) / 10) * 10, max: Math.round((r * 1.3) / 10) * 10 };
  } catch {
    return null;
  }
}

export type Ids = { campaign_id: string; adset_id: string; ad_id: string };

/**
 * Crea la promoción completa en PAUSA (campaña, conjunto con presupuesto TOTAL y fechas, anuncio con el post).
 * Con presupuesto total, Meta nunca gasta más que `total` colones. Si algo falla, borra lo que alcanzó a crear.
 */
export async function crearEnPausa(p: { nombre: string; mediaId: string; inicio: Date; fin: Date; total: number; publico?: Publico | null; que?: "post" | "story"; musica?: boolean }): Promise<Ids & { musica: boolean }> {
  const act = `act_${META.cuenta}`;
  let campana = "";
  try {
    campana = (await graph<{ id: string }>(`${act}/campaigns`, "POST", {
      name: p.nombre, objective: "OUTCOME_ENGAGEMENT", status: "PAUSED", buying_type: "AUCTION",
      special_ad_categories: [], is_adset_budget_sharing_enabled: false,
    })).id;
    const conjunto = (await graph<{ id: string }>(`${act}/adsets`, "POST", {
      name: p.nombre, campaign_id: campana, status: "PAUSED",
      lifetime_budget: Math.round(p.total),
      start_time: p.inicio.toISOString(), end_time: p.fin.toISOString(),
      billing_event: "IMPRESSIONS", optimization_goal: "CONVERSATIONS", destination_type: "INSTAGRAM_DIRECT",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP", promoted_object: { page_id: META.pagina }, targeting: segmentacion(p.publico ?? null, p.que ?? "post"),
    })).id;
    const base = {
      name: p.nombre, object_id: META.pagina, instagram_user_id: META.instagram, source_instagram_media_id: p.mediaId,
      call_to_action: { type: "INSTAGRAM_MESSAGE", value: { app_destination: "INSTAGRAM_DIRECT", link: "https://www.instagram.com" } },
    };
    // Música: Meta escoge una canción que calce con el anuncio. Si para ese post no la acepta, sale sin música.
    let musica = !!p.musica, creativo = "";
    if (musica) {
      try { creativo = (await graph<{ id: string }>(`${act}/adcreatives`, "POST", { ...base, asset_feed_spec: { audios: [{ type: "random" }] } })).id; }
      catch (e) { console.error("[promo] sin música:", (e as Error).message); musica = false; }
    }
    if (!creativo) creativo = (await graph<{ id: string }>(`${act}/adcreatives`, "POST", base)).id;
    const anuncio = (await graph<{ id: string }>(`${act}/ads`, "POST", {
      name: p.nombre, adset_id: conjunto, status: "PAUSED", creative: { creative_id: creativo },
    })).id;
    return { campaign_id: campana, adset_id: conjunto, ad_id: anuncio, musica };
  } catch (e) {
    if (campana) await graph(campana, "DELETE").catch(() => {});
    throw e;
  }
}

/** Lo mínimo por día que Meta acepta en esta cuenta (en colones). */
let minimoGuardado: { valor: number | null; cuando: number } | null = null;
export async function minimoDiario(): Promise<number | null> {
  if (minimoGuardado && Date.now() - minimoGuardado.cuando < 6 * 3600e3) return minimoGuardado.valor;
  try {
    const j = await graph<{ data: { currency?: string; min_daily_budget_imp?: number; min_daily_budget_high_freq?: number }[] }>(`act_${META.cuenta}/minimum_budgets`, "GET");
    const m = j.data?.[0];
    const v = Math.max(m?.min_daily_budget_imp ?? 0, m?.min_daily_budget_high_freq ?? 0) || null;
    minimoGuardado = { valor: v, cuando: Date.now() };
    return v;
  } catch { return null; }
}

/** Enciende la promoción (solo después de la confirmación de Andrea). */
export async function encender(ids: Ids) {
  await graph(ids.ad_id, "POST", { status: "ACTIVE" });
  await graph(ids.adset_id, "POST", { status: "ACTIVE" });
  await graph(ids.campaign_id, "POST", { status: "ACTIVE" });
}

export const detener = (campana: string) => graph(campana, "POST", { status: "PAUSED" });

/** Resultados acumulados: gasto (colones sin IVA), personas alcanzadas y conversaciones iniciadas. */
export async function resultados(campana: string) {
  const j = await graph<{ data: { spend?: string; reach?: string; actions?: { action_type: string; value: string }[] }[] }>(
    `${campana}/insights`, "GET", { fields: "spend,reach,actions", date_preset: "maximum" },
  );
  const f = j.data?.[0];
  const mensajes = f?.actions?.find((a) => a.action_type.startsWith("onsite_conversion.messaging_conversation_started"))?.value;
  return { gastado: Number(f?.spend ?? 0), alcance: Number(f?.reach ?? 0), mensajes: Number(mensajes ?? 0) };
}

/**
 * Revisión técnica sin gastar: pide la estimación de alcance y arma una promoción de prueba EN PAUSA
 * (nunca se enciende) que se borra enseguida. Sirve para confirmar que la llave y los datos funcionan.
 */
export async function diagnostico(op: { musica?: boolean; que?: "post" | "story" } = {}) {
  const out: Record<string, unknown> = {};
  out.minimo = await minimoDiario();
  try {
    const j = await graph<{ data: { daily_outcomes_curve?: { spend: number; reach: number }[]; estimate_dau?: number }[] }>(
      `act_${META.cuenta}/delivery_estimate`, "GET",
      { optimization_goal: "CONVERSATIONS", targeting_spec: PUBLICO, promoted_object: { page_id: META.pagina } },
    );
    const curva = j.data?.[0]?.daily_outcomes_curve ?? [];
    out.estimacion = { puntos: curva.length, primeros: curva.slice(0, 5).map((c) => ({ spend: c.spend, reach: c.reach })), dau: j.data?.[0]?.estimate_dau };
  } catch (e) {
    out.estimacion = { error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const post = op.que === "story" ? (await historias())[0] : (await postsRecientes())[0];
    if (!post) throw new Error(op.que === "story" ? "No hay historias en vivo" : "No hay posts");
    const manana = new Date(Date.now() + 24 * 3600e3);
    const ids = await crearEnPausa({ nombre: "Prueba del panel (se borra sola)", mediaId: post.id, inicio: manana, fin: new Date(manana.getTime() + 3 * 24 * 3600e3), total: 9000, que: op.que, musica: op.musica });
    out.prueba = "se pudo crear en pausa"; out.musica = ids.musica;
    try { await graph(ids.campaign_id, "DELETE"); out.borrada = true; } catch (e) { out.borrada = e instanceof Error ? e.message : String(e); }
  } catch (e) {
    out.prueba = { error: e instanceof Error ? e.message : String(e) };
  }
  return out;
}
