import Card from "@/components/Card";
import Colecciones from "@/components/Colecciones";
import Hero from "@/components/Hero";
import { facets, getCatalog, img, srcSet, WHATSAPP } from "@/lib/catalog";

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
  const nuevas = cat.filter((p) => p.nuevo);
  const portada = nuevas.find((p) => p.fotos.length >= 3) ?? cat[0];
  const { colecciones } = facets(cat);
  const cols = colecciones.map((nombre) => {
    const piezas = cat.filter((p) => p.coleccion === nombre);
    return { nombre, piezas: piezas.length, foto: img(piezas[0].fotos[0], 1000) };
  });

  return (
    <>
      <Hero foto={img(portada.fotos[0], 1000)} srcSet={srcSet(portada.fotos[0])} nombre={portada.nombre} href={`/tienda/${portada.slug}`} />

      <section className="wrap nuevas" aria-labelledby="nuevas-t">
        <div className="fila-titulo">
          <h2 id="nuevas-t" className="titulo">Lo más nuevo</h2>
          <a className="link" href="/tienda">Ver toda la tienda</a>
        </div>
        <div className="grid grid-escalera">
          {(nuevas.length ? nuevas : cat).slice(0, 8).map((p) => <Card key={p.slug} p={p} />)}
        </div>
      </section>

      <div id="colecciones"><Colecciones items={cols} /></div>

      <section id="andrea" className="andrea">
        <div className="wrap andrea-grid">
          <p className="andrea-frase">Eucalipto Chic comenzó en 2020, en plena pandemia.</p>
          <div>
            <p>Detrás de cada pieza está Andrea Bermúdez. Si tenés dudas de talla, tela o entrega, escribile por WhatsApp.</p>
            <a className="btn" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">Escribirle a Andrea</a>
          </div>
        </div>
      </section>
    </>
  );
}
