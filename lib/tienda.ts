import "server-only";
import { ORDEN_TALLA, catalogoSquarespace, type Product } from "./catalog";
import { catalogoBase } from "./db";

const pos = (t: string) => { const i = ORDEN_TALLA.indexOf(t); return i < 0 ? 99 : i; };

/**
 * El catálogo que ve la tienda.
 * Sale de la base de datos de Andrea: lo que ella cambia en el panel aparece aquí en segundos.
 * Si la base no responde, Next sigue mostrando la última versión buena que tiene guardada.
 * (Solo para pruebas locales: CATALOG_SOURCE_URL lee un JSON con el formato de Squarespace.)
 */
export async function getCatalog(): Promise<Product[]> {
  const respaldo = process.env.CATALOG_SOURCE_URL;
  try {
    const filas = await catalogoBase();
    return filas
      .map((f) => ({
        slug: f.slug,
        nombre: f.nombre,
        precio: Number(f.precio) || 0,
        tipo: f.tipo,
        coleccion: f.coleccion,
        fotos: f.fotos,
        tallas: [...new Set(f.variantes.map((v) => v.talla))].sort((a, b) => pos(a) - pos(b)),
        colores: [...new Set(f.variantes.map((v) => v.color).filter(Boolean) as string[])],
        variantes: f.variantes.map((v) => ({ sku: v.sku ?? "", talla: v.talla, color: v.color })),
        nuevo: f.nuevo,
        orden: f.orden,
        urlVieja: f.url_vieja ?? undefined,
      }))
      .filter((p) => p.fotos.length > 0); // una pieza sin foto no sale en la tienda hasta que tenga una
  } catch (e) {
    console.error("[catalogo] la base no respondió:", (e as Error).message);
    if (!respaldo) throw e;
    return catalogoSquarespace();
  }
}

/** Links viejos de Squarespace (/tienda/p/…) → la pieza en la tienda nueva. */
export async function slugDeUrlVieja(ruta: string) {
  return (await getCatalog()).find((p) => p.urlVieja === ruta)?.slug ?? null;
}

export async function getProduct(slug: string) {
  return (await getCatalog()).find((p) => p.slug === slug) ?? null;
}
