"use client";

import { useCart } from "./Cart";
import Icon from "./Icon";

/** Sobre la foto: elegir la talla agrega la pieza a la bolsa sin salir de la página. */
export default function QuickAdd({ slug, nombre, precio, foto, tallas }: { slug: string; nombre: string; precio: number; foto: string; tallas: string[] }) {
  const { add } = useCart();
  return (
    <div className="quick" role="group" aria-label={`Agregar ${nombre} a la bolsa`}>
      <span><Icon n="bolsa" s={20} /> Agregar</span>
      {tallas.map((t) => (
        <button key={t} onClick={() => add({ slug, nombre, precio, foto, talla: t, color: null })} aria-label={`Agregar talla ${t}`}>
          {t === "Talla única" ? "Única" : t}
        </button>
      ))}
    </div>
  );
}
