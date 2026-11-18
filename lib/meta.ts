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

export type Post = { id: string; caption: string; tipo: string; miniatura: string; permalink: string; fecha: string };

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
export async function crearEnPausa(p: { nombre: string; mediaId: string; inicio: Date; fin: Date; total: number }): Promise<Ids> {
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
      bid_strategy: "LOWEST_COST_WITHOUT_CAP", promoted_object: { page_id: META.pagina }, targeting: PUBLICO,
    })).id;
    const creativo = (await graph<{ id: string }>(`${act}/adcreatives`, "POST", {
      name: p.nombre, object_id: META.pagina, instagram_user_id: META.instagram, source_instagram_media_id: p.mediaId,
      call_to_action: { type: "INSTAGRAM_MESSAGE", value: { app_destination: "INSTAGRAM_DIRECT", link: "https://www.instagram.com" } },
    })).id;
    const anuncio = (await graph<{ id: string }>(`${act}/ads`, "POST", {
      name: p.nombre, adset_id: conjunto, status: "PAUSED", creative: { creative_id: creativo },
    })).id;
    return { campaign_id: campana, adset_id: conjunto, ad_id: anuncio };
  } catch (e) {
    if (campana) await graph(campana, "DELETE").catch(() => {});
    throw e;
  }
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
export async function diagnostico() {
  const out: Record<string, unknown> = {};
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
    const post = (await postsRecientes())[0];
    const manana = new Date(Date.now() + 24 * 3600e3);
    const ids = await crearEnPausa({ nombre: "Prueba del panel (se borra sola)", mediaId: post.id, inicio: manana, fin: new Date(manana.getTime() + 24 * 3600e3), total: 5000 });
    out.prueba = "se pudo crear en pausa";
    try { await graph(ids.campaign_id, "DELETE"); out.borrada = true; } catch (e) { out.borrada = e instanceof Error ? e.message : String(e); }
  } catch (e) {
    out.prueba = { error: e instanceof Error ? e.message : String(e) };
  }
  return out;
}
