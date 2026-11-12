import type { Metadata } from "next";
import Admin from "@/components/Admin";
import { facets, getCatalog, img } from "@/lib/catalog";

export const metadata: Metadata = { title: "Panel de Andrea", robots: { index: false, follow: false } };
export const revalidate = 900;

export default async function Page() {
  const cat = await getCatalog();
  const { colecciones, tipos } = facets(cat);
  return (
    <Admin
      colecciones={colecciones}
      tipos={tipos}
      piezas={cat.map((p) => ({ slug: p.slug, nombre: p.nombre, precio: p.precio, tipo: p.tipo, coleccion: p.coleccion ?? "", foto: img(p.fotos[0], 300), fotos: p.fotos.length }))}
    />
  );
}
