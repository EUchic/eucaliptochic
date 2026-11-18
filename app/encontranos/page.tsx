import type { Metadata } from "next";
import Icon from "@/components/Icons";
import Reveal, { Words } from "@/components/Reveal";
import { img, srcSet, WHATSAPP } from "@/lib/catalog";
import { feriasPublicas } from "@/lib/db";
import { comoLlegar, cuandoFeria, fechaFeria, type FeriaVista } from "@/lib/ferias";

export const metadata: Metadata = {
  title: "Ferias y contacto",
  description: "Próximas ferias de Eucalipto Chic en Costa Rica, con cómo llegar en Waze o Google Maps.",
};
export const revalidate = 300;

async function proximas(): Promise<FeriaVista[]> {
  try { return await feriasPublicas(); } catch { return []; }
}

/** Datos de evento para que Google pueda mostrar la feria en sus resultados. */
function eventos(ferias: FeriaVista[]) {
  return ferias.filter((f) => f.lugar).map((f) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: f.nombre,
    startDate: f.fecha,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: f.lugar,
      address: { "@type": "PostalAddress", streetAddress: f.direccion ?? f.lugar, addressCountry: "CR" },
      ...(f.lat != null && f.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: f.lat, longitude: f.lng } } : {}),
    },
    ...(f.foto ? { image: [f.foto] } : {}),
    organizer: { "@type": "Organization", name: "Eucalipto Chic", url: "https://www.eucaliptochic.com" },
  }));
}

export default async function Encontranos() {
  const ferias = await proximas();
  const pregunta = encodeURIComponent("Hola Andrea, ¿en qué feria vas a estar próximamente?");
  const ld = eventos(ferias);
  return (
    <section className="pag enc">
      {ld.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      <header className="cab wrap">
        <Reveal kind="words" as="h1" className="titulo titulo-xxl"><Words text="Ferias y contacto" /></Reveal>
        <Reveal kind="up" delay={200}><p className="cab-sub">Eucalipto Chic se vende en línea y en ferias en Costa Rica.</p></Reveal>
      </header>

      {ferias.length > 0 && (
        <div className="wrap fer">
          <h2 className="titulo fer-titulo">{ferias.length === 1 ? "Próxima feria" : "Próximas ferias"}</h2>
          <ul className="fer-lista">
            {ferias.map((f, i) => {
              const ir = comoLlegar(f);
              const cuando = cuandoFeria(f.fecha);
              return (
                <Reveal key={f.nombre + f.fecha} kind="up" delay={i * 80} as="li" className={`fer-c${f.foto ? "" : " sin-foto"}`}>
                  {f.foto && (
                    <div className="fer-foto">
                      <img src={img(f.foto, 800)} srcSet={srcSet(f.foto)} sizes="(max-width: 860px) 100vw, 40vw" alt={`Afiche de ${f.nombre}`} loading={i ? "lazy" : "eager"} />
                    </div>
                  )}
                  <div className="fer-info">
                    <p className="fer-fecha">{cuando && <span>{cuando}</span>}{fechaFeria(f.fecha)}</p>
                    <h3 className="titulo">{f.nombre}</h3>
                    {f.lugar && (
                      <p className="fer-lugar"><Icon n="pin" size={26} /><span><b>{f.lugar}</b>{f.direccion && <small>{f.direccion}</small>}</span></p>
                    )}
                    {ir && (
                      <div className="fer-ir">
                        <a className="btn" href={ir.waze} target="_blank" rel="noopener noreferrer">Ir con Waze <Icon n="flecha" size={20} /></a>
                        <a className="btn btn-borde" href={ir.google} target="_blank" rel="noopener noreferrer">Ir con Google Maps <Icon n="flecha" size={20} /></a>
                      </div>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </ul>
        </div>
      )}

      <div className="wrap enc-grid">
        <Reveal kind="up" className="enc-c enc-feria">
          <Icon n="pin" size={48} />
          <h2 className="titulo">{ferias.length ? "Otras ferias" : "Próxima feria"}</h2>
          <p>{ferias.length ? "¿Querés saber a cuáles más va a ir? Preguntale a Andrea." : "Las fechas cambian cada mes. Preguntale a Andrea dónde va a estar."}</p>
          <a className="btn" href={`https://wa.me/${WHATSAPP}?text=${pregunta}`} target="_blank" rel="noopener noreferrer">Preguntar por las ferias</a>
        </Reveal>
        <Reveal kind="up" delay={120} className="enc-c">
          <Icon n="chat" size={48} />
          <h2 className="titulo">WhatsApp</h2>
          <p>Pedidos, tallas y entregas.</p>
          <a className="link-ic" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">7017 1232 <Icon n="flecha" size={22} /></a>
        </Reveal>
        <Reveal kind="up" delay={240} className="enc-c">
          <Icon n="camara" size={48} />
          <h2 className="titulo">Instagram</h2>
          <p>Piezas nuevas y avisos de ferias.</p>
          <a className="link-ic" href="https://www.instagram.com/eucaliptochicr/" target="_blank" rel="noopener noreferrer">@eucaliptochicr <Icon n="flecha" size={22} /></a>
        </Reveal>
      </div>
    </section>
  );
}
