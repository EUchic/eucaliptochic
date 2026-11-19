"use client";

import { useEffect, useState } from "react";
import { categoriasDe, fmt, hoy, type Accion, type Datos, type Pieza, type Talla } from "@/lib/asistente";
import type { Seccion } from "@/lib/cerebro";
import type { Pregunta } from "@/lib/revision";
import Icon from "./Icon";
import BuscarLugar from "./Lugar";
import { EditorTallas } from "./Tienda";

type G = (a: Accion[], msg?: string) => Promise<boolean>;
const nid = () => crypto.randomUUID();
const CLAVE = "euchic-revision-hoy";

/** "Tengo unas preguntitas": lo que se ve raro en el negocio, con botones para resolverlo en un toque. */
export default function Revision({ preguntas, d, piezas, guardar, irA, abrirFoto, preguntarAlAsistente }: {
  preguntas: Pregunta[]; d: Datos; piezas: Pieza[]; guardar: G; irA: (s: Seccion) => void;
  abrirFoto: (slug: string) => void; preguntarAlAsistente: (t: string) => void;
}) {
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem(CLAVE) ?? "{}"); if (g.dia === hoy()) setOcultas(g.claves ?? []); } catch {}
  }, []);
  const ocultar = (c: string) => {
    const n = [...ocultas, c];
    setOcultas(n); setAbierta(null);
    try { localStorage.setItem(CLAVE, JSON.stringify({ dia: hoy(), claves: n })); } catch {}
  };
  const estaBien = (c: string) => {
    const ok = [...((d.ajustes.panel_revision_ok as string[] | undefined) ?? []), c].slice(-300);
    guardar([{ id: nid(), tipo: "ajuste", clave: "panel_revision_ok", valor: ok }], "");
    ocultar(c);
  };
  const lista = preguntas.filter((p) => !ocultas.includes(p.clave)).slice(0, 3);
  if (!lista.length) return null;

  return (
    <div className="rv">
      <p className="rv-cab"><Icon n="campana" s={20} />{lista.length === 1 ? "Tengo una preguntita" : `Tengo ${lista.length} preguntitas`}</p>
      <ul>
        {lista.map((p) => (
          <li key={p.clave} className={abierta === p.clave ? "is-abierta" : ""}>
            <button className="rv-texto" onClick={() => setAbierta(abierta === p.clave ? null : p.clave)} aria-expanded={abierta === p.clave}>
              <span>{p.texto}</span><Icon n={abierta === p.clave ? "cerrar" : "flecha"} s={18} />
            </button>
            {abierta === p.clave && (
              <div className="rv-resolver">
                <Resolver p={p} d={d} piezas={piezas} guardar={guardar} listo={() => ocultar(p.clave)} irA={irA} abrirFoto={abrirFoto} preguntarAlAsistente={preguntarAlAsistente} />
                <div className="rv-luego">
                  <button className="pn-txt" onClick={() => ocultar(p.clave)}>Ahora no</button>
                  {p.que !== "fotos_ia" && <button className="pn-txt" onClick={() => estaBien(p.clave)}>Está bien así</button>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Resolver({ p, d, piezas, guardar, listo, irA, abrirFoto, preguntarAlAsistente }: {
  p: Pregunta; d: Datos; piezas: Pieza[]; guardar: G; listo: () => void; irA: (s: Seccion) => void; abrirFoto: (slug: string) => void; preguntarAlAsistente: (t: string) => void;
}) {
  const pieza = piezas.find((x) => x.slug === p.slug);
  const [precio, setPrecio] = useState("");
  const [tallas, setTallas] = useState<Talla[]>(pieza?.tallas ?? []);
  switch (p.que) {
    case "fotos_ia": return <button className="pn-btn" onClick={() => { irA("tienda"); listo(); }}><Icon n="chispa" s={22} />Revisar las fotos</button>;
    case "foto": return <button className="pn-btn" onClick={() => { abrirFoto(p.slug!); listo(); }}><Icon n="foto" s={22} />Subir la foto</button>;
    case "precio": return pieza ? (
      <form className="rv-fila" onSubmit={async (e) => { e.preventDefault(); const v = Number(precio.replace(/\D/g, "")); if (v && await guardar([{ id: nid(), tipo: "precio", slug: pieza.slug, nombre: pieza.nombre, precio: v }], `Listo, ${pieza.nombre} a ${fmt(v)}.`)) listo(); }}>
        <span className="pn-con-prefijo"><span>₡</span><input inputMode="numeric" autoFocus value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " "))} placeholder="0" aria-label="Precio" /></span>
        <button className="pn-btn" disabled={!Number(precio.replace(/\D/g, ""))}>Guardar</button>
      </form>
    ) : null;
    case "existencias": return pieza ? (
      <>
        <EditorTallas tallas={tallas} set={setTallas} />
        <button className="pn-btn" disabled={!tallas.length} onClick={async () => { if (await guardar([{ id: nid(), tipo: "tallas", slug: pieza.slug, nombre: pieza.nombre, tallas }], "¡Gracias! Ya lo anoté.")) listo(); }}><Icon n="check" s={22} />Guardar</button>
      </>
    ) : null;
    case "categoria": {
      const m = d.movs.find((x) => x.id === p.mov);
      if (!m) return null;
      return (
        <div className="pn-chips">{categoriasDe(d, "gasto").filter((c) => c !== "Otro").map((c) => (
          <button key={c} onClick={async () => {
            const { crc: _c, anulado: _a, creado: _cr, ...base } = m;
            void _c; void _a; void _cr;
            if (await guardar([{ id: nid(), tipo: "anular", mov: m.id, nombre: m.concepto }, { ...base, id: nid(), categoria: c }], `Listo, ese gasto queda en ${c}.`)) listo();
          }}>{c}</button>
        ))}</div>
      );
    }
    case "feria_lugar": {
      const f = d.ferias.find((x) => x.id === p.feria);
      if (!f) return null;
      return <BuscarLugar valor={null} alElegir={async (l) => { if (l && await guardar([{ id: nid(), tipo: "feria_lugar", feria: f.id, nombre: f.nombre, lugar: l.nombre, direccion: l.direccion, lat: l.lat, lng: l.lng }], "Lugar guardado. Ya sale cómo llegar en la página.")) listo(); }} />;
    }
    case "feria_ventas": case "sin_movs":
      return <button className="pn-btn" onClick={() => { preguntarAlAsistente(p.chat ?? p.texto); listo(); }}><Icon n="mic" s={22} />Contárselo al asistente</button>;
  }
}
