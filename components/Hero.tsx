"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Mark } from "./Logo";

/**
 * Portada: las letras del logo real (E y U) se abren como una cortina al bajar y dejan la foto al frente.
 * La foto se puede cambiar luego por el video de Google Flow.
 */
export default function Hero({ foto, srcSet, nombre, href }: { foto: string; srcSet: string; nombre: string; href: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      el.style.setProperty("--p", p.toFixed(4));
      el.classList.toggle("is-fin", p > 0.65);
    };
    const onScroll = () => (raf ||= requestAnimationFrame(tick));
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="hero" ref={ref}>
      <div className="hero-pin">
        <span className="hero-letra hero-e"><Mark part="e" /></span>
        <Link className="hero-foto" href={href} aria-label={`Ver ${nombre}`} data-cursor="Ver">
          <img src={foto} srcSet={srcSet} sizes="(max-width: 700px) 70vw, 40vw" alt={nombre} fetchPriority="high" />
        </Link>
        <span className="hero-letra hero-u"><Mark part="u" /></span>
        <h1 className="hero-marca">
          <span className="sr">Eucalipto Chic</span>
          <Mark part="chic" />
        </h1>
        <p className="hero-firma">By Andrea Bermúdez</p>
        <Link className="hero-pieza" href={href}>{nombre}</Link>
        <span className="hero-baja" aria-hidden>Bajá</span>
      </div>
    </section>
  );
}
