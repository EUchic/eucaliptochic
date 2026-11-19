"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VACIO, aplicar, fmt, hoy, type Accion, type Datos, type Feria, type Pieza, type TipoCambio } from "@/lib/asistente";
import type { Seccion } from "@/lib/cerebro";
import { revisar } from "@/lib/revision";
import Anuncios from "./Anuncios";
import Chat, { achicarFoto } from "./Chat";
import FeriasPanel from "./FeriasPanel";
import { callar } from "./hablar";
import Icon from "./Icon";
import { Mark } from "./Logo";
import Plata from "./Plata";
import Tienda from "./Tienda";

type FotoPanel = { id: string; src: string; alt: string; pieza?: string };
const KEY = "euchic-panel-v2";
const nid = () => crypto.randomUUID();

type Props = { piezas: Pieza[]; colecciones: string[]; tipos: string[]; fotos: FotoPanel[]; protegido: boolean; enLinea: boolean; inicial?: Datos; aviso?: string };
const tocaTienda = (a: Accion) => ["precio", "visible", "mover", "pieza", "foto", "coleccion", "feria", "feria_lugar", "feria_sin_foto", "borrar_feria", "tallas", "foto_aprobar"].includes(a.tipo);
const SECCIONES: [Seccion, string, string][] = [["inicio", "Asistente", "mic"], ["plata", "Plata", "moneda"], ["tienda", "Tienda", "percha"], ["ferias", "Ferias", "carpa"], ["anuncios", "Anuncios", "megafono"]];

/** Cuando sale el teclado, la barra de abajo se esconde y la caja de escribir queda pegada al teclado. */
function useTeclado() {
  useEffect(() => {
    const raiz = document.documentElement;
    const vv = window.visualViewport;
    const esCampo = (e: EventTarget | null) => e instanceof HTMLElement && (e.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select") || e.isContentEditable);
    const medir = () => {
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      raiz.style.setProperty("--kb", kb > 60 ? kb + "px" : "0px");
      raiz.classList.toggle("teclado", kb > 60 || esCampo(document.activeElement));
    };
    const enFoco = () => setTimeout(medir, 50);
    const sinFoco = () => setTimeout(medir, 120);
    document.addEventListener("focusin", enFoco);
    document.addEventListener("focusout", sinFoco);
    vv?.addEventListener("resize", medir);
    vv?.addEventListener("scroll", medir);
    return () => {
      document.removeEventListener("focusin", enFoco); document.removeEventListener("focusout", sinFoco);
      vv?.removeEventListener("resize", medir); vv?.removeEventListener("scroll", medir);
      raiz.classList.remove("teclado");
    };
  }, []);
}

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
  const [vozOn, setVozOn] = useState(true);
  const [menu, setMenu] = useState(false);
  useTeclado();

  useEffect(() => {
    if (!enLinea) try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (s) setD({ ...VACIO, ...s }); } catch {}
    try { setDescartadas(JSON.parse(localStorage.getItem(KEY + "-sug") ?? "[]")); } catch {}
    try { setVozOn(localStorage.getItem(KEY + "-voz3") !== "0"); } catch {}
    try { const t = localStorage.getItem(KEY + "-tab") as Seccion | null; if (t && SECCIONES.some(([k]) => k === t)) setTab(t); } catch {}
    setListo(true);
    fetch("/api/tipo-cambio").then((r) => (r.ok ? r.json() : null)).then((j) => j && setTc(j)).catch(() => {});
  }, [enLinea]);
  useEffect(() => { if (listo && !enLinea) try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }, [d, listo, enLinea]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => { setToast(""); setMal(false); }, mal ? 6500 : 3200); return () => clearTimeout(t); }, [toast, mal]);

  const irA = useCallback((s: Seccion) => {
    setTab(s); setMenu(false); callar();
    try { localStorage.setItem(KEY + "-tab", s); } catch {}
    window.scrollTo({ top: 0 });
  }, []);

  const todas = useMemo(() => [...d.nuevas, ...base].map((p) => ({ ...p, ...d.cambios[p.slug] })), [base, d]);
  const todasColecciones = useMemo(() => [...new Set([...cols, ...d.colecciones])], [cols, d.colecciones]);
  const preguntas = useMemo(() => (enLinea ? revisar(d, todas) : []), [d, todas, enLinea]);
  const avisar = useCallback((m: string, malo?: boolean) => { setMal(!!malo); setToast(m); }, []);

  const tomarEstado = (e?: { piezas: Pieza[]; colecciones: string[]; datos: Datos }) => {
    if (!e) return;
    setBase(e.piezas); setCols(e.colecciones); setD({ ...VACIO, ...e.datos });
  };
  const refrescar = useCallback(async () => {
    try { const r = await fetch("/api/acciones", { cache: "no-store" }); if (r.ok) tomarEstado(await r.json()); } catch {}
  }, []);

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
      if (msg) avisar(msg + (acciones.some(tocaTienda) && !/página|tienda/.test(msg) ? " La página ya está al día." : ""));
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
      avisar(archivos.length > 1 ? `Fotos subidas a ${p.nombre}.` : `Foto subida a ${p.nombre}.`);
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

  // Sugerencia para promocionar: colección recién creada, o una feria que viene en 4 a 10 días.
  const feriaCerca = useMemo(() => {
    const h = hoy();
    return d.ferias
      .map((f) => ({ ...f, faltan: Math.round((Date.parse(f.fecha + "T12:00:00Z") - Date.parse(h + "T12:00:00Z")) / 864e5) }))
      .filter((f) => f.faltan >= 4 && f.faltan <= 10 && !descartadas.includes("feria-" + f.id))
      .sort((a, b) => a.faltan - b.faltan)[0];
  }, [d.ferias, descartadas]);
  const sugerencia = !enLinea ? null
    : colNueva ? { clave: "col-" + colNueva, texto: `Creaste la colección ${colNueva}. ¿Promocionamos un post de la colección?` }
    : feriaCerca ? { clave: "feria-" + feriaCerca.id, texto: `Faltan ${feriaCerca.faltan} días para ${feriaCerca.nombre}. ¿Promocionamos un post para que llegue más gente?` }
    : null;
  const descartar = (clave: string) => {
    setColNueva("");
    const nuevas = [...descartadas, clave];
    setDescartadas(nuevas);
    try { localStorage.setItem(KEY + "-sug", JSON.stringify(nuevas.slice(-30))); } catch {}
  };

  const fotosSueltas = fotos.filter((f) => !(d.fotos[f.id] ?? (enLinea ? "" : f.pieza ?? "")));
  const titulo = SECCIONES.find(([k]) => k === tab)?.[1];

  return (
    <div className={"pn is-" + tab}>
      <header className="pn-barra">
        <a href="/" className="pn-logo" aria-label="Ver la tienda"><Mark part="full" /></a>
        <p className="pn-barra-titulo" aria-hidden>{tab === "inicio" ? "Hola, Andrea" : titulo}</p>
        <button className={"pn-icono" + (vozOn ? " is-on" : "")} aria-label={vozOn ? "Silenciar la voz del asistente" : "Que el asistente me hable"} aria-pressed={vozOn}
          onClick={() => { const on = !vozOn; setVozOn(on); if (!on) callar(); try { localStorage.setItem(KEY + "-voz3", on ? "1" : "0"); } catch {} avisar(on ? "El asistente te va a contestar en voz alta cuando le hablés." : "Listo, el asistente contesta solo por escrito."); }}>
          <Icon n="altavoz" s={24} />
        </button>
        <button className="pn-icono" aria-label="Más opciones" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon n={menu ? "cerrar" : "puntos"} s={26} /></button>
        {menu && (
          <div className="pn-menu" role="menu">
            {tc && <p className="pn-menu-dato"><span>Dólar hoy (Hacienda)</span><b>{fmt(tc.compra)} / {fmt(tc.venta)}</b></p>}
            <a className="pn-menu-item" href="/tienda" target="_blank" rel="noopener"><Icon n="ojo" s={22} />Ver la tienda</a>
            <a className="pn-menu-item" href="/encontranos" target="_blank" rel="noopener"><Icon n="carpa" s={22} />Ver la página de ferias</a>
            {protegido && <button className="pn-menu-item" onClick={async () => { await fetch("/api/entrar", { method: "DELETE" }); location.href = "/admin/entrar"; }}><Icon n="cerrar" s={22} />Salir</button>}
          </div>
        )}
      </header>

      {!enLinea && <p className="pn-aviso"><b>Modo de prueba.</b> Lo que hagás se guarda solo en este teléfono y todavía no cambia la tienda.</p>}
      {aviso && <p className="pn-aviso is-mal">{aviso}</p>}

      <main className="pn-main">
        {tab === "inicio" && (
          <>
            {sugerencia && (
              <div className="pn-sugerencia">
                <span className="pn-accion-ico"><Icon n="megafono" s={24} /></span>
                <p>{sugerencia.texto}</p>
                <div className="pn-botones">
                  <button className="pn-btn" onClick={() => { descartar(sugerencia.clave); setArrancar(true); irA("anuncios"); }}>Sí, vamos</button>
                  <button className="pn-btn is-gris" onClick={() => descartar(sugerencia.clave)}>Ahora no</button>
                </div>
              </div>
            )}
            <Chat
              d={d} piezas={todas} colecciones={todasColecciones} tipos={tipos} tc={tc} enLinea={enLinea} clave={KEY + "-chat"}
              guardar={(a, m = "") => guardar(a, m)} irA={irA} avisar={avisar} subirFotos={subirFotos} vozOn={vozOn} preguntas={preguntas} refrescar={refrescar}
            />
          </>
        )}
        {tab === "plata" && <Plata d={d} tc={tc} guardar={guardar} />}
        {tab === "tienda" && <Tienda todas={todas} colecciones={todasColecciones} tipos={tipos} guardar={guardar} subir={subirFotos} fotos={fotosSueltas} d={d} avisar={avisar} refrescar={refrescar} />}
        {tab === "ferias" && <FeriasPanel d={d} enLinea={enLinea} guardar={guardar} subirFoto={subirFotoFeria} avisar={avisar} />}
        {tab === "anuncios" && (enLinea
          ? <Anuncios ferias={d.ferias} piezas={todas} arrancar={arrancar} alArrancar={() => setArrancar(false)} avisar={avisar} />
          : <section className="pn-seccion"><header className="pn-titulo"><h1>Anuncios</h1><p>Las promociones se hacen cuando el panel está conectado.</p></header></section>)}
      </main>

      <nav className="pn-tabs" aria-label="Secciones">
        {SECCIONES.map(([k, t, ic]) => (
          <button key={k} className={tab === k ? "is-on" : ""} onClick={() => irA(k)} aria-current={tab === k ? "page" : undefined}>
            <Icon n={ic} s={26} /><span>{t}</span>
            {k === "inicio" && preguntas.length > 0 && tab !== "inicio" && <i className="pn-punto" aria-label="Hay preguntas" />}
          </button>
        ))}
      </nav>

      {toast && <p className={"pn-toast" + (mal ? " is-mal" : "")} role={mal ? "alert" : "status"} onClick={() => setToast("")}><Icon n={mal ? "cerrar" : "check"} s={22} />{toast}</p>}
    </div>
  );
}
