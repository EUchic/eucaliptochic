"use client";

import { useState } from "react";
import { categoriasDe, fechaLinda, fmt, hoy, METODOS, type Accion, type Datos, type Sentido, type TipoCambio } from "@/lib/asistente";
import { cambio, mesActual, mover, paraIA, reporte, type Fila, type Reporte } from "@/lib/reporte";
import Icon from "./Icon";
import { avisarGuia } from "@/lib/guias";

type G = (a: Accion[], msg?: string) => Promise<boolean>;
type Analisis = { titular: string; puntos: { tipo: "bien" | "ojo" | "idea"; texto: string }[]; recomendaciones: string[] };
const nid = () => crypto.randomUUID();

function Barras({ titulo, filas, total, color }: { titulo: string; filas: Fila[]; total: number; color?: "gasto" | "ingreso" }) {
  if (!filas.length) return null;
  return (
    <div className="pn-tarjeta pl-barras">
      <h3>{titulo}</h3>
      <ul>
        {filas.map((f) => (
          <li key={f.nombre}>
            <div><span>{f.nombre}</span><b>{fmt(f.monto)}</b></div>
            <i className={"is-" + (color ?? "ingreso")}><em style={{ width: (total ? Math.max(3, (f.monto / total) * 100) : 0) + "%" }} /></i>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Análisis del mes hecho por la IA, guardado para no pagarlo dos veces. */
export function AnalisisIA({ r, d, guardar }: { r: Reporte; d: Datos; guardar: G }) {
  const clave = "analisis_" + r.mes;
  const guardado = d.ajustes[clave] as Analisis | undefined;
  const [a, setA] = useState<Analisis | null>(guardado ?? null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  async function analizar() {
    setCargando(true); setError("");
    try {
      const res = await fetch("/api/plata/analisis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mes: r.nombre, datos: paraIA(r) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "No se pudo analizar.");
      setA(j.analisis);
      avisarGuia("analisis");
      guardar([{ id: nid(), tipo: "ajuste", clave, valor: j.analisis }], "");
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }
  if (!a) return (
    <div className="pn-tarjeta pl-ia is-vacia" data-guia="analisis">
      <span className="pl-ia-ico"><Icon n="chispa" s={26} /></span>
      <div><b>Análisis con IA</b><p>Te explico cómo te fue en {r.nombre.split(" ")[0].toLowerCase()} y qué podés hacer para que el próximo mes te vaya mejor.</p></div>
      <button className="pn-btn" disabled={cargando || (!r.entro && !r.salio)} onClick={analizar}>{cargando ? <><span className="pn-girando is-chico" />Analizando…</> : "Analizar mi mes"}</button>
      {error && <p className="pn-alerta">{error}</p>}
    </div>
  );
  return (
    <div className="pn-tarjeta pl-ia" data-guia="analisis">
      <p className="pl-ia-etq"><Icon n="chispa" s={20} />Análisis con IA</p>
      <h3>{a.titular}</h3>
      <ul className="pl-puntos">{a.puntos.map((p, i) => <li key={i} className={"is-" + p.tipo}><span>{p.tipo === "bien" ? "Bien" : p.tipo === "ojo" ? "Ojo" : "Idea"}</span>{p.texto}</li>)}</ul>
      {a.recomendaciones.length > 0 && (
        <>
          <h4>Para el próximo mes</h4>
          <ol className="pl-recos">{a.recomendaciones.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </>
      )}
      <button className="pn-txt" disabled={cargando} onClick={analizar}>{cargando ? "Analizando…" : "Volver a analizar"}</button>
    </div>
  );
}

/** Formulario para anotar plata a mano (también se lo puede decir al asistente). */
function Anotar({ d, sentido, guardar, cerrar }: { d: Datos; sentido: Sentido; guardar: G; cerrar: () => void }) {
  const cats = categoriasDe(d, sentido);
  const [f, setF] = useState({ monto: "", categoria: cats[0], metodo: "SINPE", feria: "", persona: "", fecha: hoy(), concepto: "" });
  const conocidas = d.personas.filter((p) => (sentido === "ingreso" ? p.rol !== "proveedor" : p.rol !== "clienta")).slice(0, 6);
  return (
    <form className="pn-tarjeta pl-anotar" onSubmit={async (e) => {
      e.preventDefault();
      const monto = Number(f.monto.replace(/\D/g, ""));
      if (!monto) return;
      const ok = await guardar([{ id: nid(), tipo: "movimiento", sentido, monto, moneda: "CRC", categoria: f.categoria, metodo: f.metodo, concepto: f.concepto.trim() || f.categoria, feria: f.feria || undefined, persona: f.persona.trim() || undefined, fecha: f.fecha }], sentido === "ingreso" ? "Venta anotada." : "Gasto anotado.");
      if (ok) cerrar();
    }}>
      <h3>{sentido === "ingreso" ? "Entró plata" : "Salió plata"}</h3>
      <label className="pl-monto"><span>₡</span><input inputMode="numeric" autoFocus value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value.replace(/[^\d]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ") })} placeholder="0" aria-label="Monto en colones" /></label>
      <p className="pn-etq">{sentido === "ingreso" ? "¿De qué fue?" : "¿En qué se fue?"}</p>
      <div className="pn-chips">{cats.map((c) => <button type="button" key={c} className={f.categoria === c ? "is-on" : ""} onClick={() => setF({ ...f, categoria: c })}>{c}</button>)}</div>
      <p className="pn-etq">¿Cómo se pagó?</p>
      <div className="pn-chips">{METODOS.filter((m) => m !== "ONVO").map((m) => <button type="button" key={m} className={f.metodo === m ? "is-on" : ""} onClick={() => setF({ ...f, metodo: m })}>{m}</button>)}</div>
      <label className="pn-campo"><span>{sentido === "ingreso" ? "¿Quién compró? (opcional)" : "¿A quién le pagaste? (opcional)"}</span>
        <input value={f.persona} onChange={(e) => setF({ ...f, persona: e.target.value })} placeholder="Nombre" list="pl-personas" autoComplete="off" />
        <datalist id="pl-personas">{d.personas.map((p) => <option key={p.nombre} value={p.nombre} />)}</datalist>
      </label>
      {conocidas.length > 0 && !f.persona && <div className="pn-chips is-chicos">{conocidas.map((p) => <button type="button" key={p.nombre} onClick={() => setF({ ...f, persona: p.nombre, categoria: sentido === "gasto" && p.categoria && cats.includes(p.categoria) ? p.categoria : f.categoria })}>{p.nombre}</button>)}</div>}
      <label className="pn-campo"><span>Detalle (opcional)</span><input value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder={sentido === "ingreso" ? "Ej.: 2 blusas Aura" : "Ej.: tela de lino"} /></label>
      <div className="pl-dos-campos">
        <label className="pn-campo"><span>Fecha</span><input type="date" value={f.fecha} max={hoy()} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
        {d.ferias.length > 0 && <label className="pn-campo"><span>¿En una feria?</span><select value={f.feria} onChange={(e) => setF({ ...f, feria: e.target.value })}><option value="">No</option>{d.ferias.slice(0, 8).map((x) => <option key={x.id} value={x.nombre}>{x.nombre}</option>)}</select></label>}
      </div>
      <div className="pn-botones">
        <button className="pn-btn is-grande" disabled={!Number(f.monto.replace(/\D/g, ""))}><Icon n="check" s={22} />Guardar</button>
        <button type="button" className="pn-btn is-gris is-grande" onClick={cerrar}>Cancelar</button>
      </div>
    </form>
  );
}

export default function Plata({ d, tc, guardar }: { d: Datos; tc: TipoCambio; guardar: G }) {
  const [mes, setMes] = useState(mesActual());
  const [anotar, setAnotar] = useState<Sentido | null>(null);
  const [todos, setTodos] = useState(false);
  const [anular, setAnular] = useState<string | null>(null);
  const r = reporte(d, mes);
  const esteMes = mes === mesActual();
  const movs = todos ? r.movs : r.movs.slice(0, 12);
  const anuladosMes = d.movs.filter((m) => m.anulado && m.fecha.startsWith(mes));

  async function compartir() {
    const t = `Eucalipto Chic · ${r.nombre}\nEntró: ${fmt(r.entro)}\nSalió: ${fmt(r.salio)}\nQuedó: ${fmt(r.queda)}\n${r.gastos.slice(0, 4).map((g) => `· ${g.nombre}: ${fmt(g.monto)}`).join("\n")}`;
    try { if (navigator.share) await navigator.share({ title: `Reporte ${r.nombre}`, text: t }); else { await navigator.clipboard.writeText(t); } } catch {}
  }

  return (
    <section className="pn-seccion">
      <header className="pn-titulo">
        <h1>Plata</h1>
        <p>Tu reporte del mes. También podés decirle al asistente: «vendí 60 mil en la feria, 40 en efectivo y 20 por SINPE».</p>
      </header>

      <div className="pl-mes">
        <button className="pn-icono" onClick={() => setMes(mover(mes, -1))} aria-label="Mes anterior"><Icon n="atras" s={24} /></button>
        <b>{r.nombre}</b>
        <button className="pn-icono" disabled={esteMes} onClick={() => setMes(mover(mes, 1))} aria-label="Mes siguiente"><Icon n="flecha" s={24} /></button>
      </div>

      <div className="pl-hero">
        <span>{esteMes ? "Te queda este mes" : "Te quedó"}</span>
        <b className={r.queda < 0 ? "is-rojo" : ""}>{fmt(r.queda)}</b>
        {r.antes.entro + r.antes.salio > 0 && <small>{cambio(r.queda, r.antes.queda, r.antes.nombre)}</small>}
        <dl>
          <div><dt>Entró</dt><dd>{fmt(r.entro)}</dd><small>{cambio(r.entro, r.antes.entro, r.antes.nombre)}</small></div>
          <div><dt>Salió</dt><dd>{fmt(r.salio)}</dd><small>{cambio(r.salio, r.antes.salio, r.antes.nombre)}</small></div>
        </dl>
      </div>

      {anotar ? <Anotar d={d} sentido={anotar} guardar={guardar} cerrar={() => setAnotar(null)} /> : (
        <div className="pn-botones" data-guia="anotar">
          <button className="pn-btn is-grande is-tinte" onClick={() => setAnotar("ingreso")}><Icon n="mas" s={24} />Entró plata</button>
          <button className="pn-btn is-grande is-rosa" onClick={() => setAnotar("gasto")}><Icon n="menos" s={24} />Salió plata</button>
        </div>
      )}

      <AnalisisIA key={mes} r={r} d={d} guardar={guardar} />

      <div className="pn-tarjeta pl-cifras">
        <dl className="pn-numeros">
          <div><dt>Ventas</dt><dd>{r.ventas}</dd></div>
          <div><dt>Promedio por venta</dt><dd>{fmt(r.promedio)}</dd></div>
          <div><dt>IVA incluido</dt><dd>{fmt(r.iva)}</dd></div>
        </dl>
        <p className="pn-nota">El IVA es el 13 % que ya viene dentro de lo que entró, si estás inscrita en Hacienda.</p>
      </div>

      <Barras titulo="En qué se fue la plata" filas={r.gastos} total={r.salio} color="gasto" />
      <Barras titulo="De dónde entró" filas={r.canales} total={r.entro} />
      <Barras titulo="Cómo te pagaron" filas={r.metodos} total={r.entro} />
      {r.ferias.length > 0 && (
        <div className="pn-tarjeta pl-barras">
          <h3>Ferias del mes</h3>
          <ul className="pl-ferias">{r.ferias.map((f) => <li key={f.nombre}><b>{f.nombre}</b><span>Vendió {fmt(f.vendio)} · gastó {fmt(f.gasto)}</span><strong className={f.dejo < 0 ? "is-rojo" : ""}>{fmt(f.dejo)}</strong></li>)}</ul>
        </div>
      )}
      <Barras titulo="Personas" filas={r.personas} total={r.personas.reduce((a, b) => a + b.monto, 0)} />

      <div className="pl-movs-cab"><h2 className="pn-sub">Movimientos</h2>{r.movs.length > 0 && <button className="pn-txt" onClick={compartir}><Icon n="enviar" s={18} />Compartir reporte</button>}</div>
      {r.movs.length === 0 ? <p className="pn-vacio">No hay movimientos en {r.nombre.split(" ")[0].toLowerCase()}. Contáselos al asistente o tocá «Entró plata».</p> : (
        <ul className="pn-grupo pl-movs">
          {movs.map((m) => (
            <li key={m.id}>
              <span className={"pl-signo is-" + m.sentido}><Icon n={m.sentido === "ingreso" ? "mas" : "menos"} s={18} /></span>
              <div className="pl-mov-txt"><b>{m.concepto}</b><small>{[m.categoria, m.metodo, m.persona, m.feria, fechaLinda(m.fecha)].filter(Boolean).join(" · ")}</small></div>
              <strong className={"is-" + m.sentido}>{m.sentido === "gasto" ? "−" : "+"}{fmt(m.crc)}</strong>
              {anular === m.id ? (
                <div className="pl-anular"><span>¿Anularlo?</span><button className="pn-btn is-peligro is-chico" onClick={() => { guardar([{ id: nid(), tipo: "anular", mov: m.id, nombre: m.concepto }], "Movimiento anulado."); setAnular(null); }}>Sí</button><button className="pn-btn is-gris is-chico" onClick={() => setAnular(null)}>No</button></div>
              ) : <button className="pn-icono is-chico" aria-label="Anular" onClick={() => setAnular(m.id)}><Icon n="puntos" s={22} /></button>}
            </li>
          ))}
        </ul>
      )}
      {r.movs.length > 12 && !todos && <button className="pn-txt is-centro" onClick={() => setTodos(true)}>Ver los {r.movs.length}</button>}
      {anuladosMes.length > 0 && <p className="pn-nota">Anulados este mes: {anuladosMes.length} (no cuentan).</p>}
      {tc && <p className="pn-nota">Dólar de Hacienda hoy: {fmt(tc.compra)} compra, {fmt(tc.venta)} venta.</p>}
    </section>
  );
}
