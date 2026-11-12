"use client";

import { useState } from "react";
import { useCart } from "./Cart";

type P = { slug: string; nombre: string; precio: number; fotos: { full: string; set: string; thumb: string }[]; tallas: string[]; colores: string[] };

export function Galeria({ fotos, nombre }: { fotos: P["fotos"]; nombre: string }) {
  const [i, setI] = useState(0);
  return (
    <div className="gal">
      <div className="gal-main">
        <img src={fotos[i].full} srcSet={fotos[i].set} sizes="(max-width: 900px) 100vw, 52vw" alt={`${nombre}, foto ${i + 1}`} />
      </div>
      {fotos.length > 1 && (
        <div className="gal-thumbs" role="group" aria-label="Más fotos">
          {fotos.map((f, n) => (
            <button key={f.thumb} onClick={() => setI(n)} aria-label={`Ver foto ${n + 1}`} aria-pressed={n === i}>
              <img src={f.thumb} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Comprar({ p }: { p: P }) {
  const { add } = useCart();
  const [talla, setTalla] = useState(p.tallas.length === 1 ? p.tallas[0] : "");
  const [color, setColor] = useState(p.colores.length === 1 ? p.colores[0] : "");
  const [aviso, setAviso] = useState("");
  const falta = !talla ? "Elegí una talla" : p.colores.length && !color ? "Elegí un color" : "";

  return (
    <div className="comprar">
      <fieldset>
        <legend>Talla</legend>
        <div className="chips">
          {p.tallas.map((t) => (
            <label key={t} className={t === talla ? "is-on" : ""}>
              <input type="radio" name="talla" value={t} checked={t === talla} onChange={() => { setTalla(t); setAviso(""); }} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      {p.colores.length > 0 && (
        <fieldset>
          <legend>Color</legend>
          <div className="chips">
            {p.colores.map((c) => (
              <label key={c} className={c === color ? "is-on" : ""}>
                <input type="radio" name="color" value={c} checked={c === color} onChange={() => { setColor(c); setAviso(""); }} />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button
        className="btn btn-full"
        onClick={() => {
          if (falta) return setAviso(falta + " para agregarla a la bolsa.");
          add({ slug: p.slug, nombre: p.nombre, precio: p.precio, foto: p.fotos[0].thumb, talla, color: color || null });
        }}
      >
        Agregar a la bolsa
      </button>
      <p className="aviso" role="status">{aviso}</p>
    </div>
  );
}
