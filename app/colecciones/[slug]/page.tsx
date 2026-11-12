import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Card from "@/components/Card";
import Icon from "@/components/Icons";
import Reveal, { Words } from "@/components/Reveal";
import { facets, getCatalog, img, slugify } from "@/lib/catalog";

type Props = { params: Promise<{ slug: string }> };
export const revalidate = 900;

async function cargar(slug: string) {
  const cat = await getCatalog();
  const { colecciones } = facets(cat);
  const i = colecciones.findIndex((c) => slugify(c) === slug);
  return { cat, colecciones, i };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { colecciones, i } = await cargar((await params).slug);
  return i >= 0 ? { title: `Colección ${colecciones[i]}` } : {};
}

export default async function Coleccion({ params }: Props) {
  const { cat, colecciones, i } = await cargar((await params).slug);
  if (i < 0) notFound();
  const nombre = colecciones[i];
  const piezas = cat.filter((p) => p.coleccion === nombre);
  const sig = colecciones[(i + 1) % colecciones.length];

  return (
    <section className="pag">
      <header className="colh">
        <div className="colh-foto"><img data-speed="0.08" src={img(piezas[0].fotos[0], 1500)} alt="" /></div>
        <div className="colh-txt wrap">
          <Link className="link-ic" href="/colecciones"><Icon n="atras" size={22} /> Colecciones</Link>
          <Reveal kind="words" as="h1" className="titulo titulo-xxl"><Words text={nombre} /></Reveal>
          <p className="cab-sub">{piezas.length} {piezas.length === 1 ? "pieza" : "piezas"}</p>
        </div>
      </header>
      <div className="wrap grid grid-amplia colg">
        {piezas.map((p, k) => <Card key={p.slug} p={p} i={k} sizes="(max-width: 700px) 50vw, 33vw" />)}
      </div>
      <Link className="sig wrap" href={`/colecciones/${slugify(sig)}`} data-cursor="Abrir">
        <span>Siguiente colección</span>
        <b className="titulo titulo-xl">{sig}</b>
        <Icon n="flecha" size={44} />
      </Link>
    </section>
  );
}
