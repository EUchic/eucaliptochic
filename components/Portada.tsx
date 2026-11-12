"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "./Icons";
import { Mark } from "./Logo";

export type Slide = { nombre: string; tipo: string; precio: string; href: string; foto: string; set: string };

/** Portada tipo lookbook: una pieza a la vez, cambia sola cada 6 s (se detiene al pasar el mouse) o con las marcas. */
export default function Portada({ slides, video }: { slides: Slide[]; video?: string }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const n = slides.length;

  useEffect(() => {
    if (pausa || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((v) => (v + 1) % n), 6000);
    return () => clearTimeout(t);
  }, [i, pausa, n]);

  const s = slides[i];
  return (
    <section className="port" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}>
      <span className="port-agua" aria-hidden><Mark part="eu" /></span>

      <div className="port-txt">
        <p className="port-tipo" key={"t" + i}>{s.tipo}, pieza {i + 1} de {n}</p>
        <h1 className="port-nombre" key={"n" + i}>
          {s.nombre.split(" ").map((w, k) => [
            <span className="w" key={k}><span style={{ animationDelay: `${k * 90}ms` }}>{w}</span></span>,
            " ",
          ])}
        </h1>
        <p className="port-precio" key={"p" + i}>{s.precio}</p>
        <div className="port-cta">
          <Link className="btn btn-claro" href={s.href}>Ver esta pieza <Icon n="flecha" size={20} /></Link>
          <Link className="link" href="/tienda">Toda la tienda</Link>
        </div>
        <div className="port-marcas" role="tablist" aria-label="Piezas de portada">
          {slides.map((x, k) => (
            <button key={x.href} role="tab" aria-selected={k === i} aria-label={x.nombre} onClick={() => setI(k)}>
              <i className={k === i && !pausa ? "corre" : ""} />
            </button>
          ))}
        </div>
      </div>

      <Link className="port-foto" href={s.href} data-cursor="Ver" aria-label={`Ver ${s.nombre}`}>
        {video ? (
          <video src={video} autoPlay muted loop playsInline />
        ) : (
          slides.map((x, k) => (
            <img key={x.href} className={k === i ? "is-on" : ""} src={x.foto} srcSet={x.set} sizes="(max-width: 800px) 88vw, 42vw" alt={k === i ? x.nombre : ""} fetchPriority={k === 0 ? "high" : "low"} />
          ))
        )}
      </Link>

      <button className="port-sig" onClick={() => setI((i + 1) % n)} aria-label={`Siguiente: ${slides[(i + 1) % n].nombre}`}>
        <img src={slides[(i + 1) % n].foto} alt="" />
        <span>Sigue<br /><b>{slides[(i + 1) % n].nombre}</b></span>
      </button>
    </section>
  );
}
