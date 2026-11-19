"use client";

import { useMemo, useState } from "react";
import { norm, type Accion, type Pieza } from "@/lib/asistente";
import Icon from "./Icon";

/**
 * Colecciones en el panel: cada colección con sus prendas. Andrea crea una colección (con varias prendas
 * de una), le mete prendas o se las saca tocándolas. Una colección sale en la página cuando tiene prendas.
 */

type G = (a: Accion[], msg?: string) => Promise<boolean>;
const nid = () => crypto.randomUUID();

/** Rejilla para escoger varias prendas tocándolas. */
function Escoger({ piezas, elegidas, set, nota }: { piezas: Pieza[]; elegidas: string[]; set: (s: string[]) => void; nota?: (p: Pieza) => string }) {
  const [q, setQ] = useState("");
  const lista = piezas.filter((p) => norm(p.nombre).includes(norm(q)));
  return (
    <>
      <label className="pn-buscar"><Icon n="buscar" s={22} /><input type="search" placeholder="Buscar una prenda" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <ul className="co-escoger">
        {lista.map((p) => {
          const on = elegidas.includes(p.slug);
          return (
            <li key={p.slug}>
              <button className={on ? "is-on" : ""} aria-pressed={on} onClick={() => set(on ? elegidas.filter((s) => s !== p.slug) : [...elegidas, p.slug])}>
                {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : <span className="co-sinfoto"><Icon n="foto" s={22} /></span>}
                {on && <span className="co-check"><Icon n="check" s={18} /></span>}
                <b>{p.nombre}</b>
                {nota && <small>{nota(p)}</small>}
              </button>
            </li>
          );
        })}
        {!lista.length && <li className="pn-vacio">No hay prendas así.</li>}
      </ul>
    </>
  );
}

export default function ColeccionesPanel({ todas, colecciones, guardar }: { todas: Pieza[]; colecciones: string[]; guardar: G }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [metiendo, setMetiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Todas las colecciones (también las que todavía no tienen prendas), las que tienen más primero.
  const grupos = useMemo(() => {
    const nombres = [...new Set([...colecciones, ...todas.map((p) => p.coleccion).filter(Boolean)])];
    return nombres
      .map((c) => ({ nombre: c, piezas: todas.filter((p) => p.coleccion === c) }))
      .sort((a, b) => (b.piezas.length ? 1 : 0) - (a.piezas.length ? 1 : 0));
  }, [colecciones, todas]);
  const sinColeccion = todas.filter((p) => !p.coleccion);
  const existe = (n: string) => grupos.find((g) => norm(g.nombre) === norm(n));

  async function crear() {
    const n = nombre.trim().replace(/\s+/g, " ");
    if (n.length < 2) return;
    const ya = existe(n);
    const col = ya?.nombre ?? n;
    const acciones: Accion[] = [
      ...(ya ? [] : [{ id: nid(), tipo: "coleccion" as const, nombre: col }]),
      ...elegidas.map((s) => { const p = todas.find((x) => x.slug === s)!; return { id: nid(), tipo: "mover" as const, slug: p.slug, nombre: p.nombre, coleccion: col }; }),
    ];
    if (!acciones.length) { setCreando(false); setAbierta(col); return; }
    setOcupado(true);
    const ok = await guardar(acciones, elegidas.length
      ? `Listo, la colección ${col} quedó con ${elegidas.length === 1 ? "1 prenda" : `${elegidas.length} prendas`} y ya sale en la página.`
      : `Listo, creé la colección ${col}. Metele prendas para que salga en la página.`);
    setOcupado(false);
    if (ok) { setCreando(false); setNombre(""); setElegidas([]); setAbierta(col); }
  }

  async function meter(col: string) {
    if (!elegidas.length) return;
    setOcupado(true);
    const ok = await guardar(
      elegidas.map((s) => { const p = todas.find((x) => x.slug === s)!; return { id: nid(), tipo: "mover", slug: p.slug, nombre: p.nombre, coleccion: col }; }),
      elegidas.length === 1 ? `Listo, metí 1 prenda en ${col}.` : `Listo, metí ${elegidas.length} prendas en ${col}.`,
    );
    setOcupado(false);
    if (ok) { setMetiendo(false); setElegidas([]); }
  }

  const sacar = (p: Pieza) => guardar([{ id: nid(), tipo: "mover", slug: p.slug, nombre: p.nombre, coleccion: "" }], `${p.nombre} salió de ${p.coleccion}.`);

  return (
    <div className="co" data-guia="colecciones">
      {creando ? (
        <div className="pn-tarjeta co-crear">
          <h2 className="co-titulo">Colección nueva</h2>
          <label className="pn-campo"><span>Nombre</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Viajando por el mundo" maxLength={40} autoFocus /></label>
          {nombre.trim() && existe(nombre) && <p className="pn-nota">Ya existe la colección {existe(nombre)!.nombre}; las prendas que escojás entran ahí.</p>}
          <p className="pn-etq">¿Qué prendas van? Tocalas (podés escoger después)</p>
          <Escoger piezas={todas} elegidas={elegidas} set={setElegidas} nota={(p) => p.coleccion ? `Ahora en ${p.coleccion}` : "Sin colección"} />
          <div className="pn-botones is-columna co-pie">
            <button className="pn-btn is-grande" disabled={nombre.trim().length < 2 || ocupado} onClick={crear}>
              <Icon n="check" s={24} />{ocupado ? "Guardando…" : elegidas.length ? `Crear con ${elegidas.length === 1 ? "1 prenda" : `${elegidas.length} prendas`}` : "Crear la colección"}
            </button>
            <button className="pn-btn is-gris" disabled={ocupado} onClick={() => { setCreando(false); setElegidas([]); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button className="pn-btn is-grande" onClick={() => { setCreando(true); setAbierta(null); setMetiendo(false); setElegidas([]); }}><Icon n="mas" s={24} />Crear una colección</button>
      )}

      <ul className="co-lista">
        {grupos.map((g) => {
          const abierto = abierta === g.nombre;
          return (
            <li key={g.nombre} className={"pn-tarjeta co-col" + (abierto ? " is-abierta" : "")}>
              <button className="co-cab" onClick={() => { setAbierta(abierto ? null : g.nombre); setMetiendo(false); setElegidas([]); }} aria-expanded={abierto}>
                <span className="co-fotos" aria-hidden>
                  {g.piezas.slice(0, 3).map((p) => (p.foto ? <img key={p.slug} src={p.foto} alt="" loading="lazy" /> : <span key={p.slug} className="co-sinfoto" />))}
                  {!g.piezas.length && <span className="co-vacia"><Icon n="capas" s={22} /></span>}
                </span>
                <span className="co-txt">
                  <b>{g.nombre}</b>
                  <small>{g.piezas.length ? `${g.piezas.length} ${g.piezas.length === 1 ? "prenda" : "prendas"}` : "Sin prendas: no sale en la página"}</small>
                </span>
                <Icon n="flecha" s={20} />
              </button>

              {abierto && (
                <div className="co-cuerpo">
                  {metiendo ? (
                    <>
                      <p className="pn-etq">Tocá las prendas que van en {g.nombre}</p>
                      <Escoger piezas={todas.filter((p) => p.coleccion !== g.nombre)} elegidas={elegidas} set={setElegidas} nota={(p) => p.coleccion ? `Ahora en ${p.coleccion}` : "Sin colección"} />
                      <div className="pn-botones is-columna co-pie">
                        <button className="pn-btn is-grande" disabled={!elegidas.length || ocupado} onClick={() => meter(g.nombre)}>
                          <Icon n="check" s={24} />{ocupado ? "Guardando…" : elegidas.length ? `Meter ${elegidas.length === 1 ? "1 prenda" : `${elegidas.length} prendas`}` : "Escogé las prendas"}
                        </button>
                        <button className="pn-btn is-gris" disabled={ocupado} onClick={() => { setMetiendo(false); setElegidas([]); }}>Cancelar</button>
                      </div>
                    </>
                  ) : (
                    <>
                      {g.piezas.length > 0 ? (
                        <ul className="co-piezas">
                          {g.piezas.map((p) => (
                            <li key={p.slug}>
                              {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : <span className="co-sinfoto"><Icon n="foto" s={22} /></span>}
                              <b>{p.nombre}</b>
                              <button className="co-sacar" onClick={() => sacar(p)} aria-label={`Sacar ${p.nombre} de ${g.nombre}`}><Icon n="cerrar" s={16} />Sacar</button>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="pn-nota">Esta colección todavía no tiene prendas. Cuando le metás una, sale en la página.</p>}
                      <button className="pn-btn is-tinte" onClick={() => { setMetiendo(true); setElegidas([]); }}><Icon n="mas" s={22} />Meter prendas a {g.nombre}</button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {sinColeccion.length > 0 && <p className="pn-nota co-sin">{sinColeccion.length === 1 ? "1 prenda no está" : `${sinColeccion.length} prendas no están`} en ninguna colección.</p>}
    </div>
  );
}
