import Link from "next/link";
import Card from "@/components/Card";
import Colecciones from "@/components/Colecciones";
import Icon from "@/components/Icons";
import { Lockup, Mark } from "@/components/Logo";
import Looks from "@/components/Looks";
import Portada from "@/components/Portada";
import Ventana from "@/components/Ventana";
import { fotoSet, fotoSrc, LOOKS } from "@/lib/fotos";
import Rail from "@/components/Rail";
import Reveal, { Words } from "@/components/Reveal";
import { colones, facets, getCatalog, img, srcSet, WHATSAPP } from "@/lib/catalog";

export const revalidate = 900;

export default async function Home() {
  const cat = await getCatalog();
  if (!cat.length) {
    return (
      <section className="wrap vacio pag">
        <h1 className="titulo">Estamos acomodando la tienda</h1>
        <p>El catálogo no cargó en este momento. Probá de nuevo en unos minutos o escribinos por WhatsApp.</p>
        <a className="btn" href={`https://wa.me/${WHATSAPP}`}>Escribir por WhatsApp</a>
      </section>
    );
  }
  const conPrecio = cat.filter((p) => p.precio > 0);
  const nuevas = conPrecio.filter((p) => p.nuevo);
  // Portada: primero las piezas que tienen foto nueva de Andrea, después las que tienen más fotos.
  const conAndrea = conPrecio.filter((p) => p.fotos[0]?.startsWith("/fotos/andrea"));
  const portada = [...conAndrea, ...[...conPrecio].filter((p) => !conAndrea.includes(p)).sort((a, b) => b.fotos.length - a.fotos.length || a.orden - b.orden)].slice(0, 5);
  const porSlug = new Map(cat.map((p) => [p.slug, p]));
  const looks = LOOKS.map((l) => ({
    img: l.img,
    fondo: l.fondo,
    piezas: l.piezas.map(([nombre, slug]) => {
      const p = porSlug.get(slug);
      return { nombre, href: p ? `/tienda/${slug}` : null, precio: p && p.precio ? colones(p.precio) : null };
    }),
  }));
  const { colecciones, tipos } = facets(cat);
  const cols = colecciones.map((nombre) => {
    const piezas = cat.filter((p) => p.coleccion === nombre);
    return { nombre, piezas: piezas.length, foto: img(piezas[0].fotos[0], 1000) };
  });
  const porTipo = tipos.map((t) => {
    const l = cat.filter((p) => p.tipo === t);
    return { t, n: l.length, foto: img(l[0].fotos[0], 500) };
  }).filter((x) => x.t !== "Otros");
  const cinta = [...tipos, ...tipos];

  return (
    <>
      <Portada
        video={process.env.NEXT_PUBLIC_HERO_VIDEO}
        slides={portada.map((p) => ({ nombre: p.nombre, tipo: p.tipo, precio: colones(p.precio), href: `/tienda/${p.slug}`, foto: img(p.fotos[0], 1000), set: srcSet(p.fotos[0]) }))}
      />

      <div className="cinta" aria-hidden>
        <div className="cinta-fila">
          {[0, 1].map((k) => (
            <span key={k}>{cinta.map((t, i) => <span key={i}><em>{t}</em><Mark part="eu" /></span>)}</span>
          ))}
        </div>
      </div>

      <Ventana
        foto={fotoSrc("andrea-cafe-eucalipto")}
        set={fotoSet("andrea-cafe-eucalipto")}
        alt="Andrea con blusa y capri café junto a un ramo de eucalipto"
        frase="Ropa cómoda, hecha para moverse con vos."
        firma="By Andrea Bermúdez"
      />

      <section className="tipos wrap" aria-labelledby="tipos-t">
        <Reveal kind="words" as="h2" className="titulo"><span id="tipos-t"><Words text="¿Qué andás buscando?" /></span></Reveal>
        <ul>
          {porTipo.map((x, i) => (
            <Reveal as="li" kind="up" delay={i * 70} key={x.t}>
              <Link href={`/tienda?tipo=${encodeURIComponent(x.t)}`}>
                <span className="tipos-foto"><img src={x.foto} alt="" loading="lazy" /></span>
                <b>{x.t}</b>
                <small>{x.n} {x.n === 1 ? "pieza" : "piezas"}</small>
              </Link>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="nuevas" aria-labelledby="nuevas-t">
        <div className="wrap fila-titulo">
          <Reveal kind="words" as="h2" className="titulo"><span id="nuevas-t"><Words text="Lo más nuevo" /></span></Reveal>
          <Link className="link-ic" href="/tienda">Ver toda la tienda <Icon n="flecha" size={22} /></Link>
        </div>
        <Rail label="Piezas nuevas">
          {(nuevas.length ? nuevas : cat).slice(0, 12).map((p, i) => <Card key={p.slug} p={p} i={i} sizes="(max-width: 700px) 70vw, 26vw" />)}
        </Rail>
      </section>

      <Looks looks={looks} />

      <Colecciones items={cols} />

      <section className="andrea">
        <div className="wrap andrea-grid">
          <div>
            <Reveal kind="words" as="p" className="andrea-frase"><Words text="Eucalipto Chic comenzó en 2020, en plena pandemia." /></Reveal>
            <Reveal kind="up" delay={300}>
              <p>Detrás de cada pieza está Andrea Bermúdez.</p>
              <Link className="btn btn-claro" href="/andrea">Conocé la historia <Icon n="flecha" size={20} /></Link>
            </Reveal>
          </div>
          <Reveal kind="up" delay={200} className="andrea-logo"><Lockup /></Reveal>
        </div>
      </section>

      <section className="ferias-b wrap">
        <Reveal kind="up"><Icon n="pin" size={44} /></Reveal>
        <Reveal kind="words" as="h2" className="titulo"><Words text="También nos encontrás en ferias" /></Reveal>
        <Reveal kind="up" delay={200}><Link className="btn" href="/encontranos">Ferias y contacto <Icon n="flecha" size={20} /></Link></Reveal>
      </section>
    </>
  );
}
