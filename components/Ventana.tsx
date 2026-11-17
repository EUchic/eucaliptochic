"use client";

import { useEffect, useRef } from "react";

/**
 * "Ventana EU": la foto solo se ve a través de las letras del logo. Al bajar, el logo crece y la cámara
 * entra por el trazo de la E hasta que la foto llena la pantalla; ahí aparece el texto.
 */
const RATIO = 600 / 999; // alto / ancho de /logo/eu.png
const STEM = 0.0445; // centro del trazo vertical de la E, en fracción del ancho del logo

export default function Ventana({ foto, set, alt, frase, firma }: { foto: string; set: string; alt: string; frase: string; firma: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = quiet ? 1 : Math.min(1, Math.max(0, -r.top / span));
      const vw = window.innerWidth, vh = window.innerHeight;
      const w0 = Math.min(vw * 0.78, vh * 1.1);
      const z = Math.min(1, p / 0.72); // tramo del zoom
      const e = z * z * (3 - 2 * z); // suavizado
      const W = w0 * Math.exp(Math.log(46) * e);
      const a = Math.min(1, e * 3.2);
      const anchor = 0.5 + (STEM - 0.5) * (a * a * (3 - 2 * a)); // llega al trazo de la E antes de crecer mucho
      el.style.setProperty("--mw", W.toFixed(1) + "px");
      el.style.setProperty("--mx", (vw / 2 - anchor * W).toFixed(1) + "px");
      el.style.setProperty("--my", (vh / 2 - (RATIO * W) / 2).toFixed(1) + "px");
      el.style.setProperty("--p", p.toFixed(4));
    };
    const on = () => (raf ||= requestAnimationFrame(tick));
    tick();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);

  return (
    <section className="ven" ref={ref} aria-label={frase}>
      <div className="ven-pin">
        <div className="ven-foto">
          <img src={foto} srcSet={set} sizes="100vw" alt={alt} loading="lazy" />
        </div>
        <div className="ven-lleno" aria-hidden>
          <img src={foto} srcSet={set} sizes="100vw" alt="" loading="lazy" />
        </div>
        <p className="ven-arriba" aria-hidden>Eucalipto Chic</p>
        <div className="ven-txt">
          <p className="ven-frase">{frase}</p>
          <p className="ven-firma">{firma}</p>
        </div>
      </div>
    </section>
  );
}
