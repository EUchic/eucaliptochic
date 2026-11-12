"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Carrusel horizontal: se arrastra con el dedo o el mouse, o se usa con las flechas. La línea marca el avance. */
export default function Rail({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [max, setMax] = useState(1);

  useEffect(() => {
    const el = ref.current!;
    const upd = () => {
      const m = el.scrollWidth - el.clientWidth;
      setMax(m);
      setP(m > 0 ? el.scrollLeft / m : 0);
    };
    upd();
    el.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);

    // Arrastre con mouse
    let down = false, sx = 0, sl = 0, moved = false;
    const md = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; down = true; moved = false; sx = e.clientX; sl = el.scrollLeft; };
    const mm = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 6) { moved = true; el.classList.add("is-drag"); }
      el.scrollLeft = sl - dx;
    };
    const mu = () => { down = false; setTimeout(() => el.classList.remove("is-drag"), 0); };
    const click = (e: MouseEvent) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } };
    el.addEventListener("pointerdown", md);
    window.addEventListener("pointermove", mm);
    window.addEventListener("pointerup", mu);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("scroll", upd);
      window.removeEventListener("resize", upd);
      el.removeEventListener("pointerdown", md);
      window.removeEventListener("pointermove", mm);
      window.removeEventListener("pointerup", mu);
      el.removeEventListener("click", click, true);
    };
  }, []);

  const go = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="rail">
      <div className="rail-track" ref={ref} role="region" aria-label={label} tabIndex={0}>
        {children}
      </div>
      <div className="rail-ctl">
        <span className="rail-bar"><i style={{ transform: `scaleX(${0.12 + p * 0.88})` }} /></span>
        <button onClick={() => go(-1)} disabled={p <= 0.01} aria-label="Piezas anteriores">←</button>
        <button onClick={() => go(1)} disabled={max <= 0 || p >= 0.99} aria-label="Piezas siguientes">→</button>
      </div>
    </div>
  );
}
