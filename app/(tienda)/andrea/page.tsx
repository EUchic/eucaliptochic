import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icons";
import { Lockup } from "@/components/Logo";
import Reveal, { Words } from "@/components/Reveal";
import { facets, WHATSAPP } from "@/lib/catalog";
import { getCatalog } from "@/lib/tienda";
import { fotoSet, fotoSrc } from "@/lib/fotos";

export const metadata: Metadata = { title: "Andrea" };
export const revalidate = 900;

export default async function Andrea() {
  const cat = await getCatalog();
  const { colecciones, tipos } = facets(cat);
  const fotos = [
    ["andrea-negro-cocina", "Andrea de negro en la cocina"],
    ["andrea-lichi-cocina", "Andrea con el Vestido Lichi y una taza de café"],
    ["andrea-cafe-eucalipto", "Andrea junto a un ramo de eucalipto"],
  ];
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
        {fotos.map(([id, alt], i) => (
          <Reveal kind="img" delay={i * 150} key={id} className={"and-f and-f" + i}>
            <img data-speed={i === 1 ? "-0.05" : "0.04"} src={fotoSrc(id, 800)} srcSet={fotoSet(id)} sizes="(max-width: 860px) 50vw, 33vw" alt={alt} loading="lazy" />
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
