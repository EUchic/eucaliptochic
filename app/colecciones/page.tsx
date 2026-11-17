import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icons";
import Reveal, { Words } from "@/components/Reveal";
import { facets, img, slugify } from "@/lib/catalog";
import { getCatalog } from "@/lib/tienda";

export const metadata: Metadata = { title: "Colecciones" };
export const revalidate = 900;

export default async function Colecciones() {
  const cat = await getCatalog();
  const { colecciones } = facets(cat);
  return (
    <section className="pag">
      <header className="cab wrap">
        <Reveal kind="words" as="h1" className="titulo titulo-xxl"><Words text="Colecciones" /></Reveal>
        <Reveal kind="up" delay={200}><p className="cab-sub">{colecciones.length} colecciones desde 2020. Cada una con su nombre y su ánimo.</p></Reveal>
      </header>
      <div className="wrap colp">
        {colecciones.map((c, i) => {
          const piezas = cat.filter((p) => p.coleccion === c);
          return (
            <Link className={"colp-fila" + (i % 2 ? " is-inv" : "")} href={`/colecciones/${slugify(c)}`} key={c} data-cursor="Abrir">
              <div className="colp-txt">
                <Reveal kind="up"><p className="colp-n">{piezas.length} {piezas.length === 1 ? "pieza" : "piezas"}</p></Reveal>
                <Reveal kind="words" as="h2" className="titulo titulo-xl"><Words text={c} /></Reveal>
                <Reveal kind="up" delay={150}><span className="link-ic">Ver la colección <Icon n="flecha" size={22} /></span></Reveal>
              </div>
              <div className="colp-fotos">
                {piezas.slice(0, 3).map((p, k) => (
                  <Reveal kind="img" delay={k * 140} key={p.slug} className={"colp-f colp-f" + k}>
                    <img src={img(p.fotos[0], 750)} alt={p.nombre} loading="lazy" />
                  </Reveal>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
