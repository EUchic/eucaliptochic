import { fotosDePieza } from "./fotos";
// Tipos y utilidades del catálogo (sirven en el servidor y en el navegador).
// La lectura del catálogo vive en lib/tienda.ts (base de datos de Andrea). catalogoSquarespace queda solo
// para pruebas locales con un JSON en el formato de la tienda vieja.

const SOURCE = process.env.CATALOG_SOURCE_URL ?? "";

export type Variant = { sku: string; talla: string; color: string | null };
export type Product = {
  slug: string;
  nombre: string;
  precio: number; // colones, 0 = precio por definir
  tipo: string; // Blusas, Faldas...
  coleccion: string | null; // Renacer, Viva...
  fotos: string[];
  tallas: string[];
  colores: string[];
  variantes: Variant[];
  nuevo: boolean;
  orden: number;
  urlVieja?: string; // dirección en la tienda vieja de Squarespace
};

const TIPO_POR_PALABRA: Record<string, string> = {
  blusa: "Blusas", basica: "Blusas", croptop: "Tops", top: "Tops", enterizo: "Enterizos",
  jogger: "Pantalones", palazo: "Pantalones", pantalon: "Pantalones", falda: "Faldas",
  vestido: "Vestidos", cardigan: "Suéteres", sueter: "Suéteres", panuelo: "Pañuelos",
};
const TIPO_NOMBRE: Record<string, string> = { Sueteres: "Suéteres", Panuelos: "Pañuelos" };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const slugify = (s: string) =>
  sinTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function talla(raw: unknown): string {
  const t = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (t === "SM" || t === "S-M") return "S-M";
  if (t === "ML" || t === "M-L") return "M-L";
  if (t.startsWith("TALLA")) return "Talla única";
  return t || "Talla única";
}
export const ORDEN_TALLA = ["S-M", "M-L", "Talla única"];

type Raw = Record<string, any>;

async function loadRaw(): Promise<Raw | null> {
  try {
    const res = await fetch(SOURCE, {
      next: { revalidate: 900 },
      headers: { accept: "application/json", "user-agent": "EucaliptoChicWeb/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function catalogoSquarespace(): Promise<Product[]> {
  const raw = await loadRaw();
  if (!raw?.items) return [];
  const cats: Record<string, string> = {};
  for (const c of raw.nestedCategories?.categories ?? []) cats[c.id] = c.displayName;

  const porNombre = new Map<string, Product>();
  (raw.items as Raw[]).forEach((it, i) => {
    const nombre = String(it.title ?? "").trim();
    if (!nombre) return;
    const nombres = (it.categoryIds ?? []).map((id: string) => cats[id]).filter(Boolean) as string[];
    const col = nombres.find((n) => n.startsWith("Colección"))?.replace("Colección ", "") ?? null;
    let tipo = nombres.find((n) => !n.startsWith("Colección")) ?? "";
    tipo = TIPO_NOMBRE[tipo] ?? tipo;
    if (!tipo) tipo = TIPO_POR_PALABRA[slugify(nombre).split("-")[0]] ?? "Otros";

    const vs: Raw[] = it.structuredContent?.variants ?? it.variants ?? [];
    const variantes: Variant[] = vs.map((v) => ({
      sku: String(v.sku ?? ""),
      talla: talla(v.attributes?.Size ?? v.attributes?.Talla),
      color: v.attributes?.Color ? String(v.attributes.Color).trim() : null,
    }));
    const cents = Number(vs[0]?.price ?? it.priceCents ?? 0) || 0;
    const fotos: string[] = ((it.items ?? []) as Raw[]).map((x) => x.assetUrl).filter(Boolean);
    if (!fotos.length && it.assetUrl) fotos.push(it.assetUrl);

    const p: Product = {
      slug: slugify(nombre),
      nombre,
      precio: Math.round(cents / 100),
      tipo,
      coleccion: col,
      fotos,
      tallas: [...new Set(variantes.map((v) => v.talla))].sort(
        (a, b) => ORDEN_TALLA.indexOf(a) - ORDEN_TALLA.indexOf(b),
      ),
      colores: [...new Set(variantes.map((v) => v.color).filter(Boolean) as string[])],
      variantes,
      nuevo: !col,
      orden: i,
    };

    // En Squarespace hay piezas repetidas: se unen en una sola (todas las fotos, la colección que exista).
    const key = slugify(nombre);
    const prev = porNombre.get(key);
    if (!prev) return void porNombre.set(key, p);
    prev.fotos = [...new Set([...prev.fotos, ...p.fotos])];
    prev.coleccion ??= p.coleccion;
    if (prev.tipo === "Otros") prev.tipo = p.tipo;
    if (!prev.precio) prev.precio = p.precio;
  });
  // Fotos propias nuevas: van primero, antes que las de Squarespace.
  for (const p of porNombre.values()) {
    const extra = fotosDePieza(p.slug);
    if (extra.length) p.fotos = [...extra, ...p.fotos.filter((f) => !extra.includes(f))];
  }
  return [...porNombre.values()].filter((p) => p.fotos.length > 0);
}

export function facets(products: Product[]) {
  const tipos = [...new Set(products.map((p) => p.tipo))];
  const colecciones = [...new Set(products.map((p) => p.coleccion).filter(Boolean) as string[])];
  return { tipos, colecciones };
}

/** Squarespace redimensiona en su CDN con ?format=NNNw */
// Tres orígenes de fotos: propias en /public/fotos, subidas por Andrea a Supabase (pareja -800/-1600) y Squarespace.
const esSquarespace = (url: string) => url.includes("squarespace-cdn.com");
const SUBIDA = /-1600\.(webp|jpg|png)$/;
export const img = (url: string, w: number) =>
  url.startsWith("/fotos/") ? `${url}-${w <= 800 ? 800 : 1600}.webp`
  : SUBIDA.test(url) ? (w <= 800 ? url.replace(SUBIDA, "-800.$1") : url)
  : esSquarespace(url) ? `${url}?format=${w}w` : url;
export const srcSet = (url: string) =>
  url.startsWith("/fotos/") ? `${url}-800.webp 800w, ${url}-1600.webp 1600w`
  : SUBIDA.test(url) ? `${url.replace(SUBIDA, "-800.$1")} 800w, ${url} 1600w`
  : esSquarespace(url) ? [300, 500, 750, 1000, 1500].map((w) => `${url}?format=${w}w ${w}w`).join(", ") : `${url} 1600w`;

export const colones = (n: number) =>
  n > 0 ? "₡" + n.toLocaleString("es-CR").replace(/,/g, " ").replace(/\./g, " ") : "Consultar precio";

export const colSlug = (c: string) => slugify(c);
export const INSTAGRAM = "https://www.instagram.com/eucaliptochicr/";
export const FACEBOOK = "https://www.facebook.com/profile.php?id=100063841471635";
export const WHATSAPP = "50670171232";
