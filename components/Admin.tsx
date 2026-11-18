"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  METODOS, VACIO, aplicar, categoriasDe, fechaLinda, fmt, hoy, resumenMes,
  type Accion, type Datos, type Feria, type Pieza, type Sentido, type TipoCambio,
} from "@/lib/asistente";
import type { Seccion } from "@/lib/cerebro";
import Icon from "./Icon";
import Anuncios from "./Anuncios";
import Chat, { achicarFoto } from "./Chat";
import FeriasPanel from "./FeriasPanel";
import { Mark } from "./Logo";

type FotoPanel = { id: string; src: string; alt: string; pieza?: string };
const KEY = "euchic-panel-v2";
const nid = () => crypto.randomUUID();

type Props = { piezas: Pieza[]; colecciones: string[]; tipos: string[]; fotos: FotoPanel[]; protegido: boolean; enLinea: boolean; inicial?: Datos; aviso?: string };
const tocaTienda = (a: Accion) => ["precio", "visible", "mover", "pieza", "foto", "coleccion", "feria_lugar", "feria_sin_foto", "borrar_feria"].includes(a.tipo);
const SECCIONES: [Seccion, string, string][] = [["inicio", "Inicio", "mic"], ["plata", "Plata", "moneda"], ["tienda", "Tienda", "percha"], ["ferias", "Ferias", "carpa"], ["anuncios", "Anuncios", "megafono"]];

export default function Admin({ piezas, colecciones, tipos, fotos, protegido, enLinea, inicial, aviso }: Props) {
  const [tab, setTab] = useState<Seccion>("inicio");
  const [d, setD] = useState<Datos>({ ...VACIO, ...inicial });
  const [base, setBase] = useState(piezas);
  const [cols, setCols] = useState(colecciones);
  const [colNueva, setColNueva] = useState("");
  const [arrancar, setArrancar] = useState(false);
  const [descartadas, setDescartadas] = useState<string[]>([]);
  const [mal, setMal] = useState(false);
  const [listo, setListo] = useState(false);
  const [tc, setTc] = useState<TipoCambio>(null);
  const [toast, setToast] = useState("");
  const [voz, setVoz] = useState(false);
  const [hayVoz, setHayVoz] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!enLinea) try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (s) setD({ ...VACIO, ...s }); } catch {}
    try { setDescartadas(JSON.parse(localStorage.getItem(KEY + "-sug") ?? "[]")); } catch {}
    // La voz viene apagada: solo habla si Andrea la prende, y solo con una voz que suene natural.
    try { setVoz(localStorage.getItem(KEY + "-voz2") === "1"); } catch {}
    try { const t = localStorage.getItem(KEY + "-tab") as Seccion | null; if (t && SECCIONES.some(([k]) => k === t)) setTab(t); } catch {}
    if (typeof speechSynthesis !== "undefined") {
      const ver = () => setHayVoz(!!vozBuena());
      ver();
      speechSynthesis.addEventListener?.("voiceschanged", ver);
    }
    setListo(true);
    fetch("/api/tipo-cambio").then((r) => (r.ok ? r.json() : null)).then((j) => j && setTc(j)).catch(() => {});
  }, [enLinea]);
  useEffect(() => { if (listo && !enLinea) try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }, [d, listo, enLinea]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => { setToast(""); setMal(false); }, mal ? 6000 : 3000); return () => clearTimeout(t); }, [toast, mal]);

  const irA = useCallback((s: Seccion) => {
    setTab(s); setMenu(false);
    try { localStorage.setItem(KEY + "-tab", s); } catch {}
    window.scrollTo({ top: 0 });
  }, []);

  const todas = useMemo(() => [...d.nuevas, ...base].map((p) => ({ ...p, ...d.cambios[p.slug] })), [base, d]);
  const todasColecciones = useMemo(() => [...new Set([...cols, ...d.colecciones])], [cols, d.colecciones]);

  const hablar = useCallback((t: string) => {
    if (!voz || typeof speechSynthesis === "undefined") return;
    const v = vozBuena();
    if (!v) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t.replace(/₡\s?(\d+(?:\s\d{3})*)/g, (_, n: string) => n.replace(/\D/g, "") + " colones"));
    u.voice = v; u.lang = v.lang; u.rate = 1; u.pitch = 1;
    speechSynthesis.speak(u);
  }, [voz]);
  const avisar = useCallback((m: string, malo?: boolean) => { setMal(!!malo); setToast(m); hablar(m); }, [hablar]);

  const tomarEstado = (e?: { piezas: Pieza[]; colecciones: string[]; datos: Datos }) => {
    if (!e) return;
    setBase(e.piezas); setCols(e.colecciones); setD(e.datos);
  };

  /** Guarda acciones confirmadas. Devuelve si se guardó. Con msg vacío no muestra aviso (el chat contesta solo). */
  const guardar = useCallback(async (acciones: Accion[], msg = "Listo, guardado."): Promise<boolean> => {
    if (!enLinea) {
      setD((x) => acciones.reduce((acc, a) => aplicar(acc, a, tc), x));
      if (msg) avisar(msg);
      return true;
    }
    try {
      const r = await fetch("/api/acciones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acciones }) });
      if (r.status === 401) { location.href = "/admin/entrar"; return false; }
      const j = await r.json().catch(() => ({}));
      tomarEstado(j.estado);
      if (!r.ok) throw new Error(j.error || "No se pudo guardar. Probá de nuevo.");
      const col = acciones.find((a) => a.tipo === "coleccion");
      if (col && col.tipo === "coleccion") setColNueva(col.nombre);
      if (msg) avisar(msg + (acciones.some(tocaTienda) ? " La página ya está al día." : ""));
      return true;
    } catch (e) {
      avisar(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No hay internet. No se guardó; probá de nuevo.", true);
      return false;
    }
  }, [tc, enLinea, avisar]);

  const subirArchivo = useCallback(async (campos: Record<string, string>, archivo: File) => {
    const [grande, chica] = [await achicarFoto(archivo, 1600), await achicarFoto(archivo, 800)];
    const fd = new FormData();
    fd.set("id", nid()); for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    fd.set("grande", grande, "grande"); fd.set("chica", chica, "chica");
    const r = await fetch("/api/fotos", { method: "POST", body: fd });
    if (r.status === 401) { location.href = "/admin/entrar"; throw new Error("Entrá de nuevo."); }
    const j = await r.json().catch(() => ({}));
    tomarEstado(j.estado);
    if (!r.ok) throw new Error(j.error || "No se pudo subir la foto.");
  }, []);

  const subirFotos = useCallback(async (p: Pieza, archivos: File[]): Promise<boolean> => {
    if (!archivos.length) return false;
    try {
      for (const f of archivos.slice(0, 8)) await subirArchivo({ slug: p.slug }, f);
      avisar(archivos.length > 1 ? `Fotos subidas a ${p.nombre}. Ya salen en la tienda.` : `Foto subida a ${p.nombre}. Ya sale en la tienda.`);
      return true;
    } catch (e) {
      avisar(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No hay internet. La foto no se subió.", true);
      return false;
    }
  }, [subirArchivo, avisar]);

  const subirFotoFeria = useCallback(async (f: Feria, archivo: File) => {
    try { await subirArchivo({ feria: f.id }, archivo); avisar(`Foto puesta en ${f.nombre}.`); }
    catch (e) { avisar(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No hay internet. La foto no se subió.", true); }
  }, [subirArchivo, avisar]);

  // Sugerencias para promocionar: colección recién creada, o una feria que viene en 4 a 10 días.
  const feriaCerca = useMemo(() => {
    const h = hoy();
    return d.ferias
      .map((f) => ({ ...f, faltan: Math.round((Date.parse(f.fecha + "T12:00:00Z") - Date.parse(h + "T12:00:00Z")) / 864e5) }))
      .filter((f) => f.faltan >= 4 && f.faltan <= 10 && !descartadas.includes("feria-" + f.id))
      .sort((a, b) => a.faltan - b.faltan)[0];
  }, [d.ferias, descartadas]);
  const sugerencia = !enLinea ? null
    : colNueva ? { clave: "col-" + colNueva, texto: `Creaste la colección ${colNueva}. ¿Promocionamos un post de la colección nueva?` }
    : feriaCerca ? { clave: "feria-" + feriaCerca.id, texto: `Faltan ${feriaCerca.faltan} días para ${feriaCerca.nombre}. ¿Promocionamos un post para que más gente llegue?` }
    : null;
  const descartar = (clave: string) => {
    setColNueva("");
    const nuevas = [...descartadas, clave];
    setDescartadas(nuevas);
    try { localStorage.setItem(KEY + "-sug", JSON.stringify(nuevas.slice(-30))); } catch {}
  };

  const fotosSueltas = fotos.filter((f) => !(d.fotos[f.id] ?? (enLinea ? "" : f.pieza ?? "")));

  return (
    <div className={"pn is-" + tab}>
      <header className="pn-barra">
        <a href="/" className="pn-logo" aria-label="Ver la tienda"><Mark part="full" /></a>
        <div className="pn-hola">
          <p>Hola, Andrea</p>
          <small>{fechaLinda(hoy()).replace(/^./, (c) => c.toUpperCase())}</small>
        </div>
        <button className="pn-menu-btn" aria-label="Más opciones" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon n={menu ? "cerrar" : "filtro"} s={26} /></button>
        {menu && (
          <div className="pn-menu" role="menu">
            {tc && <p className="pn-dolar"><span>Dólar hoy (Hacienda)</span><b>{fmt(tc.compra)} / {fmt(tc.venta)}</b></p>}
            {hayVoz && (
              <label className="pn-interruptor">
                <input type="checkbox" checked={voz} onChange={(e) => {
                  const on = e.target.checked;
                  setVoz(on);
                  try { localStorage.setItem(KEY + "-voz2", on ? "1" : "0"); } catch {}
                  if (!on) { speechSynthesis.cancel(); return; }
                  const v = vozBuena();
                  if (v) { const u = new SpeechSynthesisUtterance("Listo, así te voy a contestar."); u.voice = v; u.lang = v.lang; speechSynthesis.cancel(); speechSynthesis.speak(u); }
                }} />
                <span>Que el asistente me hable en voz alta</span>
              </label>
            )}
            <a className="pn-menu-item" href="/tienda" target="_blank" rel="noopener"><Icon n="ojo" s={22} />Ver la tienda</a>
            <a className="pn-menu-item" href="/encontranos" target="_blank" rel="noopener"><Icon n="carpa" s={22} />Ver la página de ferias</a>
            {protegido && <button className="pn-menu-item" onClick={async () => { await fetch("/api/entrar", { method: "DELETE" }); location.href = "/admin/entrar"; }}><Icon n="cerrar" s={22} />Salir</button>}
          </div>
        )}
      </header>

      {!enLinea && <p className="pn-aviso"><b>Modo de prueba.</b> Lo que hagás se guarda solo en este teléfono y todavía no cambia la tienda.</p>}
      {aviso && <p className="pn-aviso is-mal">{aviso}</p>}

      <div className="pn-main">
        {tab === "inicio" && (
          <>
            {sugerencia && (
              <div className="pn-sugerencia">
                <Icon n="megafono" s={26} />
                <p>{sugerencia.texto}</p>
                <div className="ch-sino">
                  <button className="pn-boton" onClick={() => { descartar(sugerencia.clave); setArrancar(true); irA("anuncios"); }}>Sí, vamos</button>
                  <button className="pn-link" onClick={() => descartar(sugerencia.clave)}>Ahora no</button>
                </div>
              </div>
            )}
            <Chat
              d={d} piezas={todas} colecciones={todasColecciones} tc={tc} enLinea={enLinea} clave={KEY + "-chat"}
              guardar={(a) => guardar(a, "")} irA={irA} hablar={hablar} avisar={avisar}
              subirFoto={(p, f) => subirFotos(p, [f])}
            />
          </>
        )}
        {tab === "plata" && <Plata d={d} tc={tc} guardar={guardar} />}
        {tab === "tienda" && <Tienda todas={todas} colecciones={todasColecciones} tipos={tipos} guardar={guardar} enLinea={enLinea} subir={subirFotos} fotos={fotosSueltas} d={d} />}
        {tab === "ferias" && <FeriasPanel d={d} enLinea={enLinea} guardar={guardar} subirFoto={subirFotoFeria} avisar={avisar} />}
        {tab === "anuncios" && (enLinea
          ? <Anuncios ferias={d.ferias} arrancar={arrancar} alArrancar={() => setArrancar(false)} avisar={avisar} />
          : <section className="pn-seccion"><header className="pn-cabeza"><h1>Anuncios</h1><p>Las promociones se hacen cuando el panel está conectado a la base.</p></header></section>)}
      </div>

      <nav className="pn-tabs" aria-label="Secciones">
        {SECCIONES.map(([k, t, ic]) => (
          <button key={k} className={tab === k ? "is-on" : ""} onClick={() => irA(k)} aria-current={tab === k ? "page" : undefined}>
            <span className="pn-tab-ico"><Icon n={ic} s={24} /></span><span>{t}</span>
          </button>
        ))}
      </nav>

      {toast && <p className={"pn-toast" + (mal ? " is-mal" : "")} role={mal ? "alert" : "status"}><Icon n={mal ? "cerrar" : "check"} s={22} />{toast}</p>}
    </div>
  );
}

type G = (a: Accion[], msg?: string) => Promise<boolean>;

/** Botón con confirmación en el mismo lugar (sin ventanas emergentes). */
function Seguro({ texto, pregunta, si, peligro }: { texto: React.ReactNode; pregunta: string; si: () => void; peligro?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <button className={"pn-link" + (peligro ? " is-peligro" : "")} onClick={() => setAbierto(true)}>{texto}</button>;
  return (
    <span className="pn-seguro">
      <span>{pregunta}</span>
      <button className={"pn-boton is-chico" + (peligro ? " is-peligro" : "")} onClick={() => { setAbierto(false); si(); }}>Sí</button>
      <button className="pn-link" onClick={() => setAbierto(false)}>No</button>
    </span>
  );
}

function Plata({ d, tc, guardar }: { d: Datos; tc: TipoCambio; guardar: G }) {
  const r = resumenMes(d);
  const [f, setF] = useState<{ sentido: Sentido; monto: string; categoria: string; metodo: string; feria: string } | null>(null);
  const [todos, setTodos] = useState(false);
  const gastos = categoriasDe(d, "gasto");
  const movs = todos ? d.movs : d.movs.slice(0, 15);
  return (
    <section className="pn-seccion">
      <header className="pn-cabeza"><h1>Plata</h1><p>Lo de este mes. También se lo podés decir al asistente: «vendí 60 mil en la feria en efectivo».</p></header>
      <div className="pl-kpis">
        <div className="is-queda"><span>Te queda</span><b>{fmt(r.queda)}</b></div>
        <div><span>Entró</span><b>{fmt(r.entro)}</b></div>
        <div><span>Salió</span><b>{fmt(r.salio)}</b></div>
      </div>
      <p className="pn-nota">De lo que entró, unos {fmt(r.iva)} corresponden al IVA (13 % incluido en el precio), si estás inscrita en Hacienda.</p>

      <div className="pl-dos">
        <button className="pl-gr is-ingreso" onClick={() => setF({ sentido: "ingreso", monto: "", categoria: categoriasDe(d, "ingreso")[0], metodo: "SINPE", feria: "" })}><Icon n="mas" s={28} />Entró plata</button>
        <button className="pl-gr is-gasto" onClick={() => setF({ sentido: "gasto", monto: "", categoria: gastos[0], metodo: "SINPE", feria: "" })}><Icon n="menos" s={28} />Salió plata</button>
      </div>
      {f && (
        <form className="pn-tarjeta pl-form" onSubmit={async (e) => {
          e.preventDefault();
          const monto = Number(f.monto.replace(/\D/g, ""));
          if (!monto) return;
          if (await guardar([{ id: nid(), tipo: "movimiento", sentido: f.sentido, monto, moneda: "CRC", categoria: f.categoria, metodo: f.metodo, concepto: f.categoria, feria: f.feria || undefined, fecha: hoy() }])) setF(null);
        }}>
          <label className="pn-campo is-monto"><span>Monto en colones</span><input inputMode="numeric" autoFocus value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} placeholder="₡0" /></label>
          <Chips titulo="¿De qué fue?" ops={categoriasDe(d, f.sentido)} v={f.categoria} set={(o) => setF({ ...f, categoria: o })} />
          <Chips titulo="¿Cómo se pagó?" ops={METODOS.filter((m) => m !== "ONVO")} v={f.metodo} set={(o) => setF({ ...f, metodo: o })} />
          {d.ferias.length > 0 && <Chips titulo="¿Fue en una feria?" ops={["No", ...d.ferias.slice(0, 6).map((x) => x.nombre)]} v={f.feria || "No"} set={(o) => setF({ ...f, feria: o === "No" ? "" : o })} />}
          <div className="ch-sino"><button className="pn-boton"><Icon n="check" s={22} />Guardar</button><button type="button" className="pn-link" onClick={() => setF(null)}>Cancelar</button></div>
        </form>
      )}

      <h2 className="pn-sub">En qué se fue</h2>
      <ul className="pn-tarjeta pl-barras">
        {gastos.map((c) => { const v = r.porCat[c] ?? 0; return <li key={c}><span>{c}</span><b>{fmt(v)}</b><i><em style={{ width: (r.salio ? (v / r.salio) * 100 : 0) + "%" }} /></i></li>; })}
      </ul>

      <h2 className="pn-sub">Movimientos</h2>
      {d.movs.length === 0 ? <p className="pn-vacio">Todavía no hay movimientos. Contáselos al asistente o tocá «Entró plata» o «Salió plata».</p> : (
        <ul className="pl-movs">
          {movs.map((m) => (
            <li key={m.id} className={"pn-tarjeta" + (m.anulado ? " is-off" : "")}>
              <span className={"pl-signo is-" + m.sentido}><Icon n={m.sentido === "ingreso" ? "mas" : "menos"} s={20} /></span>
              <div className="pl-mov-txt"><b>{m.concepto}</b><small>{m.categoria} · {m.metodo}{m.feria ? " · " + m.feria : ""} · {fechaLinda(m.fecha)}{m.moneda === "USD" ? ` · $${m.monto}` : ""}</small></div>
              <strong className={"is-" + m.sentido}>{m.sentido === "gasto" ? "−" : "+"}{fmt(m.crc)}</strong>
              {!m.anulado && <div className="pl-anular"><Seguro texto="Anular" pregunta="¿Anularlo? Queda tachado y no cuenta." peligro si={() => guardar([{ id: nid(), tipo: "anular", mov: m.id, nombre: m.concepto }], "Movimiento anulado.")} /></div>}
            </li>
          ))}
        </ul>
      )}
      {d.movs.length > 15 && !todos && <button className="pn-link is-centro" onClick={() => setTodos(true)}>Ver todos ({d.movs.length})</button>}
      {tc && <p className="pn-nota">Los dólares se pasan a colones con el tipo de cambio de Hacienda del día ({fmt(tc.compra)} compra, {fmt(tc.venta)} venta).</p>}
    </section>
  );
}

function Tienda({ todas, colecciones, tipos, guardar, enLinea, subir, fotos, d }: {
  todas: Pieza[]; colecciones: string[]; tipos: string[]; guardar: G; enLinea: boolean; subir: (p: Pieza, f: File[]) => Promise<boolean>; fotos: FotoPanel[]; d: Datos;
}) {
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [subiendo, setSubiendo] = useState("");
  const vista = todas.filter((p) => p.nombre.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="pn-seccion">
      <header className="pn-cabeza"><h1>Tienda</h1><p>Tocá una pieza para cambiarle el precio, la colección o las fotos. O pedíselo al asistente: «subí la Blusa Jade a 25 mil».</p></header>
      <div className="ti-barra">
        <label className="pn-buscador"><Icon n="buscar" s={22} /><input type="search" placeholder="Buscar una pieza" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="pn-boton" onClick={() => setNueva(!nueva)}><Icon n={nueva ? "cerrar" : "mas"} s={22} />{nueva ? "Cerrar" : "Pieza nueva"}</button>
      </div>
      {nueva && (
        <form className="pn-tarjeta ti-nueva" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const nombre = String(f.get("n") ?? "").trim();
          if (!nombre) return;
          const ok = await guardar([{ id: nid(), tipo: "pieza", nombre, tipoPieza: String(f.get("t") || tipos[0] || "Blusas"), precio: Number(String(f.get("p") ?? "").replace(/\D/g, "")) || 0, coleccion: String(f.get("c") || "") || undefined }], "Pieza agregada. Sale en la tienda apenas tenga foto.");
          if (ok) setNueva(false);
        }}>
          <label className="pn-campo"><span>Nombre</span><input name="n" placeholder="Ej.: Blusa Jade" autoFocus /></label>
          <label className="pn-campo"><span>Tipo</span><select name="t">{tipos.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="pn-campo"><span>Precio</span><input name="p" inputMode="numeric" placeholder="₡" /></label>
          <label className="pn-campo"><span>Colección</span><select name="c"><option value="">Sin colección</option>{colecciones.map((c) => <option key={c}>{c}</option>)}</select></label>
          <button className="pn-boton"><Icon n="check" s={22} />Agregar</button>
        </form>
      )}

      <ul className="ti-lista">
        {vista.map((p) => (
          <li key={p.slug} className={"pn-tarjeta" + (p.oculta ? " is-off" : "") + (abierta === p.slug ? " is-abierta" : "")}>
            <button className="ti-fila" onClick={() => setAbierta(abierta === p.slug ? null : p.slug)} aria-expanded={abierta === p.slug}>
              {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : <span className="ti-sinfoto"><Icon n="foto" s={24} /></span>}
              <span className="ti-nombre"><b>{p.nombre}</b><small>{p.coleccion || p.tipo}{p.oculta ? " · Escondida" : ""}</small></span>
              <span className="ti-precio">{p.precio ? fmt(p.precio) : "Sin precio"}</span>
            </button>
            {abierta === p.slug && (
              <div className="ti-editar">
                <div className="ti-campos">
                  <label className="pn-campo"><span>Precio</span><input inputMode="numeric" defaultValue={p.precio || ""} placeholder="₡" onBlur={(e) => { const v = Number(e.target.value.replace(/\D/g, "")); if (v && v !== p.precio) guardar([{ id: nid(), tipo: "precio", slug: p.slug, nombre: p.nombre, precio: v }], "Precio cambiado."); }} /></label>
                  <label className="pn-campo"><span>Colección</span><select value={p.coleccion} onChange={(e) => guardar([{ id: nid(), tipo: "mover", slug: p.slug, nombre: p.nombre, coleccion: e.target.value }], "Colección cambiada.")}><option value="">Sin colección</option>{colecciones.map((c) => <option key={c}>{c}</option>)}</select></label>
                </div>
                <button className={"ti-ojo" + (p.oculta ? "" : " is-on")} aria-pressed={!p.oculta} onClick={() => guardar([{ id: nid(), tipo: "visible", slug: p.slug, nombre: p.nombre, visible: !!p.oculta }], p.oculta ? "Ya se ve en la tienda." : "Escondida de la tienda.")}>
                  <span className="ti-switch" aria-hidden><i /></span>{p.oculta ? "Escondida de la tienda" : "Se ve en la tienda"}
                </button>
                {enLinea && (
                  <div className="ti-fotos">
                    {(p.lista ?? []).map((f, i) => (
                      <figure key={f.id}>
                        <img src={f.url} alt="" loading="lazy" />
                        {i === 0 && <figcaption>Portada</figcaption>}
                        <QuitarFoto si={() => guardar([{ id: nid(), tipo: "quitar_foto", foto_id: f.id, slug: p.slug, nombre: p.nombre }], "Foto quitada.")} />
                      </figure>
                    ))}
                    <label className={"ti-subir" + (subiendo === p.slug ? " is-ocupado" : "")}>
                      <input type="file" accept="image/*" multiple hidden disabled={!!subiendo} onChange={async (e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; setSubiendo(p.slug); await subir(p, fs); setSubiendo(""); }} />
                      <Icon n={subiendo === p.slug ? "foto" : "mas"} s={24} /><span>{subiendo === p.slug ? "Subiendo…" : p.lista?.length ? "Otra foto" : "Poner foto"}</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {fotos.length > 0 && <FotosSueltas fotos={fotos} piezas={todas} guardar={guardar} d={d} />}
    </section>
  );
}

function QuitarFoto({ si }: { si: () => void }) {
  const [seguro, setSeguro] = useState(false);
  return seguro
    ? <span className="ti-quitar-ok"><button onClick={si}>Quitar</button><button onClick={() => setSeguro(false)}>No</button></span>
    : <button className="ti-quitar" aria-label="Quitar esta foto" onClick={() => setSeguro(true)}><Icon n="cerrar" s={16} /></button>;
}

function FotosSueltas({ fotos, piezas, guardar }: { fotos: FotoPanel[]; piezas: Pieza[]; guardar: G; d: Datos }) {
  return (
    <>
      <h2 className="pn-sub">Fotos sin pieza ({fotos.length})</h2>
      <p className="pn-nota">Escogé de cuál pieza es cada una y aparece en la tienda.</p>
      <ul className="ti-sueltas">
        {fotos.map((f) => (
          <li key={f.id} className="pn-tarjeta">
            <img src={f.src} alt={f.alt} loading="lazy" />
            <select value="" onChange={(e) => { const p = piezas.find((x) => x.slug === e.target.value); if (p) guardar([{ id: nid(), tipo: "foto", foto: f.id, slug: p.slug, nombre: p.nombre }], `Foto puesta en ${p.nombre}.`); }}>
              <option value="">¿De cuál pieza es?</option>
              {piezas.map((p) => <option key={p.slug} value={p.slug}>{p.nombre}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </>
  );
}

function Chips({ titulo, ops, v, set }: { titulo: string; ops: string[]; v?: string; set: (o: string) => void }) {
  return (
    <fieldset className="pn-grupo">
      <legend>{titulo}</legend>
      <div className="pn-chips">{ops.map((o) => <button type="button" key={o} className={v === o ? "is-on" : ""} onClick={() => set(o)}>{o}</button>)}</div>
    </fieldset>
  );
}

// Voces del sistema que suenan raras (las "de juguete" de Apple y similares): nunca se usan.
const VOCES_RARAS = /\b(eddy|flo|grandma|grandpa|abuel[oa]|reed|rocko|sandy|shelley|bad news|bahh|bells|boing|bubbles|cellos|wobble|good news|jester|organ|superstar|trinoids|whisper|zarvox|albert|fred|junior|kathy|ralph)\b/i;

/** La voz en español que mejor suena en este aparato, o null si solo hay voces robóticas. */
function vozBuena(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const puntos = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online|premium|enhanced|mejorada|siri/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 3 : 0) +
    (/paulina|m[oó]nica|sabina|dalia|elvira|helena|laura|marisol|lupe|penélope|ximena|camila|jorge|diego|juan/i.test(v.name) ? 2 : 0) +
    (/-(CR|MX|US|419|CO)\b/i.test(v.lang) ? 1 : 0);
  const ops = speechSynthesis.getVoices()
    .filter((v) => /^es\b|^es-/i.test(v.lang) && !VOCES_RARAS.test(v.name))
    .map((v) => ({ v, p: puntos(v) }))
    .filter((x) => x.p >= 2)
    .sort((a, b) => b.p - a.p);
  return ops[0]?.v ?? null;
}
