import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Card from "@/components/Card";
import { Comprar, Galeria } from "@/components/Comprar";
import { colones, img, srcSet, WHATSAPP } from "@/lib/catalog";
import { getCatalog } from "@/lib/tienda";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = (await getCatalog()).find((x) => x.slug === slug);
  return p ? { title: p.nombre, openGraph: { images: [img(p.fotos[0], 1000)] } } : {};
}

export default async function Pieza({ params }: Props) {
  const { slug } = await params;
  const cat = await getCatalog();
  const p = cat.find((x) => x.slug === slug);
  if (!p) notFound();
  const fotos = p.fotos.map((f) => ({ full: img(f, 1500), set: srcSet(f), thumb: img(f, 300) }));
  const mas = cat.filter((x) => x.slug !== p.slug && (p.coleccion ? x.coleccion === p.coleccion : x.tipo === p.tipo)).slice(0, 4);
  const duda = encodeURIComponent(`Hola Andrea, tengo una consulta sobre ${p.nombre}.`);

  return (
    <>
      <article className="wrap pieza">
        <Galeria fotos={fotos} nombre={p.nombre} />
        <div className="pieza-info">
          <p className="migas">
            <a href="/tienda">Tienda</a> / <a href={`/tienda?tipo=${encodeURIComponent(p.tipo)}`}>{p.tipo}</a>
          </p>
          <h1 className="titulo titulo-xl">{p.nombre}</h1>
          <p className="pieza-precio">{colones(p.precio)}</p>
          {p.coleccion && (
            <p className="pieza-col">Colección <a className="link" href={`/tienda?coleccion=${encodeURIComponent(p.coleccion)}`}>{p.coleccion}</a></p>
          )}
          <Comprar p={{ slug: p.slug, nombre: p.nombre, precio: p.precio, fotos, tallas: p.tallas, colores: p.colores }} />
          <a className="link" href={`https://wa.me/${WHATSAPP}?text=${duda}`} target="_blank" rel="noopener noreferrer">
            ¿Dudas de talla? Preguntale a Andrea
          </a>
        </div>
      </article>
      {mas.length > 0 && (
        <section className="wrap nuevas" aria-labelledby="mas-t">
          <h2 id="mas-t" className="titulo">{p.coleccion ? `Más de ${p.coleccion}` : `Más ${p.tipo.toLowerCase()}`}</h2>
          <div className="grid">{mas.map((x, i) => <Card key={x.slug} p={x} i={i} />)}</div>
        </section>
      )}
    </>
  );
}
