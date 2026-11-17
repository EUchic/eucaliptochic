"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type Props = { children: ReactNode; kind?: "up" | "img" | "words" | "line" | "logo"; delay?: number; className?: string; as?: "div" | "span" | "li" | "p" | "h1" | "h2" };

/** Aparece cuando entra en pantalla. `kind` elige el gesto: subir, destapar foto, palabra por palabra o línea. */
export default function Reveal({ children, kind = "up", delay = 0, className = "", as: Tag = "div" }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.dataset.in = "1";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const T = Tag as any;
  return (
    <T ref={ref} className={`rv rv-${kind} ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </T>
  );
}

export function Words({ text }: { text: string }) {
  const ws = text.split(" ");
  return (
    <>
      {ws.map((w, i) => [
        <span className="w" key={i}>
          <span style={{ "--i": i } as CSSProperties}>{w}</span>
        </span>,
        i < ws.length - 1 ? " " : null,
      ])}
    </>
  );
}
