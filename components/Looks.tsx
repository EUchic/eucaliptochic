"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

type Look = { img: string; fondo: string; piezas: { nombre: string; href: string | null; precio: string | null }[] };

/** Looks apilados: al bajar, cada look entra desde abajo y cae sobre el anterior. A la izquierda, las piezas del look activo. */
export default function Looks({ looks }: { looks: Look[] }) {
  const ref = useRef<HTMLElement>(null);
  const [activo, setActivo] = useState(0);
  const n = looks.length;

  useEffect(() => {
    const el = ref.current!;
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / span));
      const pos = p * (n - 0.6); // cuántas tarjetas han caído
      el.querySelectorAll<HTMLElement>(".lk-carta").forEach((c, k) => {
        const t = quiet ? (k <= Math.round(pos) ? 1 : 0) : Math.min(1, Math.max(0, pos - k + 1));
        const e = 1 - Math.pow(1 - t, 3);
        const bajo = Math.max(0, pos - k - 1); // cuánto la tapa la siguiente
        c.style.transform = `translate3d(0, ${((1 - e) * 115).toFixed(2)}vh, 0) rotate(${(Number(c.dataset.r) * e).toFixed(2)}deg) scale(${(1 - Math.min(bajo, 3) * 0.035).toFixed(3)})`;
        c.style.filter = bajo > 0 ? `brightness(${(1 - Math.min(bajo, 2) * 0.12).toFixed(2)})` : "";
      });
      setActivo(Math.min(n - 1, Math.max(0, Math.floor(pos + 0.35))));
      el.style.setProperty("--fondo", looks[Math.min(n - 1, Math.max(0, Math.floor(pos + 0.35)))].fondo);
    };
    const on = () => (raf ||= requestAnimationFrame(tick));
    tick();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [looks, n]);

  const l = looks[activo];
  return (
    <section className="lk" ref={ref} style={{ "--n": n } as CSSProperties} aria-labelledby="lk-t">
      <div className="lk-pin wrap">
        <div className="lk-txt">
          <h2 id="lk-t" className="titulo">Cómo se combina</h2>
          <p className="lk-cuenta" aria-live="polite">Look {activo + 1} de {n}</p>
          <ul className="lk-piezas" key={activo}>
            {l.piezas.map((p, i) => (
              <li key={p.nombre} style={{ "--i": i } as CSSProperties}>
                {p.href ? (
                  <Link href={p.href}><span>{p.nombre}</span>{p.precio && <small>{p.precio}</small>}</Link>
                ) : (
                  <span>{p.nombre}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="lk-mazo">
          {looks.map((x, k) => (
            <figure className="lk-carta" key={x.img} data-r={[-4, 3, -2, 4, -3, 2][k % 6]} style={{ zIndex: k + 1 }}>
              <img src={x.img} alt={`Look: ${x.piezas.map((p) => p.nombre).join(" y ")}`} loading={k < 2 ? "eager" : "lazy"} />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
