import type { Metadata } from "next";
import Admin from "@/components/Admin";
import { facets, img } from "@/lib/catalog";
import { estadoPanel, hayBase } from "@/lib/db";
import { FOTOS, fotoSrc } from "@/lib/fotos";
import { protegido } from "@/lib/sesion";
import { getCatalog } from "@/lib/tienda";
import { TIPOS_PIEZA } from "@/lib/validar";

export const metadata: Metadata = { title: "Panel de Andrea", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fotos = FOTOS.filter((f) => f.tipo === "prenda" || !f.pieza).map((f) => ({ id: f.id, src: fotoSrc(f.id, 800), alt: f.alt, pieza: f.pieza }));

export default async function Page() {
  // Con clave y base conectada, el panel guarda de verdad. Si no, queda en modo de prueba (solo en ese teléfono).
  if (protegido() && hayBase()) {
    const tipos = TIPOS_PIEZA.slice(0, -1);
    try {
      const e = await estadoPanel();
      return <Admin enLinea piezas={e.piezas} colecciones={e.colecciones} inicial={e.datos} tipos={tipos} fotos={fotos} protegido />;
    } catch (err) {
      console.error("[panel] la base no respondió:", (err as Error).message);
      return <Admin enLinea aviso="No me pude conectar con la base de datos. Esperá un momento y recargá la página; mientras tanto no se guarda nada." piezas={[]} colecciones={[]} tipos={tipos} fotos={fotos} protegido />;
    }
  }
  const cat = await getCatalog();
  const { colecciones, tipos } = facets(cat);
  return (
    <Admin
      enLinea={false}
      protegido={protegido()}
      colecciones={colecciones}
      tipos={tipos}
      fotos={fotos}
      piezas={cat.map((p) => ({ slug: p.slug, nombre: p.nombre, precio: p.precio, tipo: p.tipo, coleccion: p.coleccion ?? "", foto: img(p.fotos[0], 300), fotos: p.fotos.length }))}
    />
  );
}
