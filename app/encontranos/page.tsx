import type { Metadata } from "next";
import Icon from "@/components/Icons";
import Reveal, { Words } from "@/components/Reveal";
import { WHATSAPP } from "@/lib/catalog";

export const metadata: Metadata = { title: "Ferias y contacto" };

export default function Encontranos() {
  const feria = encodeURIComponent("Hola Andrea, ¿en qué feria vas a estar próximamente?");
  return (
    <section className="pag enc">
      <header className="cab wrap">
        <Reveal kind="words" as="h1" className="titulo titulo-xxl"><Words text="Ferias y contacto" /></Reveal>
        <Reveal kind="up" delay={200}><p className="cab-sub">Eucalipto Chic se vende en línea y en ferias en Costa Rica.</p></Reveal>
      </header>
      <div className="wrap enc-grid">
        <Reveal kind="up" className="enc-c enc-feria">
          <Icon n="pin" size={48} />
          <h2 className="titulo">Próxima feria</h2>
          <p>Las fechas cambian cada mes. Preguntale a Andrea dónde va a estar.</p>
          <a className="btn" href={`https://wa.me/${WHATSAPP}?text=${feria}`} target="_blank" rel="noopener noreferrer">Preguntar por la próxima feria</a>
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
