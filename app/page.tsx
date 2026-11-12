import Link from "next/link";
import Card from "@/components/Card";
import Colecciones from "@/components/Colecciones";
import Hero from "@/components/Hero";
import { Lockup, Mark } from "@/components/Logo";
import Rail from "@/components/Rail";
import Reveal, { Words } from "@/components/Reveal";
import { colones, facets, getCatalog, img, srcSet, WHATSAPP } from "@/lib/catalog";

export const revalidate = 900;

export default async function Home() {
  const cat = await getCatalog();
  if (!cat.length) {
    return (
      <section className="wrap vacio">
        <h1 className="titulo">Estamos acomodando la tienda</h1>
        <p>El catálogo no cargó en este momento. Probá de nuevo en unos minutos o escribinos por WhatsApp.</p>
        <a className="btn" href={`https://wa.me/${WHATSAPP}`}>Escribir por WhatsApp</a>
      </section>
    );
  }
  const nuevas = cat.filter((p) => p.nuevo && p.precio > 0);
  const conFotos = cat.filter((p) => p.fotos.length >= 3 && p.precio > 0);
  const portada = conFotos[0] ?? cat[0];
  const destacada = conFotos.find((p) => p.slug !== portada.slug) ?? cat[1] ?? cat[0];
  const { colecciones, tipos } = facets(cat);
  const cols = colecciones.map((nombre) => {
    const piezas = cat.filter((p) => p.coleccion === nombre);
    return { nombre, piezas: piezas.length, foto: img(piezas[0].fotos[0], 1000) };
  });
  const cinta = [...tipos, ...tipos];

  return (
    <>
      <Hero foto={img(portada.fotos[0], 1000)} srcSet={srcSet(portada.fotos[0])} nombre={portada.nombre} href={`/tienda/${portada.slug}`} />

      <div className="cinta" aria-hidden>
        <div className="cinta-fila">
          {[0, 1].map((k) => (
            <span key={k}>
              {cinta.map((t, i) => (
                <span key={i}><em>{t}</em><Mark part="eu" /></span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="nuevas" aria-labelledby="nuevas-t">
        <div className="wrap fila-titulo">
          <Reveal kind="words" as="h2" className="titulo"><span id="nuevas-t"><Words text="Lo más nuevo" /></span></Reveal>
          <Link className="link" href="/tienda">Ver toda la tienda</Link>
        </div>
        <Rail label="Piezas nuevas">
          {(nuevas.length ? nuevas : cat).slice(0, 12).map((p, i) => <Card key={p.slug} p={p} i={i} sizes="(max-width: 700px) 70vw, 26vw" />)}
        </Rail>
      </section>

      <section className="dest wrap" aria-labelledby="dest-t">
        <div className="dest-fotos">
          <Reveal kind="img" className="dest-a">
            <img data-speed="-0.06" src={img(destacada.fotos[0], 1500)} srcSet={srcSet(destacada.fotos[0])} sizes="(max-width: 800px) 80vw, 38vw" alt={destacada.nombre} loading="lazy" />
          </Reveal>
          {destacada.fotos[1] && (
            <Reveal kind="img" delay={180} className="dest-b">
              <img data-speed="0.05" src={img(destacada.fotos[1], 1000)} srcSet={srcSet(destacada.fotos[1])} sizes="(max-width: 800px) 50vw, 22vw" alt="" loading="lazy" />
            </Reveal>
          )}
        </div>
        <div className="dest-txt">
          <Reveal kind="up"><p className="dest-tipo">{destacada.tipo}</p></Reveal>
          <Reveal kind="words" as="h2" className="titulo titulo-xl"><span id="dest-t"><Words text={destacada.nombre} /></span></Reveal>
          <Reveal kind="up" delay={150}>
            <p className="dest-precio">{colones(destacada.precio)}</p>
            <p className="dest-tallas">Tallas {destacada.tallas.join(", ")}</p>
            <Link className="btn" href={`/tienda/${destacada.slug}`}>Ver la pieza</Link>
          </Reveal>
        </div>
      </section>

      <div id="colecciones"><Colecciones items={cols} /></div>

      <section id="andrea" className="andrea">
        <div className="wrap andrea-grid">
          <div>
            <Reveal kind="words" as="p" className="andrea-frase"><Words text="Eucalipto Chic comenzó en 2020, en plena pandemia." /></Reveal>
            <Reveal kind="up" delay={300}>
              <p>Detrás de cada pieza está Andrea Bermúdez. Si tenés dudas de talla, tela o entrega, escribile por WhatsApp.</p>
              <a className="btn" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">Escribirle a Andrea</a>
            </Reveal>
          </div>
          <Reveal kind="up" delay={200} className="andrea-logo"><Lockup /></Reveal>
        </div>
      </section>
    </>
  );
}
