import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icons";
import { Lockup } from "@/components/Logo";
import Reveal, { Words } from "@/components/Reveal";
import { facets, getCatalog, img, WHATSAPP } from "@/lib/catalog";

export const metadata: Metadata = { title: "Andrea" };
export const revalidate = 900;

export default async function Andrea() {
  const cat = await getCatalog();
  const { colecciones, tipos } = facets(cat);
  const fotos = cat.filter((p) => p.fotos.length >= 2).slice(0, 3);
  return (
    <div className="pag">
      <section className="and-hero">
        <div className="wrap and-hero-grid">
          <div>
            <Reveal kind="up"><p className="and-firma">By Andrea Bermúdez</p></Reveal>
            <Reveal kind="words" as="h1" className="titulo titulo-xxl"><Words text="Una marca que nació en 2020, en plena pandemia." /></Reveal>
          </div>
          <Reveal kind="up" delay={250} className="and-logo"><Lockup /></Reveal>
        </div>
      </section>

      <section className="wrap and-datos">
        {[
          [String(colecciones.length), "colecciones", colecciones.join(", ")],
          [String(cat.length), "piezas en la tienda", tipos.filter((t) => t !== "Otros").join(", ")],
          ["3", "tallas", "S-M, M-L y talla única"],
        ].map(([n, t, d], i) => (
          <Reveal kind="up" delay={i * 120} key={t}>
            <b>{n}</b>
            <span>{t}</span>
            <p>{d}</p>
          </Reveal>
        ))}
      </section>

      <section className="wrap and-fotos">
        {fotos.map((p, i) => (
          <Reveal kind="img" delay={i * 150} key={p.slug} className={"and-f and-f" + i}>
            <img data-speed={i === 1 ? "-0.05" : "0.04"} src={img(p.fotos[1] ?? p.fotos[0], 1000)} alt={p.nombre} loading="lazy" />
          </Reveal>
        ))}
      </section>

      <section className="and-cta">
        <div className="wrap">
          <Reveal kind="words" as="h2" className="titulo titulo-xl"><Words text="¿Dudas de talla, tela o entrega?" /></Reveal>
          <Reveal kind="up" delay={200}>
            <p>Escribile a Andrea por WhatsApp.</p>
            <a className="btn btn-claro" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer"><Icon n="chat" size={22} /> Escribir al 7017 1232</a>
            <Link className="link" href="/tienda">Ir a la tienda</Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
