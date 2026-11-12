"use client";

import Link from "next/link";
import { useState } from "react";
import Reveal, { Words } from "./Reveal";

type Item = { nombre: string; foto: string; piezas: number };

/** Índice de colecciones: los nombres son la navegación; la foto cambia con la que se señala. */
export default function Colecciones({ items }: { items: Item[] }) {
  const [activa, setActiva] = useState(0);
  if (!items.length) return null;
  return (
    <section className="cols wrap" aria-labelledby="cols-t">
      <Reveal kind="words" as="h2" className="titulo"><span id="cols-t"><Words text="Colecciones" /></span></Reveal>
      <Link className="link-ic cols-todas" href="/colecciones">Ver las colecciones</Link>
      <div className="cols-grid">
        <ul className="cols-lista">
          {items.map((c, i) => (
            <Reveal as="li" kind="line" delay={i * 70} key={c.nombre}>
              <Link
                href={`/colecciones/${c.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`}
                className={i === activa ? "is-on" : ""}
                onMouseEnter={() => setActiva(i)}
                onFocus={() => setActiva(i)}
              >
                <span>{c.nombre}</span>
                <small>{c.piezas} {c.piezas === 1 ? "pieza" : "piezas"}</small>
              </Link>
            </Reveal>
          ))}
        </ul>
        <div className="cols-foto" aria-hidden data-n={items.length}>
          {items.map((c, i) => (
            <img key={c.nombre} src={c.foto} alt="" loading="lazy" className={i === activa ? "is-on" : ""} />
          ))}
        </div>
      </div>
    </section>
  );
}
