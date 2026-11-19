"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/lib/catalog";
import Icon from "./Icons";

type Orden = "nuevo" | "menor" | "mayor" | "nombre";

/** Tienda: filtros al instante (sin recargar), búsqueda, orden y dos tamaños de vista. Las tarjetas llegan ya armadas del servidor. */
export default function TiendaGrid({ items, cards, inicial }: { items: Product[]; cards: Record<string, React.ReactNode>; inicial: { tipo?: string; coleccion?: string } }) {
  const [tipo, setTipo] = useState(inicial.tipo ?? "");
  const [col, setCol] = useState(inicial.coleccion ?? "");
  const [talla, setTalla] = useState("");
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<Orden>("nuevo");
  const [vista, setVista] = useState<"amplia" | "compacta">("amplia");
  const [panel, setPanel] = useState(false);

  const cuenta = (f: (p: Product) => boolean) => items.filter(f).length;
  const tipos = [...new Set(items.map((p) => p.tipo))];
  const cols = [...new Set(items.map((p) => p.coleccion).filter(Boolean) as string[])];
  const tallas = [...new Set(items.flatMap((p) => p.tallas))];

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = items.filter(
      (p) => (!tipo || p.tipo === tipo) && (!col || p.coleccion === col) && (!talla || p.tallas.includes(talla)) && (!t || p.nombre.toLowerCase().includes(t)),
    );
    if (orden === "menor") l.sort((a, b) => a.precio - b.precio);
    if (orden === "mayor") l.sort((a, b) => b.precio - a.precio);
    if (orden === "nombre") l.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return l;
  }, [items, tipo, col, talla, q, orden]);

  const activos = [tipo, col, talla, q].filter(Boolean).length;
  const limpiar = () => { setTipo(""); setCol(""); setTalla(""); setQ(""); };
  const Grupo = ({ titulo, valor, set, ops, f }: { titulo: string; valor: string; set: (v: string) => void; ops: string[]; f: (o: string) => (p: Product) => boolean }) => (
    <fieldset className="fil-grupo">
      <legend>{titulo}</legend>
      {ops.map((o) => (
        <button key={o} className={valor === o ? "is-on" : ""} aria-pressed={valor === o} onClick={() => set(valor === o ? "" : o)}>
          <span>{o}</span><small>{cuenta(f(o))}</small>
        </button>
      ))}
    </fieldset>
  );

  return (
    <div className="tienda-cuerpo">
      <aside className={"fil" + (panel ? " is-open" : "")} aria-label="Filtros">
        <div className="fil-top">
          <b>Filtrar</b>
          <button className="fil-cerrar" onClick={() => setPanel(false)} aria-label="Cerrar filtros"><Icon n="cerrar" /></button>
        </div>
        <label className="fil-busca">
          <Icon n="lupa" size={22} />
          <input type="search" placeholder="Buscar una pieza" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar una pieza" />
          {q && <button type="button" className="fil-borrar" onClick={() => setQ("")} aria-label="Borrar la búsqueda"><Icon n="cerrar" size={18} /></button>}
        </label>
        <Grupo titulo="Tipo de pieza" valor={tipo} set={setTipo} ops={tipos} f={(o) => (p) => p.tipo === o} />
        <Grupo titulo="Colección" valor={col} set={setCol} ops={cols} f={(o) => (p) => p.coleccion === o} />
        <Grupo titulo="Talla" valor={talla} set={setTalla} ops={tallas} f={(o) => (p) => p.tallas.includes(o)} />
        {activos > 0 && <button className="link fil-limpiar" onClick={limpiar}>Quitar filtros</button>}
        <button className="btn btn-full fil-ver" onClick={() => setPanel(false)}>Ver {lista.length} piezas</button>
      </aside>

      <div className="tienda-lista">
        <div className="barra">
          <button className="barra-fil" onClick={() => setPanel(true)}><Icon n="lupa" size={20} /> Filtrar{activos ? ` (${activos})` : ""}</button>
          <p aria-live="polite"><b>{lista.length}</b> {lista.length === 1 ? "pieza" : "piezas"}{tipo ? ` · ${tipo}` : ""}{col ? ` · ${col}` : ""}{talla ? ` · ${talla}` : ""}</p>
          <label className="barra-orden">
            <span className="sr">Ordenar</span>
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              <option value="nuevo">Lo más nuevo primero</option>
              <option value="menor">Precio: menor a mayor</option>
              <option value="mayor">Precio: mayor a menor</option>
              <option value="nombre">Nombre, A a Z</option>
            </select>
          </label>
          <div className="barra-vista" role="group" aria-label="Tamaño de las fotos">
            <button aria-pressed={vista === "amplia"} onClick={() => setVista("amplia")} aria-label="Fotos grandes"><Icon n="filas" size={22} /></button>
            <button aria-pressed={vista === "compacta"} onClick={() => setVista("compacta")} aria-label="Fotos pequeñas"><Icon n="cuadros" size={22} /></button>
          </div>
        </div>
        {lista.length ? (
          <div className={"grid grid-" + vista + (activos || orden !== "nuevo" ? "" : " grid-editorial")} key={tipo + col + talla + orden + vista}>
            {lista.map((p) => <div className="grid-item" key={p.slug}>{cards[p.slug]}</div>)}
          </div>
        ) : (
          <div className="vacio">
            <p>No hay piezas con esos filtros.</p>
            <button className="btn" onClick={limpiar}>Quitar filtros</button>
          </div>
        )}
      </div>
      {panel && <div className="scrim is-open" onClick={() => setPanel(false)} aria-hidden />}
    </div>
  );
}
