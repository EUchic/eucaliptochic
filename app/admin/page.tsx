import type { Metadata } from "next";
import Admin from "@/components/Admin";
import { facets, getCatalog, img } from "@/lib/catalog";
import { FOTOS, fotoSrc } from "@/lib/fotos";
import { protegido } from "@/lib/sesion";

export const metadata: Metadata = { title: "Panel de Andrea", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const cat = await getCatalog();
  const { colecciones, tipos } = facets(cat);
  return (
    <Admin
      protegido={protegido()}
      colecciones={colecciones}
      tipos={tipos}
      fotos={FOTOS.filter((f) => f.tipo === "prenda" || !f.pieza).map((f) => ({ id: f.id, src: fotoSrc(f.id, 800), alt: f.alt, pieza: f.pieza }))}
      piezas={cat.map((p) => ({ slug: p.slug, nombre: p.nombre, precio: p.precio, tipo: p.tipo, coleccion: p.coleccion ?? "", foto: img(p.fotos[0], 300), fotos: p.fotos.length }))}
    />
  );
}
