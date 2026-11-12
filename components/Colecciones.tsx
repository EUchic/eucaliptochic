"use client";

import { useState } from "react";

type Item = { nombre: string; foto: string; piezas: number };

/** Índice de colecciones: los nombres son la navegación; la foto cambia con la que se señala. */
export default function Colecciones({ items }: { items: Item[] }) {
  const [activa, setActiva] = useState(0);
  if (!items.length) return null;
  return (
    <section className="cols wrap" aria-labelledby="cols-t">
      <h2 id="cols-t" className="titulo">Colecciones</h2>
      <div className="cols-grid">
        <ul className="cols-lista">
          {items.map((c, i) => (
            <li key={c.nombre}>
              <a
                href={`/tienda?coleccion=${encodeURIComponent(c.nombre)}`}
                className={i === activa ? "is-on" : ""}
                onMouseEnter={() => setActiva(i)}
                onFocus={() => setActiva(i)}
              >
                <span>{c.nombre}</span>
                <small>{c.piezas} {c.piezas === 1 ? "pieza" : "piezas"}</small>
              </a>
            </li>
          ))}
        </ul>
        <div className="cols-foto" aria-hidden>
          {items.map((c, i) => (
            <img key={c.nombre} src={c.foto} alt="" loading="lazy" className={i === activa ? "is-on" : ""} />
          ))}
        </div>
      </div>
    </section>
  );
}
