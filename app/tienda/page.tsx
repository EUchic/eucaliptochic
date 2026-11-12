import type { Metadata } from "next";
import Card from "@/components/Card";
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
      <h1 className="titulo titulo-xl">{titulo}</h1>
      <nav className="filtros" aria-label="Filtrar piezas">
        <div>
          <span>Tipo de pieza</span>
          <a href="/tienda" aria-current={!tipo && !coleccion ? "page" : undefined}>Todas</a>
          {tipos.map((t) => (
            <a key={t} href={`/tienda?tipo=${encodeURIComponent(t)}`} aria-current={t === tipo ? "page" : undefined}>{t}</a>
          ))}
        </div>
        <div>
          <span>Colección</span>
          {colecciones.map((c) => (
            <a key={c} href={`/tienda?coleccion=${encodeURIComponent(c)}`} aria-current={c === coleccion ? "page" : undefined}>{c}</a>
          ))}
        </div>
      </nav>
      <p className="conteo">{lista.length} {lista.length === 1 ? "pieza" : "piezas"}</p>
      {lista.length ? (
        <div className="grid">{lista.map((p) => <Card key={p.slug} p={p} />)}</div>
      ) : (
        <p className="vacio">No hay piezas con ese filtro. <a className="link" href="/tienda">Ver todas</a></p>
      )}
    </section>
  );
}
