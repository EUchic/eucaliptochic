import "server-only";

// Buscador de lugares para las ferias (solo desde el panel, una búsqueda por toque de "Buscar").
// - Texto: OpenStreetMap (Photon y, si no encuentra, Nominatim), limitado a Costa Rica. No necesita llaves.
// - Link de Google Maps o Waze (también los cortos de WhatsApp): se sigue el link y se sacan las coordenadas.
//   Solo se visitan dominios de Google Maps y Waze, por https y con un máximo de saltos.

export type Lugar = { nombre: string; direccion: string; lat: number; lng: number };

const UA = "EucaliptoChicPanel/1.0 (+https://www.eucaliptochic.com)";
const CAJA_CR = { oeste: -86.2, sur: 7.9, este: -82.4, norte: 11.4 };
const HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|consent\.google\.com|(maps\.|www\.)?google\.(com|co\.cr)|(www\.|ul\.)?waze\.com)$/i;

const valida = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const corto = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

async function pedir(url: string, ms = 8000) {
  return fetch(url, { headers: { "user-agent": UA, accept: "application/json", "accept-language": "es" }, signal: AbortSignal.timeout(ms), cache: "no-store" });
}

export async function buscarLugares(q: string): Promise<Lugar[]> {
  const t = corto(q, 400);
  const link = t.match(/https?:\/\/[^\s"'<>]+/)?.[0];
  if (link) return desdeEnlace(link);
  const par = t.match(/^(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})$/);
  if (par) return [await describirPunto(Number(par[1]), Number(par[2]), "")];
  // Si los dos buscadores fallan (no solo "no encontré"), se avisa que no se pudo buscar.
  let fallos = 0;
  let r = await photon(t).catch(() => (fallos++, [] as Lugar[]));
  if (!r.length) r = await nominatim(t).catch(() => (fallos++, [] as Lugar[]));
  if (!r.length && fallos === 2) throw new Error("buscadores sin respuesta");
  const vistos = new Set<string>();
  return r.filter((l) => { const k = `${l.nombre}|${l.lat.toFixed(3)}|${l.lng.toFixed(3)}`; return vistos.has(k) ? false : (vistos.add(k), true); }).slice(0, 8);
}

// ── Texto ──────────────────────────────────────────────────────────────────

type PropsPhoton = { name?: string; street?: string; housenumber?: string; locality?: string; district?: string; city?: string; county?: string; state?: string; countrycode?: string };

function direccionDe(p: PropsPhoton, nombre: string) {
  const calle = p.street ? p.street + (p.housenumber ? " " + p.housenumber : "") : "";
  const partes = [calle, p.locality, p.district, p.city, p.county, p.state].filter((x): x is string => !!x && x !== nombre);
  return [...new Set(partes)].slice(0, 4).join(", ");
}

async function photon(q: string): Promise<Lugar[]> {
  const { oeste, sur, este, norte } = CAJA_CR;
  const r = await pedir(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&bbox=${oeste},${sur},${este},${norte}`);
  if (!r.ok) throw new Error(`Photon ${r.status}`);
  const j = (await r.json()) as { features?: { geometry?: { coordinates?: [number, number] }; properties?: PropsPhoton }[] };
  return (j.features ?? []).flatMap((f) => {
    const [lng, lat] = f.geometry?.coordinates ?? [NaN, NaN];
    const p = f.properties ?? {};
    if (!valida(lat, lng) || (p.countrycode && p.countrycode !== "CR")) return [];
    const nombre = p.name || [p.street, p.housenumber].filter(Boolean).join(" ") || p.city || "";
    return nombre ? [{ nombre: corto(nombre, 120), direccion: corto(direccionDe(p, nombre), 200), lat, lng }] : [];
  });
}

type FilaNominatim = { lat: string; lon: string; name?: string; display_name?: string };

const deNominatim = (x: FilaNominatim): Lugar | null => {
  const lat = Number(x.lat), lng = Number(x.lon);
  if (!valida(lat, lng)) return null;
  const partes = (x.display_name ?? "").split(",").map((s) => s.trim()).filter((s) => s && s !== "Costa Rica" && !/^\d{4,5}$/.test(s));
  const nombre = x.name || partes[0] || "";
  if (!nombre) return null;
  return { nombre: corto(nombre, 120), direccion: corto(partes.filter((s) => s !== nombre).slice(0, 4).join(", "), 200), lat, lng };
};

async function nominatim(q: string): Promise<Lugar[]> {
  const r = await pedir(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=cr&limit=8&accept-language=es&q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  return ((await r.json()) as FilaNominatim[]).map(deNominatim).filter((l): l is Lugar => !!l);
}

/** Nombre y dirección de un punto (para cuando llega un link o unas coordenadas). */
async function describirPunto(lat: number, lng: number, nombre: string): Promise<Lugar> {
  try {
    const r = await pedir(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=es&lat=${lat}&lon=${lng}`, 6000);
    if (r.ok) {
      const l = deNominatim((await r.json()) as FilaNominatim);
      if (l) return { nombre: nombre || l.nombre, direccion: nombre && nombre !== l.nombre ? corto([l.nombre, l.direccion].filter(Boolean).join(", "), 200) : l.direccion, lat, lng };
    }
  } catch {}
  return { nombre: nombre || "Punto del mapa", direccion: "", lat, lng };
}

// ── Links de Google Maps y Waze ────────────────────────────────────────────

function coordenadasDe(texto: string): { lat: number; lng: number } | null {
  let t = texto.replace(/\+/g, " ");
  try { t = decodeURIComponent(t); } catch { t = t.replace(/%2C/gi, ",").replace(/%21/g, "!").replace(/%40/g, "@"); }
  const pruebas = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,                                        // el pin del lugar (Google)
    /[?&](?:q|query|ll|destination|daddr|center)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i,    // ?q=9.9,-84.1
    /\bll\.(-?\d+\.\d+),(-?\d+\.\d+)/,                                                // Waze: to=ll.9.9,-84.1
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,                                                     // centro del mapa (Google)
  ];
  for (const p of pruebas) {
    const m = t.match(p);
    if (m && valida(Number(m[1]), Number(m[2]))) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

function nombreDe(u: URL): string {
  const lugar = u.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
  const q = u.searchParams.get("q") ?? u.searchParams.get("query") ?? "";
  let n = /\d+\.\d+\s*,/.test(q) ? "" : q;
  if (lugar) try { n = decodeURIComponent(lugar.replace(/\+/g, " ")); } catch { n = lugar.replace(/\+/g, " "); }
  return corto(n, 120);
}

async function desdeEnlace(enlace: string): Promise<Lugar[]> {
  let u: URL;
  try { u = new URL(enlace); } catch { return []; }
  for (let salto = 0; salto < 6; salto++) {
    if (u.protocol !== "https:" || !HOSTS.test(u.hostname)) throw new Error("Ese link no es de Google Maps ni de Waze.");
    if (u.hostname === "consent.google.com" && u.searchParams.get("continue")) { u = new URL(u.searchParams.get("continue")!); continue; }
    const c = coordenadasDe(u.href);
    if (c) return [await describirPunto(c.lat, c.lng, nombreDe(u))];
    const r = await fetch(u, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (compatible; EucaliptoChicPanel/1.0)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    const sig = r.headers.get("location");
    if (sig && r.status >= 300 && r.status < 400) { u = new URL(sig, u); continue; }
    if (r.ok) {
      const html = (await r.text()).slice(0, 600_000);
      const c2 = coordenadasDe(html);
      if (c2) return [await describirPunto(c2.lat, c2.lng, nombreDe(u))];
    }
    break;
  }
  // El link no trae coordenadas (por ejemplo, una búsqueda): se busca por el nombre que trae.
  const n = nombreDe(u);
  return n ? buscarLugares(n) : [];
}
