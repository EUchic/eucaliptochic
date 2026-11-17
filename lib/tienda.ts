import "server-only";
import { ORDEN_TALLA, catalogoSquarespace, type Product } from "./catalog";
import { catalogoBase } from "./db";

const pos = (t: string) => { const i = ORDEN_TALLA.indexOf(t); return i < 0 ? 99 : i; };

/**
 * El catálogo que ve la tienda.
 * 1. La base de datos de Andrea (lo que ella cambia en el panel aparece aquí en segundos).
 * 2. Si la base no responde, la tienda vieja de Squarespace, para que la página nunca quede vacía.
 */
export async function getCatalog(): Promise<Product[]> {
  if (process.env.CATALOGO !== "squarespace") {
    try {
      const filas = await catalogoBase();
      if (filas.length) {
        return filas
          .map((f) => {
            const tallas = [...new Set(f.variantes.map((v) => v.talla))];
            return {
              slug: f.slug,
              nombre: f.nombre,
              precio: Number(f.precio) || 0,
              tipo: f.tipo,
              coleccion: f.coleccion,
              fotos: f.fotos,
              tallas: tallas.sort((a, b) => pos(a) - pos(b)),
              colores: [...new Set(f.variantes.map((v) => v.color).filter(Boolean) as string[])],
              variantes: f.variantes.map((v) => ({ sku: v.sku ?? "", talla: v.talla, color: v.color })),
              nuevo: f.nuevo,
              orden: f.orden,
            };
          })
          .filter((p) => p.fotos.length > 0); // una pieza sin foto no sale en la tienda hasta que tenga una
      }
    } catch (e) {
      console.error("[catalogo] la base no respondió, uso Squarespace:", (e as Error).message);
    }
  }
  return catalogoSquarespace();
}

export async function getProduct(slug: string) {
  return (await getCatalog()).find((p) => p.slug === slug) ?? null;
}
