"use client";

import { useEffect, useRef } from "react";

/**
 * Efectos globales, un solo listener para todo el sitio:
 *  - el menú se esconde al bajar y vuelve al subir
 *  - [data-speed] se mueve a otra velocidad que el scroll (parallax)
 *  - sobre fotos con [data-cursor], un círculo de vidrio con una flecha sigue al mouse (solo con mouse)
 */
export default function Fx() {
  const cur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    let last = window.scrollY, raf = 0;

    const frame = () => {
      raf = 0;
      const y = window.scrollY;
      root.toggleAttribute("data-nav-off", y > last && y > 500);
      root.toggleAttribute("data-top", y < 40);
      last = y;
      if (quiet) return;
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>("[data-speed]").forEach((el) => {
        const r = el.parentElement!.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const mid = r.top + r.height / 2 - vh / 2;
        el.style.transform = `translate3d(0, ${(mid * Number(el.dataset.speed)).toFixed(1)}px, 0)`;
      });
    };
    const onScroll = () => (raf ||= requestAnimationFrame(frame));
    frame();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    const c = cur.current;
    let x = 0, y = 0, tx = 0, ty = 0, loop = 0;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !quiet;
    const move = (e: PointerEvent) => {
      tx = e.clientX; ty = e.clientY;
      const hit = (e.target as HTMLElement).closest?.("[data-cursor]") as HTMLElement | null;
      if (c) {
        c.classList.toggle("is-on", !!hit);
      }
    };
    const follow = () => {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      if (c) c.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      loop = requestAnimationFrame(follow);
    };
    if (fine) {
      window.addEventListener("pointermove", move, { passive: true });
      loop = requestAnimationFrame(follow);
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(loop);
    };
  }, []);

  return (
    <div className="cursor" ref={cur} aria-hidden>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
    </div>
  );
}
