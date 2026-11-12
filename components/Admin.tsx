"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { Mark } from "./Logo";

type Pieza = { slug: string; nombre: string; precio: number; tipo: string; coleccion: string; foto: string; fotos: number; oculta?: boolean };
type Mov = { id: string; sentido: "ingreso" | "gasto"; monto: number; concepto: string; categoria: string; metodo: string; feria: string; fecha: string; anulado?: boolean };
type Feria = { id: string; nombre: string; fecha: string };
type Datos = { cambios: Record<string, Partial<Pieza>>; nuevas: Pieza[]; movs: Mov[]; ferias: Feria[] };

const VACIO: Datos = { cambios: {}, nuevas: [], movs: [], ferias: [] };
const KEY = "euchic-panel-v1";
const fmt = (n: number) => "₡" + Math.round(n).toLocaleString("es-CR").replace(/[.,]/g, " ");
const hoy = () => new Date().toISOString().slice(0, 10);
const CATS = { ingreso: ["Venta en feria", "Venta directa", "Venta web"], gasto: ["Tela", "Confección (Juanita)", "Feria", "Envíos", "Publicidad", "Otro"] };
const METODOS = ["SINPE", "Efectivo", "Datáfono", "Transferencia"];

/** Entiende una frase dictada: "pagué 45 mil a Juanita por sinpe", "vendí 3 blusas en la feria, 71 mil en efectivo". */
export function entender(texto: string): Partial<Mov> {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = t.match(/(\d[\d.,\s]*)\s*(mil|k)?/);
  let monto = m ? Number(m[1].replace(/[.,\s]/g, "")) : 0;
  if (m?.[2] && monto < 10000) monto *= 1000;
  const gasto = /(pague|compre|gaste|le di|cancele|costo|salio)/.test(t);
  const ingreso = /(vendi|me pagaron|entro|cobre|me hicieron|recibi)/.test(t);
  const sentido: Mov["sentido"] = gasto && !ingreso ? "gasto" : ingreso ? "ingreso" : /juanita|tela|stand|envio/.test(t) ? "gasto" : "ingreso";
  const categoria =
    sentido === "gasto"
      ? /juanita|confecc|costura|maquila/.test(t) ? "Confección (Juanita)" : /tela/.test(t) ? "Tela" : /feria|stand|espacio/.test(t) ? "Feria" : /envio|correos|mensajer/.test(t) ? "Envíos" : /pauta|anuncio|publicidad/.test(t) ? "Publicidad" : "Otro"
      : /feria/.test(t) ? "Venta en feria" : /web|pagina/.test(t) ? "Venta web" : "Venta directa";
  const metodo = /sinpe/.test(t) ? "SINPE" : /efectivo|cash/.test(t) ? "Efectivo" : /tarjeta|datafono|mipos/.test(t) ? "Datáfono" : /transfer/.test(t) ? "Transferencia" : "SINPE";
  return { sentido, monto, categoria, metodo, concepto: texto.trim() };
}

export default function Admin({ piezas, colecciones, tipos }: { piezas: Pieza[]; colecciones: string[]; tipos: string[] }) {
  const [tab, setTab] = useState<"resumen" | "piezas" | "plata" | "ferias">("resumen");
  const [d, setD] = useState<Datos>(VACIO);
  const [listo, setListo] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Partial<Mov> | null>(null);
  const [oyendo, setOyendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const rec = useRef<any>(null);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (s) setD({ ...VACIO, ...s }); } catch {}
    setListo(true);
  }, []);
  useEffect(() => { if (listo) try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }, [d, listo]);

  const todas = useMemo(() => [...d.nuevas, ...piezas].map((p) => ({ ...p, ...d.cambios[p.slug] })), [piezas, d]);
  const vista = todas.filter((p) => p.nombre.toLowerCase().includes(q.toLowerCase()));
  const cambia = (slug: string, c: Partial<Pieza>) => setD((x) => ({ ...x, cambios: { ...x.cambios, [slug]: { ...x.cambios[slug], ...c } } }));

  const mes = hoy().slice(0, 7);
  const vivos = d.movs.filter((m) => !m.anulado);
  const delMes = vivos.filter((m) => m.fecha.startsWith(mes));
  const suma = (l: Mov[], s: Mov["sentido"]) => l.filter((m) => m.sentido === s).reduce((a, m) => a + m.monto, 0);
  const entro = suma(delMes, "ingreso"), salio = suma(delMes, "gasto");

  const guardar = () => {
    if (!form?.monto || form.monto <= 0) return setAviso("Falta el monto.");
    const m: Mov = { id: crypto.randomUUID(), sentido: form.sentido ?? "gasto", monto: form.monto, concepto: form.concepto || form.categoria || "", categoria: form.categoria ?? "Otro", metodo: form.metodo ?? "SINPE", feria: form.feria ?? "", fecha: form.fecha ?? hoy() };
    setD((x) => ({ ...x, movs: [m, ...x.movs] }));
    setForm(null); setAviso("");
  };

  const dictar = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return setAviso("Este navegador no permite dictar. Probá en Chrome o Safari.");
    if (oyendo) return rec.current?.stop();
    const r = new SR(); rec.current = r;
    r.lang = "es-CR"; r.interimResults = false;
    r.onresult = (e: any) => { setForm({ fecha: hoy(), feria: "", ...entender(e.results[0][0].transcript) }); setTab("plata"); };
    r.onend = () => setOyendo(false);
    r.onerror = () => { setOyendo(false); setAviso("No se escuchó bien. Probá de nuevo o escribilo."); };
    setAviso(""); setOyendo(true); r.start();
  };

  const TABS = [["resumen", "Resumen", "casa"], ["piezas", "Piezas", "percha"], ["plata", "Plata", "moneda"], ["ferias", "Ferias", "carpa"]] as const;
  const Chips = ({ ops, v, set }: { ops: string[]; v?: string; set: (o: string) => void }) => (
    <div className="ad-chips">{ops.map((o) => <button key={o} type="button" className={v === o ? "is-on" : ""} onClick={() => set(o)}>{o}</button>)}</div>
  );
  const Lista = ({ l }: { l: Mov[] }) => l.length === 0 ? <p className="ad-nada">Todavía no hay movimientos. Tocá "Entró plata", "Salió plata" o "Dictar".</p> : (
    <ul className="ad-movs">
      {l.map((m) => (
        <li key={m.id} className={m.anulado ? "is-off" : ""}>
          <span className={"ad-signo " + m.sentido}><Icon n={m.sentido === "ingreso" ? "mas" : "menos"} s={22} /></span>
          <div><b>{m.concepto || m.categoria}</b><small>{m.categoria} · {m.metodo}{m.feria ? " · " + m.feria : ""} · {m.fecha}</small></div>
          <strong>{m.sentido === "gasto" ? "−" : "+"}{fmt(m.monto)}</strong>
          {!m.anulado && <button onClick={() => setD((x) => ({ ...x, movs: x.movs.map((y) => (y.id === m.id ? { ...y, anulado: true } : y)) }))}>Anular</button>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="ad">
      <aside className="ad-lado">
        <a href="/" className="ad-logo" aria-label="Ver la tienda"><Mark part="full" /></a>
        <nav>{TABS.map(([k, t, ic]) => <button key={k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}><Icon n={ic} s={28} /><span>{t}</span></button>)}</nav>
        <a className="ad-ver" href="/tienda" target="_blank"><Icon n="ojo" s={24} /><span>Ver la tienda</span></a>
      </aside>

      <main className="ad-main">
        <p className="ad-prueba"><b>Modo de prueba.</b> Lo que cambiés aquí se guarda solo en este navegador y todavía no cambia la tienda. Se conecta al crear la base de datos.</p>

        <div className="ad-acciones">
          <button className="ad-gr ingreso" onClick={() => { setForm({ sentido: "ingreso", categoria: "Venta en feria", metodo: "SINPE", fecha: hoy() }); setTab("plata"); }}><Icon n="mas" s={34} />Entró plata</button>
          <button className="ad-gr gasto" onClick={() => { setForm({ sentido: "gasto", categoria: "Tela", metodo: "SINPE", fecha: hoy() }); setTab("plata"); }}><Icon n="menos" s={34} />Salió plata</button>
          <button className={"ad-gr voz" + (oyendo ? " is-on" : "")} onClick={dictar}><Icon n="mic" s={34} />{oyendo ? "Te escucho…" : "Dictar"}</button>
        </div>
        {aviso && <p className="ad-aviso" role="alert">{aviso}</p>}

        {form && (
          <form className="ad-form" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
            <h2>{form.sentido === "ingreso" ? "Entró plata" : "Salió plata"}</h2>
            {form.concepto && <p className="ad-oi">Entendí: "{form.concepto}". Revisá y guardá.</p>}
            <label>Monto en colones<input inputMode="numeric" autoFocus value={form.monto ?? ""} onChange={(e) => setForm({ ...form, monto: Number(e.target.value.replace(/\D/g, "")) })} placeholder="0" /></label>
            <div><span className="ad-l">¿De qué fue?</span><Chips ops={CATS[form.sentido ?? "gasto"]} v={form.categoria} set={(o) => setForm({ ...form, categoria: o })} /></div>
            <div><span className="ad-l">¿Cómo se pagó?</span><Chips ops={METODOS} v={form.metodo} set={(o) => setForm({ ...form, metodo: o })} /></div>
            {d.ferias.length > 0 && <div><span className="ad-l">¿Fue en una feria?</span><Chips ops={["No", ...d.ferias.map((f) => f.nombre)]} v={form.feria || "No"} set={(o) => setForm({ ...form, feria: o === "No" ? "" : o })} /></div>}
            <label>Nota (opcional)<input value={form.concepto ?? ""} onChange={(e) => setForm({ ...form, concepto: e.target.value })} /></label>
            <div className="ad-fin"><button type="button" className="ad-sec" onClick={() => setForm(null)}>Cancelar</button><button className="btn"><Icon n="check" s={22} />Guardar</button></div>
          </form>
        )}

        {tab === "resumen" && (
          <section>
            <h1>Este mes</h1>
            <div className="ad-kpis">
              <div><span>Entró</span><b>{fmt(entro)}</b></div>
              <div><span>Salió</span><b>{fmt(salio)}</b></div>
              <div className="ad-queda"><span>Queda</span><b>{fmt(entro - salio)}</b></div>
            </div>
            <h2>Últimos movimientos</h2>
            <Lista l={d.movs.slice(0, 6)} />
            <h2>La tienda</h2>
            <p className="ad-linea">{todas.filter((p) => !p.oculta).length} piezas visibles, {todas.filter((p) => p.oculta).length} ocultas, {todas.filter((p) => !p.precio).length} sin precio, {todas.filter((p) => p.fotos < 2).length} con una sola foto.</p>
          </section>
        )}

        {tab === "piezas" && (
          <section>
            <h1>Piezas</h1>
            <div className="ad-barra">
              <label className="fil-busca"><Icon n="buscar" s={22} /><input type="search" placeholder="Buscar una pieza" value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <button className="btn" onClick={() => { const n = { slug: "nueva-" + Date.now(), nombre: "Pieza nueva", precio: 0, tipo: tipos[0] ?? "Blusas", coleccion: "", foto: "", fotos: 0 }; setD((x) => ({ ...x, nuevas: [n, ...x.nuevas] })); setQ(""); }}><Icon n="mas" s={22} />Agregar pieza</button>
            </div>
            <ul className="ad-piezas">
              {vista.map((p) => (
                <li key={p.slug} className={p.oculta ? "is-off" : ""}>
                  {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : <span className="ad-sinfoto"><Icon n="foto" s={30} /></span>}
                  <label>Nombre<input value={p.nombre} onChange={(e) => cambia(p.slug, { nombre: e.target.value })} /></label>
                  <label>Precio ₡<input inputMode="numeric" value={p.precio || ""} placeholder="Sin precio" onChange={(e) => cambia(p.slug, { precio: Number(e.target.value.replace(/\D/g, "")) })} /></label>
                  <label>Colección<select value={p.coleccion} onChange={(e) => cambia(p.slug, { coleccion: e.target.value })}><option value="">Sin colección</option>{colecciones.map((c) => <option key={c}>{c}</option>)}</select></label>
                  <button className={"ad-ojo" + (p.oculta ? "" : " is-on")} onClick={() => cambia(p.slug, { oculta: !p.oculta })} aria-pressed={!p.oculta}><Icon n="ojo" s={24} />{p.oculta ? "Oculta" : "Visible"}</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === "plata" && (
          <section>
            <h1>Plata</h1>
            <div className="ad-kpis">
              <div><span>Entró este mes</span><b>{fmt(entro)}</b></div>
              <div><span>Salió este mes</span><b>{fmt(salio)}</b></div>
              <div className="ad-queda"><span>Queda</span><b>{fmt(entro - salio)}</b></div>
            </div>
            <h2>En qué se fue</h2>
            <ul className="ad-barras">
              {CATS.gasto.map((c) => { const v = delMes.filter((m) => m.sentido === "gasto" && m.categoria === c).reduce((a, m) => a + m.monto, 0); return (
                <li key={c}><span>{c}</span><i><em style={{ width: (salio ? (v / salio) * 100 : 0) + "%" }} /></i><b>{fmt(v)}</b></li>
              ); })}
            </ul>
            <h2>Todos los movimientos</h2>
            <Lista l={d.movs} />
          </section>
        )}

        {tab === "ferias" && (
          <section>
            <h1>Ferias</h1>
            <form className="ad-barra" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const nombre = String(f.get("n") ?? "").trim(); if (!nombre) return; setD((x) => ({ ...x, ferias: [{ id: crypto.randomUUID(), nombre, fecha: String(f.get("f") || hoy()) }, ...x.ferias] })); e.currentTarget.reset(); }}>
              <label className="fil-busca"><Icon n="carpa" s={22} /><input name="n" placeholder="Nombre de la feria" /></label>
              <input className="ad-fecha" type="date" name="f" defaultValue={hoy()} aria-label="Fecha" />
              <button className="btn"><Icon n="mas" s={22} />Agregar feria</button>
            </form>
            {d.ferias.length === 0 ? <p className="ad-nada">Agregá la próxima feria. Después, cada venta o gasto se puede marcar con esa feria y aquí ves cuánto dejó.</p> : (
              <ul className="ad-ferias">
                {d.ferias.map((f) => { const l = vivos.filter((m) => m.feria === f.nombre); const v = suma(l, "ingreso"), g = suma(l, "gasto"); return (
                  <li key={f.id}><div><b>{f.nombre}</b><small>{f.fecha}</small></div><p><span>Vendió</span>{fmt(v)}</p><p><span>Gastó</span>{fmt(g)}</p><p className="ad-queda"><span>Dejó</span>{fmt(v - g)}</p></li>
                ); })}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
