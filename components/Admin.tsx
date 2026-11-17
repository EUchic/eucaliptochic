"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATS, METODOS, VACIO, aplicar, describir, entender, fechaLinda, fmt, hoy, porFeria, respuestaCorta, resumenMes,
  type Accion, type Datos, type Pieza, type Respuesta, type Sentido, type TipoCambio,
} from "@/lib/asistente";
import Icon from "./Icon";
import { Mark } from "./Logo";

type FotoPanel = { id: string; src: string; alt: string; pieza?: string };
type Tab = "asistente" | "plata" | "piezas" | "ferias" | "fotos";
const KEY = "euchic-panel-v2";
const nid = () => crypto.randomUUID();

const EJEMPLOS = [
  "Le pagué 45 mil a Juanita por SINPE",
  "Vendí 71 mil en la feria, en efectivo",
  "Compré tela, 32 mil con tarjeta",
  "Subí la Blusa Jade a 25 mil",
  "Escondé la Falda Paz, ya se agotó",
  "¿Cuánto llevo gastado en tela?",
];

type Props = { piezas: Pieza[]; colecciones: string[]; tipos: string[]; fotos: FotoPanel[]; protegido: boolean; enLinea: boolean; inicial?: Datos; aviso?: string };
const tocaTienda = (a: Accion) => ["precio", "visible", "mover", "pieza", "foto", "coleccion"].includes(a.tipo);

export default function Admin({ piezas, colecciones, tipos, fotos, protegido, enLinea, inicial, aviso }: Props) {
  const [tab, setTab] = useState<Tab>("asistente");
  const [d, setD] = useState<Datos>(inicial ?? VACIO);
  const [base, setBase] = useState(piezas);
  const [cols, setCols] = useState(colecciones);
  const [guardando, setGuardando] = useState(false);
  const [mal, setMal] = useState(false);
  const [listo, setListo] = useState(false);
  const [tc, setTc] = useState<TipoCambio>(null);

  // Asistente
  const [oyendo, setOyendo] = useState(false);
  const [oido, setOido] = useState("");
  const [pensando, setPensando] = useState(false);
  const [resp, setResp] = useState<(Respuesta & { motor?: string }) | null>(null);
  const [toast, setToast] = useState("");
  const [voz, setVoz] = useState(true);
  const [escrito, setEscrito] = useState("");
  const rec = useRef<any>(null);

  useEffect(() => {
    if (!enLinea) try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (s) setD({ ...VACIO, ...s }); } catch {}
    try { setVoz(localStorage.getItem(KEY + "-voz") !== "0"); } catch {}
    setListo(true);
    fetch("/api/tipo-cambio").then((r) => (r.ok ? r.json() : null)).then((j) => j && setTc(j)).catch(() => {});
  }, []);
  useEffect(() => { if (listo && !enLinea) try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }, [d, listo, enLinea]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => { setToast(""); setMal(false); }, mal ? 6000 : 3200); return () => clearTimeout(t); }, [toast, mal]);

  const todas = useMemo(() => [...d.nuevas, ...base].map((p) => ({ ...p, ...d.cambios[p.slug] })), [base, d]);
  const todasColecciones = useMemo(() => [...new Set([...cols, ...d.colecciones])], [cols, d.colecciones]);
  const mes = resumenMes(d);

  const hablar = useCallback((t: string) => {
    if (!voz || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t.replace(/₡/g, "").replace(/(\d) (\d{3})/g, "$1$2") + (/₡/.test(t) ? "" : ""));
    const v = speechSynthesis.getVoices().filter((x) => x.lang.startsWith("es"));
    u.voice = v.find((x) => /CR|MX|US|419/.test(x.lang)) ?? v[0] ?? null;
    u.lang = u.voice?.lang ?? "es-CR";
    u.rate = 1.02;
    speechSynthesis.speak(u);
  }, [voz]);

  const tomarEstado = (e?: { piezas: Pieza[]; colecciones: string[]; datos: Datos }) => {
    if (!e) return;
    setBase(e.piezas); setCols(e.colecciones); setD(e.datos);
  };
  const [subiendo, setSubiendo] = useState("");

  const subirFotos = useCallback(async (p: Pieza, archivos: File[]) => {
    if (!archivos.length) return;
    setSubiendo(p.slug);
    try {
      for (const f of archivos.slice(0, 8)) {
        const [grande, chica] = [await achicar(f, 1600), await achicar(f, 800)];
        const fd = new FormData();
        fd.set("id", nid()); fd.set("slug", p.slug); fd.set("grande", grande, "grande"); fd.set("chica", chica, "chica");
        const r = await fetch("/api/fotos", { method: "POST", body: fd });
        if (r.status === 401) { location.href = "/admin/entrar"; return; }
        const j = await r.json().catch(() => ({}));
        tomarEstado(j.estado);
        if (!r.ok) throw new Error(j.error || "No se pudo subir la foto.");
      }
      const m = archivos.length > 1 ? `Fotos subidas a ${p.nombre}. Ya salen en la tienda.` : `Foto subida a ${p.nombre}. Ya sale en la tienda.`;
      setMal(false); setToast(m); hablar(m);
    } catch (e) {
      const m = e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No hay internet. La foto no se subió.";
      setMal(true); setToast(m); hablar(m);
    } finally {
      setSubiendo("");
    }
  }, [hablar]);

  const guardar = useCallback(async (acciones: Accion[], msg = "Listo, guardado.") => {
    if (!enLinea) {
      setD((x) => acciones.reduce((acc, a) => aplicar(acc, a, tc), x));
      setResp(null); setMal(false); setToast(msg); hablar(msg);
      return;
    }
    // Se guarda en la base de datos; la tienda se refresca sola en el servidor.
    setGuardando(true);
    try {
      const r = await fetch("/api/acciones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acciones }) });
      if (r.status === 401) { location.href = "/admin/entrar"; return; }
      const j = await r.json().catch(() => ({}));
      tomarEstado(j.estado);
      if (!r.ok) throw new Error(j.error || "No se pudo guardar. Probá de nuevo.");
      const dicho = msg + (acciones.some(tocaTienda) ? " La tienda ya está al día." : "");
      setResp(null); setMal(false); setToast(dicho); hablar(msg);
    } catch (e) {
      const m = e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No hay internet. No se guardó; probá de nuevo.";
      setMal(true); setToast(m); hablar(m);
    } finally {
      setGuardando(false);
    }
  }, [tc, hablar, enLinea]);

  const procesar = useCallback(async (texto: string) => {
    const t = texto.trim();
    if (!t) return;
    // ¿Contestó sí o no a la pregunta anterior?
    if (resp?.acciones.length) {
      const c = respuestaCorta(t);
      if (c === "si") return guardar(resp.acciones);
      if (c === "no") { setResp(null); setToast("No guardé nada."); hablar("Listo, no guardé nada."); return; }
    }
    setPensando(true);
    let r: (Respuesta & { motor?: string }) | null = null;
    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          texto: t,
          contexto: {
            piezas: todas.map(({ slug, nombre, precio, tipo, coleccion, oculta }) => ({ slug, nombre, precio, tipo, coleccion, oculta })),
            colecciones: todasColecciones,
            ferias: d.ferias.map((f) => ({ nombre: f.nombre, fecha: f.fecha })),
            resumen: `Este mes entraron ${fmt(mes.entro)} y salieron ${fmt(mes.salio)}. Gastos por categoría: ${Object.entries(mes.porCat).map(([k, v]) => `${k} ${fmt(v)}`).join(", ") || "ninguno"}. Por feria: ${d.ferias.map((f) => { const x = porFeria(d, f.nombre); return `${f.nombre} vendió ${fmt(x.vendio)}, gastó ${fmt(x.gasto)}`; }).join("; ") || "ninguna"}.`,
            tipoCambio: tc,
          },
        }),
      });
      if (res.ok) r = await res.json();
    } catch {}
    if (!r || r.motor === "local" || !r.respuesta) r = { ...entender(t, todas, d, tc), motor: "local" };
    setPensando(false);
    setResp(r);
    hablar(r.respuesta);
  }, [resp, guardar, hablar, todas, todasColecciones, d, mes, tc]);

  const escuchar = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setToast("Este navegador no deja dictar. Usá Chrome o Safari, o escribilo abajo."); return; }
    if (oyendo) { rec.current?.stop(); return; }
    speechSynthesis?.cancel();
    const r = new SR();
    rec.current = r;
    r.lang = "es-CR"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let final = "";
    r.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setOido(t);
      if (e.results[e.results.length - 1].isFinal) final = t;
    };
    r.onerror = (e: any) => { if (e.error === "not-allowed") setToast("Hay que darle permiso al micrófono."); };
    r.onend = () => { setOyendo(false); if (final) procesar(final); };
    setOido(""); setOyendo(true); r.start();
  };

  const TABS: [Tab, string, string][] = [["asistente", "Hablar", "mic"], ["plata", "Plata", "moneda"], ["piezas", "Piezas", "percha"], ["ferias", "Ferias", "carpa"], ["fotos", "Fotos", "foto"]];

  return (
    <div className="ad">
      <aside className="ad-lado">
        <a href="/" className="ad-logo" aria-label="Ver la tienda"><Mark part="full" /></a>
        <nav>{TABS.map(([k, t, ic]) => <button key={k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}><Icon n={ic} s={28} /><span>{t}</span></button>)}</nav>
        <a className="ad-ver" href="/tienda" target="_blank" rel="noopener"><Icon n="ojo" s={24} /><span>Ver la tienda</span></a>
        {protegido && <button className="ad-ver" onClick={async () => { await fetch("/api/entrar", { method: "DELETE" }); location.href = "/admin/entrar"; }}><Icon n="cerrar" s={24} /><span>Salir</span></button>}
      </aside>

      <main className="ad-main">
        <header className="ad-top">
          <div>
            <p className="ad-hola">Hola, Andrea</p>
            <p className="ad-fecha">{fechaLinda(hoy()).replace(/^./, (c) => c.toUpperCase())}</p>
          </div>
          {tc && <p className="ad-tc" title={`Tipo de cambio de Hacienda, ${tc.fecha}`}><span>Dólar hoy</span> {fmt(tc.compra)} / {fmt(tc.venta)}</p>}
        </header>

        {!enLinea && <p className="ad-prueba"><b>Modo de prueba.</b> Lo que hagás aquí se guarda solo en este teléfono y todavía no cambia la tienda. Al conectar la base de datos se guarda de verdad y la página se actualiza sola.</p>}
        {aviso && <p className="ad-prueba is-mal">{aviso}</p>}

        {tab === "asistente" && (
          <section className="ad-asis">
            <button className={"orbe" + (oyendo ? " is-on" : "") + (pensando ? " is-busy" : "")} onClick={escuchar} aria-label={oyendo ? "Dejar de escuchar" : "Hablar con el asistente"}>
              <span className="orbe-onda" /><span className="orbe-onda" /><span className="orbe-onda" />
              <Icon n="mic" s={64} />
            </button>
            <p className="orbe-txt" aria-live="polite">{oyendo ? "Te escucho…" : pensando ? "Pensando…" : guardando ? "Guardando…" : resp?.acciones.length ? "Decí «sí» o tocá Guardar" : "Tocá y hablame"}</p>
            {oido && <p className="ad-oido">«{oido}»</p>}

            {resp && (
              <div className="ad-resp" role="status">
                <p className="ad-resp-txt">{resp.respuesta}</p>
                {resp.acciones.length > 0 && (
                  <>
                    <ul className="ad-acciones-lista">
                      {resp.acciones.map((a) => <li key={a.id}><Icon n={iconoDe(a)} s={26} />{describir(a)}</li>)}
                    </ul>
                    <div className="ad-sino">
                      <button className="btn ad-si" disabled={guardando} onClick={() => guardar(resp.acciones)}><Icon n="check" s={26} />{guardando ? "Guardando…" : "Sí, guardalo"}</button>
                      <button className="ad-no" onClick={() => { setResp(null); setToast("No guardé nada."); }}>No</button>
                    </div>
                  </>
                )}
              </div>
            )}

            <form className="ad-escribir" onSubmit={(e) => { e.preventDefault(); procesar(escrito); setEscrito(""); }}>
              <input value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="O escribilo aquí" aria-label="Escribile al asistente" />
              <button className="redondo" aria-label="Enviar" disabled={!escrito.trim()}><Icon n="flecha" s={24} /></button>
            </form>

            {!resp && (
              <div className="ad-ejemplos">
                <p>Podés decir cosas como:</p>
                <ul>{EJEMPLOS.map((e) => <li key={e}><button onClick={() => procesar(e)}>«{e}»</button></li>)}</ul>
              </div>
            )}

            <div className="ad-kpis ad-kpis-mini">
              <div><span>Entró este mes</span><b>{fmt(mes.entro)}</b></div>
              <div><span>Salió este mes</span><b>{fmt(mes.salio)}</b></div>
              <div className="ad-queda"><span>Te queda</span><b>{fmt(mes.queda)}</b></div>
            </div>

            <label className="ad-voz"><input type="checkbox" checked={voz} onChange={(e) => { setVoz(e.target.checked); try { localStorage.setItem(KEY + "-voz", e.target.checked ? "1" : "0"); } catch {} }} /> Que el asistente me conteste en voz alta</label>
            {resp?.motor && <p className="ad-motor">{resp.motor === "openai" ? "Asistente con IA" : "Asistente básico (la IA se activa al conectar OpenAI)"}</p>}
          </section>
        )}

        {tab === "plata" && <Plata d={d} tc={tc} guardar={guardar} />}
        {tab === "piezas" && <Piezas todas={todas} colecciones={todasColecciones} tipos={tipos} guardar={guardar} enLinea={enLinea} subir={subirFotos} subiendo={subiendo} />}
        {tab === "ferias" && <Ferias d={d} guardar={guardar} />}
        {tab === "fotos" && <Fotos fotos={fotos} d={d} piezas={todas} guardar={guardar} enLinea={enLinea} />}
      </main>

      {toast && <p className={"ad-toast" + (mal ? " is-mal" : "")} role={mal ? "alert" : "status"}><Icon n={mal ? "cerrar" : "check"} s={24} />{toast}</p>}
    </div>
  );
}

function iconoDe(a: Accion) {
  return a.tipo === "movimiento" ? (a.sentido === "ingreso" ? "mas" : "menos") : a.tipo === "feria" ? "carpa" : a.tipo === "foto" ? "foto" : a.tipo === "visible" ? "ojo" : a.tipo === "precio" ? "moneda" : "percha";
}

type G = (a: Accion[], msg?: string) => Promise<void>;

function Plata({ d, tc, guardar }: { d: Datos; tc: TipoCambio; guardar: G }) {
  const r = resumenMes(d);
  const [f, setF] = useState<{ sentido: Sentido; monto: string; categoria: string; metodo: string; feria: string } | null>(null);
  return (
    <section className="ad-card">
      <h1>Plata de este mes</h1>
      <div className="ad-kpis">
        <div><span>Entró</span><b>{fmt(r.entro)}</b></div>
        <div><span>Salió</span><b>{fmt(r.salio)}</b></div>
        <div className="ad-queda"><span>Te queda</span><b>{fmt(r.queda)}</b></div>
      </div>
      <p className="ad-linea">De lo que entró, unos {fmt(r.iva)} corresponden al IVA (13 % incluido en el precio), si estás inscrita en Hacienda.</p>

      <div className="ad-dos">
        <button className="ad-gr ingreso" onClick={() => setF({ sentido: "ingreso", monto: "", categoria: CATS.ingreso[0], metodo: "SINPE", feria: "" })}><Icon n="mas" s={30} />Entró plata</button>
        <button className="ad-gr gasto" onClick={() => setF({ sentido: "gasto", monto: "", categoria: CATS.gasto[0], metodo: "SINPE", feria: "" })}><Icon n="menos" s={30} />Salió plata</button>
      </div>
      {f && (
        <form className="ad-form" onSubmit={(e) => {
          e.preventDefault();
          const monto = Number(f.monto.replace(/\D/g, ""));
          if (!monto) return;
          guardar([{ id: nid(), tipo: "movimiento", sentido: f.sentido, monto, moneda: "CRC", categoria: f.categoria, metodo: f.metodo, concepto: f.categoria, feria: f.feria || undefined, fecha: hoy() }]);
          setF(null);
        }}>
          <label>Monto en colones<input inputMode="numeric" autoFocus value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} placeholder="0" /></label>
          <Chips titulo="¿De qué fue?" ops={CATS[f.sentido]} v={f.categoria} set={(o) => setF({ ...f, categoria: o })} />
          <Chips titulo="¿Cómo se pagó?" ops={METODOS.filter((m) => m !== "ONVO")} v={f.metodo} set={(o) => setF({ ...f, metodo: o })} />
          {d.ferias.length > 0 && <Chips titulo="¿Fue en una feria?" ops={["No", ...d.ferias.map((x) => x.nombre)]} v={f.feria || "No"} set={(o) => setF({ ...f, feria: o === "No" ? "" : o })} />}
          <div className="ad-fin"><button type="button" className="ad-no" onClick={() => setF(null)}>Cancelar</button><button className="btn"><Icon n="check" s={22} />Guardar</button></div>
        </form>
      )}

      <h2>En qué se fue</h2>
      <ul className="ad-barras">
        {CATS.gasto.map((c) => { const v = r.porCat[c] ?? 0; return <li key={c}><span>{c}</span><i><em style={{ width: (r.salio ? (v / r.salio) * 100 : 0) + "%" }} /></i><b>{fmt(v)}</b></li>; })}
      </ul>

      <h2>Todos los movimientos</h2>
      {d.movs.length === 0 ? <p className="ad-linea">Todavía no hay movimientos. Contáselos al asistente o tocá «Entró plata» o «Salió plata».</p> : (
        <ul className="ad-movs">
          {d.movs.map((m) => (
            <li key={m.id} className={m.anulado ? "is-off" : ""}>
              <span className={"ad-signo " + m.sentido}><Icon n={m.sentido === "ingreso" ? "mas" : "menos"} s={22} /></span>
              <div><b>{m.concepto}</b><small>{m.categoria} · {m.metodo}{m.feria ? " · " + m.feria : ""} · {fechaLinda(m.fecha)}{m.moneda === "USD" ? ` · $${m.monto}` : ""}</small></div>
              <strong>{m.sentido === "gasto" ? "−" : "+"}{fmt(m.crc)}</strong>
              {!m.anulado && <button onClick={() => { if (confirm(`¿Anular «${m.concepto}»? Queda tachado y no cuenta en las sumas.`)) guardar([{ id: nid(), tipo: "anular", mov: m.id, nombre: m.concepto }], "Movimiento anulado."); }}>Anular</button>}
            </li>
          ))}
        </ul>
      )}
      {tc && <p className="ad-linea">Los dólares se pasan a colones con el tipo de cambio de Hacienda del día ({fmt(tc.compra)} compra, {fmt(tc.venta)} venta).</p>}
    </section>
  );
}

function Piezas({ todas, colecciones, tipos, guardar, enLinea, subir, subiendo }: { todas: Pieza[]; colecciones: string[]; tipos: string[]; guardar: G; enLinea: boolean; subir: (p: Pieza, f: File[]) => void; subiendo: string }) {
  const [q, setQ] = useState("");
  const vista = todas.filter((p) => p.nombre.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="ad-card">
      <h1>Piezas</h1>
      <p className="ad-linea">También se lo podés pedir al asistente: «subí la Blusa Jade a 25 mil», «escondé la Falda Paz», «creá la colección Navidad».</p>
      <div className="ad-barra">
        <label className="ad-busca"><Icon n="buscar" s={22} /><input type="search" placeholder="Buscar una pieza" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="btn" onClick={() => { const nombre = prompt("¿Cómo se llama la pieza nueva?")?.trim(); if (nombre) guardar([{ id: nid(), tipo: "pieza", nombre, tipoPieza: tipos[0] ?? "Blusas", precio: 0 }], "Pieza agregada. Sale en la tienda apenas tenga foto."); }}><Icon n="mas" s={22} />Agregar pieza</button>
      </div>
      <ul className="ad-piezas">
        {vista.map((p) => (
          <li key={p.slug} className={p.oculta ? "is-off" : ""}>
            {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : <span className="ad-sinfoto"><Icon n="foto" s={30} /></span>}
            <div className="ad-pieza-nombre"><b>{p.nombre}</b><small>{p.tipo}{p.coleccion ? " · " + p.coleccion : ""}</small></div>
            <label>Precio ₡<input inputMode="numeric" defaultValue={p.precio || ""} placeholder="Sin precio" onBlur={(e) => { const v = Number(e.target.value.replace(/\D/g, "")); if (v && v !== p.precio) guardar([{ id: nid(), tipo: "precio", slug: p.slug, nombre: p.nombre, precio: v }], "Precio cambiado."); }} /></label>
            <label>Colección<select value={p.coleccion} onChange={(e) => guardar([{ id: nid(), tipo: "mover", slug: p.slug, nombre: p.nombre, coleccion: e.target.value }], "Colección cambiada.")}><option value="">Sin colección</option>{colecciones.map((c) => <option key={c}>{c}</option>)}</select></label>
            <button className={"ad-ojo" + (p.oculta ? "" : " is-on")} aria-pressed={!p.oculta} onClick={() => guardar([{ id: nid(), tipo: "visible", slug: p.slug, nombre: p.nombre, visible: !!p.oculta }], p.oculta ? "Ya se ve en la tienda." : "Escondida de la tienda.")}><Icon n="ojo" s={24} />{p.oculta ? "Escondida" : "A la vista"}</button>
            {enLinea && (
              <div className="ad-tira">
                {(p.lista ?? []).map((f, i) => (
                  <figure key={f.id}>
                    <img src={f.url} alt="" loading="lazy" />
                    {i === 0 && <figcaption>Portada</figcaption>}
                    <button aria-label={`Quitar esta foto de ${p.nombre}`} onClick={() => { if (confirm(`¿Quitar esta foto de ${p.nombre}?`)) guardar([{ id: nid(), tipo: "quitar_foto", foto_id: f.id, slug: p.slug, nombre: p.nombre }], "Foto quitada."); }}><Icon n="cerrar" s={18} /></button>
                  </figure>
                ))}
                <label className={"ad-subir" + (subiendo === p.slug ? " is-busy" : "")}>
                  <input type="file" accept="image/*" multiple disabled={!!subiendo} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; subir(p, fs); }} />
                  <Icon n={subiendo === p.slug ? "foto" : "mas"} s={26} />
                  <span>{subiendo === p.slug ? "Subiendo…" : (p.lista?.length ? "Otra foto" : "Poner foto")}</span>
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ferias({ d, guardar }: { d: Datos; guardar: G }) {
  return (
    <section className="ad-card">
      <h1>Ferias</h1>
      <p className="ad-linea">Decile al asistente «voy a la feria de Escazú el sábado» y después «vendí 60 mil en la feria»: aquí ves cuánto te dejó cada una.</p>
      <form className="ad-barra" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const nombre = String(f.get("n") ?? "").trim();
        if (!nombre) return;
        guardar([{ id: nid(), tipo: "feria", nombre, fecha: String(f.get("f") || hoy()) }], "Feria anotada.");
        e.currentTarget.reset();
      }}>
        <label className="ad-busca"><Icon n="carpa" s={22} /><input name="n" placeholder="Nombre de la feria" /></label>
        <input className="ad-fecha" type="date" name="f" defaultValue={hoy()} aria-label="Fecha" />
        <button className="btn"><Icon n="mas" s={22} />Agregar feria</button>
      </form>
      {d.ferias.length === 0 ? <p className="ad-linea">Todavía no hay ferias anotadas.</p> : (
        <ul className="ad-ferias">
          {[...d.ferias].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((f) => { const x = porFeria(d, f.nombre); return (
            <li key={f.id}><div><b>{f.nombre}</b><small>{fechaLinda(f.fecha)}</small></div><p><span>Vendió</span>{fmt(x.vendio)}</p><p><span>Gastó</span>{fmt(x.gasto)}</p><p className="ad-queda"><span>Dejó</span>{fmt(x.dejo)}</p></li>
          ); })}
        </ul>
      )}
    </section>
  );
}

function Fotos({ fotos, d, piezas, guardar, enLinea }: { fotos: FotoPanel[]; d: Datos; piezas: Pieza[]; guardar: G; enLinea: boolean }) {
  const de = (f: FotoPanel) => d.fotos[f.id] ?? (enLinea ? "" : f.pieza ?? "");
  const sin = fotos.filter((f) => !de(f));
  return (
    <section className="ad-card">
      <h1>Fotos</h1>
      <p className="ad-linea">{sin.length ? `Hay ${sin.length} fotos sin pieza. Elegí de cuál pieza es cada una y aparece en la tienda.` : "Todas las fotos tienen su pieza."} La mejora de fotos con IA se activa al conectar OpenAI.</p>
      <ul className="ad-fotos">
        {[...sin, ...fotos.filter((f) => de(f))].map((f) => (
          <li key={f.id} className={de(f) ? "" : "is-sin"}>
            <img src={f.src} alt={f.alt} loading="lazy" />
            <label>{de(f) ? "Es de" : "¿De cuál pieza es?"}
              <select value={de(f)} onChange={(e) => { const p = piezas.find((x) => x.slug === e.target.value); if (p) guardar([{ id: nid(), tipo: "foto", foto: f.id, slug: p.slug, nombre: p.nombre }], `Foto puesta en ${p.nombre}.`); }}>
                <option value="">Elegí una pieza</option>
                {piezas.map((p) => <option key={p.slug} value={p.slug}>{p.nombre}</option>)}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Achica una foto en el teléfono antes de subirla (más rápido y liviano). WebP si se puede; si no, JPEG. */
async function achicar(archivo: File, lado: number): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const k = Math.min(1, lado / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    const cx = cv.getContext("2d")!;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(im, 0, 0, cv.width, cv.height);
    const hacer = (t: string, q: number) => new Promise<Blob | null>((r) => cv.toBlob(r, t, q));
    let b = await hacer("image/webp", 0.84);
    if (!b || b.type !== "image/webp") b = await hacer("image/jpeg", 0.86);
    if (!b) throw new Error("No pude leer esa foto. Probá con otra.");
    return b;
  } catch (e) {
    throw e instanceof Error && e.message.startsWith("No pude") ? e : new Error("No pude leer esa foto. Probá con otra.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Chips({ titulo, ops, v, set }: { titulo: string; ops: string[]; v?: string; set: (o: string) => void }) {
  return (
    <div><span className="ad-l">{titulo}</span><div className="ad-chips">{ops.map((o) => <button key={o} type="button" className={v === o ? "is-on" : ""} onClick={() => set(o)}>{o}</button>)}</div></div>
  );
}
