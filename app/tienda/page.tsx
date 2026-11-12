import type { Metadata } from "next";
import Card from "@/components/Card";
import Reveal, { Words } from "@/components/Reveal";
import TiendaGrid from "@/components/TiendaGrid";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = { title: "Tienda" };

export default async function Tienda({ searchParams }: { searchParams: Promise<{ tipo?: string; coleccion?: string }> }) {
  const inicial = await searchParams;
  const cat = await getCatalog();
  const cards = Object.fromEntries(cat.map((p, i) => [p.slug, <Card key={p.slug} p={p} i={i} sizes="(max-width: 700px) 50vw, 30vw" />]));

  return (
    <section className="tienda">
      <header className="cab wrap">
        <Reveal kind="words" as="h1" className="titulo titulo-xxl"><Words text="La tienda" /></Reveal>
        <Reveal kind="up" delay={200}><p className="cab-sub">{cat.length} piezas. Tallas S-M, M-L y talla única.</p></Reveal>
      </header>
      <div className="wrap">
        <TiendaGrid items={cat} cards={cards} inicial={inicial} />
      </div>
    </section>
  );
}
