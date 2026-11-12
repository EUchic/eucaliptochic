import type { Metadata } from "next";
import Link from "next/link";
import Card from "@/components/Card";
import Reveal, { Words } from "@/components/Reveal";
import { facets, getCatalog } from "@/lib/catalog";

export const metadata: Metadata = { title: "Tienda" };

export default async function Tienda({ searchParams }: { searchParams: Promise<{ tipo?: string; coleccion?: string }> }) {
  const { tipo, coleccion } = await searchParams;
  const cat = await getCatalog();
  const { tipos, colecciones } = facets(cat);
  const lista = cat.filter((p) => (!tipo || p.tipo === tipo) && (!coleccion || p.coleccion === coleccion));
  const titulo = coleccion ? `Colección ${coleccion}` : tipo ?? "Toda la tienda";

  return (
    <section className="wrap tienda">
      <Reveal kind="words" as="h1" className="titulo titulo-xl"><Words text={titulo} /></Reveal>
      <nav className="filtros" aria-label="Filtrar piezas">
        <div>
          <span>Tipo de pieza</span>
          <Link href="/tienda" scroll={false} aria-current={!tipo && !coleccion ? "page" : undefined}>Todas</Link>
          {tipos.map((t) => (
            <Link key={t} href={`/tienda?tipo=${encodeURIComponent(t)}`} scroll={false} aria-current={t === tipo ? "page" : undefined}>{t}</Link>
          ))}
        </div>
        <div>
          <span>Colección</span>
          {colecciones.map((c) => (
            <Link key={c} href={`/tienda?coleccion=${encodeURIComponent(c)}`} scroll={false} aria-current={c === coleccion ? "page" : undefined}>{c}</Link>
          ))}
        </div>
      </nav>
      <p className="conteo">{lista.length} {lista.length === 1 ? "pieza" : "piezas"}</p>
      {lista.length ? (
        <div className="grid">{lista.map((p, i) => <Card key={p.slug} p={p} i={i} />)}</div>
      ) : (
        <p className="vacio">No hay piezas con ese filtro. <a className="link" href="/tienda">Ver todas</a></p>
      )}
    </section>
  );
}
