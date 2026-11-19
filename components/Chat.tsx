"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  categoriasDe, describir, fmt, hoy, METODOS, porFeria, respuestaCorta, resumenMes,
  type Accion, type Datos, type Pieza, type TipoCambio,
} from "@/lib/asistente";
import { pensarLocal, type Movimiento, type Pendiente, type Pensado, type Seccion, type Tarjeta } from "@/lib/cerebro";
import { mesActual, reporte } from "@/lib/reporte";
import type { Pregunta } from "@/lib/revision";
import { Promocionar, Publicar } from "./Anuncios";
import { FichaFeria } from "./FeriasPanel";
import { callar, desbloquear, hablar } from "./hablar";
import Icon from "./Icon";
import Revision from "./Revision";
import { FichaProducto, RehacerFoto } from "./Tienda";
import Disenador from "./Disenador";
import { achicarFoto } from "./achicar";
import type { PedidoGuia } from "@/lib/guias";
export { achicarFoto };
import { Escuchando, useVoz } from "./Voz";

export type Mensaje = { id: string; de: "ella" | "asis"; texto: string; tarjeta?: Tarjeta; hecho?: boolean; nota?: string; motor?: string };
type G = (a: Accion[], msg?: string) => Promise<boolean>;
type Props = {
  d: Datos; piezas: Pieza[]; colecciones: string[]; tipos: string[]; tc: TipoCambio; enLinea: boolean;
  guardar: G; irA: (s: Seccion, pedido?: PedidoGuia) => void; subirFotos: (p: Pieza, f: File[]) => Promise<boolean>;
  avisar: (m: string, malo?: boolean) => void; clave: string; vozOn: boolean; preguntas: Pregunta[];
  refrescar: () => Promise<void>;
};
const nid = () => crypto.randomUUID();

export default function Chat(props: Props) {
  const { d, piezas, colecciones, tc, enLinea, guardar, irA, avisar, clave, vozOn, preguntas } = props;
  const [msgs, setMsgs] = useState<Mensaje[]>([]);
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const [pensando, setPensando] = useState(false);
  const [escrito, setEscrito] = useState("");
  const fin = useRef<HTMLDivElement>(null);
  const conversando = useRef(false);

  // La conversación queda guardada en el teléfono (solo el texto; las tarjetas viejas ya no se tocan).
  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem(clave) ?? "[]") as Mensaje[]; if (Array.isArray(g)) setMsgs(g.slice(-40)); } catch {}
  }, [clave]);
  useEffect(() => {
    try { localStorage.setItem(clave, JSON.stringify(msgs.slice(-40).map(({ tarjeta, ...m }) => ({ ...m, hecho: true, tarjeta: tarjeta?.tipo === "resumen" ? tarjeta : undefined })))); } catch {}
    // Si lo último es una ficha larga (producto, feria…), se muestra desde arriba, donde empieza (la foto);
    // si no, se baja hasta el final como en cualquier chat.
    if (msgs.length) requestAnimationFrame(() => {
      const todos = document.querySelectorAll<HTMLElement>(".ch-hilo > .ch-msg");
      const ult = todos[todos.length - 1];
      const libre = window.innerHeight - 250;
      if (ult?.classList.contains("is-asis") && ult.querySelector(".ch-tarjeta") && ult.offsetHeight > libre) ult.scrollIntoView({ behavior: "smooth", block: "start" });
      else fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [msgs, clave]);

  const cerrarTarjeta = useCallback((id: string, nota?: string, dicho?: string) => {
    setMsgs((m) => [...m.map((x) => (x.id === id ? { ...x, hecho: true, nota } : x)), ...(dicho ? [{ id: nid(), de: "asis" as const, texto: dicho }] : [])]);
    if (dicho && conversando.current && vozOn) hablar(dicho);
  }, [vozOn]);

  const mes = resumenMes(d);
  const contexto = useMemo(() => {
    const r = reporte(d, mesActual());
    const personasMes = r.personas.map((p) => `${p.nombre}: ${fmt(p.monto)}`).join(", ");
    return {
      piezas: piezas.map(({ slug, nombre, precio, tipo, coleccion, oculta, tallas, foto }) => ({ slug, nombre, precio, tipo, coleccion, oculta, tallas, sinFoto: !foto })),
      colecciones,
      ferias: d.ferias.map((f) => ({ id: f.id, nombre: f.nombre, fecha: f.fecha, lugar: f.lugar })),
      resumen: `Este mes (${r.nombre}) entraron ${fmt(mes.entro)} y salieron ${fmt(mes.salio)}; queda ${fmt(mes.queda)}. El mes pasado (${r.antes.nombre}) entraron ${fmt(r.antes.entro)} y salieron ${fmt(r.antes.salio)}. Gastos por categoría este mes: ${r.gastos.map((g) => `${g.nombre} ${fmt(g.monto)}`).join(", ") || "ninguno"}. Por persona: ${personasMes || "nadie"}. Ferias: ${d.ferias.slice(0, 6).map((f) => { const x = porFeria(d, f.nombre); return `${f.nombre} vendió ${fmt(x.vendio)}, gastó ${fmt(x.gasto)}`; }).join("; ") || "ninguna"}.`,
      movs: d.movs.filter((m) => !m.anulado).slice(0, 40).map(({ id, fecha, sentido, crc, categoria, metodo, persona, concepto, feria }) => ({ id, fecha, sentido, crc, categoria, metodo, persona, concepto, feria })),
      personas: d.personas, memoria: d.memoria, categorias: d.categorias, aprendido: d.aprendido, tipoCambio: tc,
      pendientes: preguntas.slice(0, 3).map((p) => p.texto), seccion: "inicio",
    };
  }, [piezas, colecciones, d, mes, tc, preguntas]);

  const decir = useCallback((texto: string, tarjeta?: Tarjeta, motor?: string) => {
    setMsgs((m) => [...m, { id: nid(), de: "asis", texto, tarjeta, motor }]);
  }, []);

  const voz = useRef<ReturnType<typeof useVoz> | null>(null);

  const procesar = useCallback(async (texto: string, porVoz = false) => {
    const t = texto.trim();
    if (!t || pensando) return;
    conversando.current = porVoz;
    const previos = msgs;
    setMsgs((m) => [...m, { id: nid(), de: "ella", texto: t }]);

    // ¿Contestó "sí" o "no" a una confirmación abierta?
    const abierta = [...previos].reverse().find((m) => m.de === "asis" && !m.hecho && m.tarjeta?.tipo === "confirmar");
    if (abierta && abierta.tarjeta?.tipo === "confirmar") {
      const c = respuestaCorta(t);
      if (c === "si") {
        const ok = await guardar(abierta.tarjeta.acciones);
        cerrarTarjeta(abierta.id, ok ? "Andrea confirmó y se guardó." : "No se pudo guardar.", ok ? "¡Listo, guardado!" : "No se pudo guardar. Probá de nuevo.");
        return;
      }
      if (c === "no") { cerrarTarjeta(abierta.id, "Andrea dijo que no; no se guardó.", "Listo, no guardé nada. ¿Qué cambio?"); return; }
    }
    // Las preguntas con opciones que quedaron abiertas se cierran con lo que contestó.
    setMsgs((m) => m.map((x) => (x.de === "asis" && !x.hecho && x.tarjeta?.tipo === "opciones" ? { ...x, hecho: true, nota: `Andrea contestó: ${t}` } : x)));

    setPensando(true);
    let r: Pensado | null = null;
    try {
      const historial = previos.slice(-16).map(({ de, texto, tarjeta, nota }) => ({
        de, texto: texto + (tarjeta?.tipo === "confirmar" ? ` [Propuse: ${tarjeta.acciones.map(describir).join("; ")}]` : "") + (nota ? ` [${nota}]` : ""),
      }));
      const res = await fetch("/api/asistente", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto: t, contexto, historial, porVoz }) });
      if (res.status === 401) { location.href = "/admin/entrar"; return; }
      if (res.ok) r = await res.json();
    } catch {}
    if (!r || r.motor === "local" || !r.respuesta) r = { ...pensarLocal(t, piezas, d, tc, pendiente), motor: "local" };
    setPensando(false);
    setPendiente(r.pendiente ?? null);
    const tarjeta: Tarjeta | undefined = r.tarjeta ?? (r.acciones.length ? { tipo: "confirmar", acciones: r.acciones } : undefined);
    decir(r.respuesta, tarjeta, r.motor);

    // Modo conversación: si le habló por voz, contesta en voz alta y, si le hizo una pregunta, la vuelve a escuchar.
    if (porVoz && vozOn) {
      await hablar(r.respuesta);
      const sigue = /\?\s*$/.test(r.respuesta) && (!tarjeta || tarjeta.tipo === "opciones" || tarjeta.tipo === "confirmar");
      if (sigue && conversando.current) voz.current?.empezar(false);
    }
  }, [msgs, pensando, contexto, piezas, d, tc, pendiente, guardar, decir, cerrarTarjeta, vozOn]);

  const pistas = useMemo(() => ({ nombres: [...colecciones, ...d.ferias.map((f) => f.nombre), ...d.personas.map((p) => p.nombre)], piezas: piezas.map((p) => p.nombre) }), [colecciones, d.ferias, d.personas, piezas]);
  const v = useVoz({ alTexto: (t) => procesar(t, true), avisar, pistas });
  voz.current = v;

  const vacio = msgs.length === 0;
  const abrirFoto = (slug: string) => decir("Mandame la foto aquí y la dejo lista.", { tipo: "foto", slug });

  return (
    <section className="ch">
      <div className="ch-hilo" aria-live="polite">
        {vacio ? (
          <>
            <Saludo />
            <Bienvenida d={d} piezas={piezas} hablarle={() => v.empezar()} elegir={(o) => procesar(o)}>
              <Revision preguntas={preguntas} d={d} piezas={piezas} guardar={guardar} irA={irA} abrirFoto={abrirFoto} preguntarAlAsistente={(t) => procesar(t)} />
            </Bienvenida>
          </>
        ) : (
          <>
            <Etiqueta d={d} />
            <Revision preguntas={preguntas} d={d} piezas={piezas} guardar={guardar} irA={irA} abrirFoto={abrirFoto} preguntarAlAsistente={(t) => procesar(t)} />
          </>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={"ch-msg is-" + m.de}>
            <p className={"ch-burbuja is-" + m.de}>{m.texto}</p>
            {m.tarjeta && !m.hecho && (
              <TarjetaVista {...props} t={m.tarjeta} elegir={(o) => procesar(o, conversando.current)} cerrar={(nota, dicho) => cerrarTarjeta(m.id, nota, dicho)} />
            )}
            {m.hecho && m.nota && m.de === "asis" && m.tarjeta && <p className="ch-nota">{m.nota.replace(/^Andrea /, "")}</p>}
          </div>
        ))}
        {pensando && <div className="ch-msg is-asis"><p className="ch-burbuja is-asis ch-puntos" aria-label="Pensando"><i /><i /><i /></p></div>}
        <div ref={fin} className="ch-fin" />
      </div>

      <div className="ch-pie">
        {v.estado === "quieto" ? (
          <form className="ch-escribir" onSubmit={(e) => { e.preventDefault(); desbloquear(); callar(); procesar(escrito); setEscrito(""); }}>
            <input value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="Escribile al asistente" aria-label="Escribile al asistente" enterKeyHint="send" />
            {escrito.trim()
              ? <button className="ch-enviar" aria-label="Enviar"><Icon n="enviar" s={28} /></button>
              : <button type="button" className="ch-mic" onClick={() => v.empezar()} aria-label="Hablarle al asistente"><Icon n="mic" s={34} /></button>}
          </form>
        ) : <Escuchando voz={v} />}
      </div>
    </section>
  );
}

/** La "etiqueta" del mes: como la etiqueta colgante de una prenda, con lo que entró, salió y queda. */
export function Etiqueta({ d }: { d: Datos }) {
  const r = resumenMes(d);
  const mesNombre = new Date(hoy() + "T12:00:00").toLocaleDateString("es-CR", { month: "long" });
  const nada = !r.entro && !r.salio;
  return (
    <div className="etq" role="group" aria-label={`Resumen de ${mesNombre}`}>
      <div className={"etq-cuerpo" + (nada ? " is-vacia" : "")}>
        <p className="etq-mes">{mesNombre}</p>
        {nada ? <p className="etq-nada">Todavía no hay nada anotado este mes.</p> : (
          <>
            <p className="etq-queda"><small>Te queda</small><b>{fmt(r.queda)}</b></p>
            <dl>
              <div><dt>Entró</dt><dd>{fmt(r.entro)}</dd></div>
              <div><dt>Salió</dt><dd>{fmt(r.salio)}</dd></div>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}

/** Saludo según la hora, con la fecha de hoy. */
function Saludo() {
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => setAhora(new Date()), []);
  if (!ahora) return <div className="ch-saludo" aria-hidden><h1>&nbsp;</h1><p>&nbsp;</p></div>;
  const h = ahora.getHours();
  const hola = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const fecha = ahora.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long" });
  return <div className="ch-saludo"><h1>{hola}, Andrea</h1><p>{fecha.replace(/^./, (c) => c.toUpperCase())}</p></div>;
}

const ACCIONES: [string, string, string][] = [
  ["Anotar una venta", "moneda", "Lo que te pagaron"],
  ["Anotar un gasto", "menos", "Lo que pagaste"],
  ["Meter un producto nuevo", "percha", "Con foto, precio y tallas"],
  ["Promocionar un post", "megafono", "En Instagram y Facebook"],
  ["Agregar una feria", "carpa", "Para que salga en la página"],
  ["¿Cómo voy este mes?", "grafica", "Tu resumen y consejos"],
];

/** Pantalla de inicio: el micrófono grande (lo principal es hablarle) y lo que más hace, en botones grandes. */
function Bienvenida({ d, piezas, hablarle, elegir, children }: { d: Datos; piezas: Pieza[]; hablarle: () => void; elegir: (t: string) => void; children?: React.ReactNode }) {
  const ejemplos = useMemo(() => {
    const pz = piezas.find((p) => p.precio && !p.oculta);
    const quien = d.personas.find((p) => p.rol !== "clienta")?.nombre ?? "Juanita";
    return [
      pz ? `Vendí ${/a$/i.test(pz.nombre.split(/[\s/]/)[0]) ? "la" : "el"} ${pz.nombre} en ${fmt(pz.precio)} por SINPE` : "Vendí una blusa por SINPE",
      `Le pagué ${fmt(15000)} a ${quien}`,
      "¿Cómo voy este mes?",
      "Quiero promocionar mi último post",
    ];
  }, [d.personas, piezas]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % ejemplos.length), 4200);
    return () => clearInterval(t);
  }, [ejemplos.length]);
  return (
    <div className="ch-bienvenida">
      <div className="ch-hablame">
        <button className="ch-mic-grande" onClick={hablarle} aria-label="Hablarle al asistente"><Icon n="mic" s={44} /></button>
        <p className="ch-hablame-txt"><b>Tocá y hablame</b><span>Cuando suene el tilín, contame como a una persona. Por ejemplo:</span></p>
        <p className="ch-ejemplo" key={i}>«{ejemplos[i]}»</p>
      </div>
      {children}
      <p className="ch-o">O tocá lo que querés hacer</p>
      <div className="ch-acciones">
        {ACCIONES.map(([t, ic, sub]) => (
          <button key={t} onClick={() => elegir(t)}>
            <span className="ch-acc-ico"><Icon n={ic} s={26} /></span>
            <span className="ch-acc-txt"><b>{t}</b><small>{sub}</small></span>
          </button>
        ))}
      </div>
      <Etiqueta d={d} />
    </div>
  );
}

function Opciones({ ops, elegir }: { ops: string[]; elegir: (o: string) => void }) {
  return <div className="ch-opciones">{ops.map((o) => <button key={o} onClick={() => elegir(o)}>{o}</button>)}</div>;
}

type VistaProps = Props & { t: Tarjeta; elegir: (texto: string) => void; cerrar: (nota?: string, dicho?: string) => void };

function TarjetaVista(p: VistaProps) {
  const { t } = p;
  switch (t.tipo) {
    case "opciones": return t.ops.length ? <Opciones ops={t.ops} elegir={p.elegir} /> : null;
    case "ir": return <div className="ch-tarjeta is-chica"><button className="pn-btn" onClick={() => { p.irA(t.seccion, t.tarea ? { tarea: t.tarea, slug: t.slug, feria: t.feria } : undefined); p.cerrar("Andrea fue a " + t.seccion + (t.tarea ? ` (guiada: ${t.tarea})` : "")); }}>{t.boton}<Icon n="flecha" s={22} /></button></div>;
    case "resumen": return <Etiqueta d={p.d} />;
    case "reporte": {
      const r = reporte(p.d, mesActual());
      return (
        <div className="ch-tarjeta">
          <dl className="pn-numeros"><div><dt>Entró</dt><dd>{fmt(r.entro)}</dd></div><div><dt>Salió</dt><dd>{fmt(r.salio)}</dd></div><div className="is-fuerte"><dt>Quedó</dt><dd>{fmt(r.queda)}</dd></div></dl>
          {r.gastos[0] && <p className="pn-nota">Donde más se fue: {r.gastos[0].nombre} ({fmt(r.gastos[0].monto)}).</p>}
          <button className="pn-btn" onClick={() => { p.irA("plata"); p.cerrar("Andrea abrió el reporte"); }}><Icon n="grafica" s={22} />Ver el reporte con el análisis</button>
        </div>
      );
    }
    case "confirmar": return <Confirmar acciones={t.acciones} aprendo={t.aprendo} d={p.d} guardar={p.guardar} cerrar={p.cerrar} />;
    case "categoria": return <Categoria mov={t.mov} clave={t.clave} d={p.d} guardar={p.guardar} cerrar={p.cerrar} />;
    case "posts": return p.enLinea
      ? <div className="ch-tarjeta"><Promocionar ferias={p.d.ferias} que={t.que} avisar={p.avisar} listo={(x) => p.cerrar("Se promocionó.", x)} cancelar={() => p.cerrar("Andrea canceló la promoción.", "Listo, no promocioné nada.")} /></div>
      : <p className="ch-tarjeta pn-nota">Las promociones se hacen cuando el panel está conectado.</p>;
    case "publicar": return p.enLinea
      ? <div className="ch-tarjeta"><Publicar piezas={p.piezas} que={t.que} idea={t.caption} avisar={p.avisar} listo={(x) => p.cerrar("Se publicó en Instagram.", x)} cancelar={() => p.cerrar("Andrea canceló la publicación.", "Listo, no publiqué nada.")} /></div>
      : <p className="ch-tarjeta pn-nota">Para publicar, el panel tiene que estar conectado.</p>;
    case "producto": return <div className="ch-tarjeta"><FichaProducto inicial={t.borrador} piezas={p.piezas} colecciones={p.colecciones} tipos={p.tipos} guardar={p.guardar} subir={p.subirFotos} avisar={p.avisar} refrescar={p.refrescar} listo={(x) => p.cerrar("Se guardó el producto.", x)} cancelar={() => p.cerrar("Andrea canceló el producto.", "Listo, no guardé nada.")} /></div>;
    case "feria": return <div className="ch-tarjeta"><FichaFeria inicial={t.borrador} guardar={p.guardar} listo={(f) => p.cerrar(`Se anotó la feria ${f.nombre}.`, `¡Listo! ${f.nombre} ya está anotada. ¿La promocionamos unos días antes?`)} cancelar={() => p.cerrar("Andrea canceló la feria.", "Listo, no anoté nada.")} /></div>;
    case "foto": return <FlujoFoto slug={t.slug} piezas={p.piezas} subirFotos={p.subirFotos} avisar={p.avisar} cerrar={p.cerrar} />;
    case "disenar": return (
      <div className="ch-tarjeta">
        <Disenador d={p.d} piezas={p.piezas} pre={t.pre} avisar={p.avisar} refrescar={p.refrescar}
          listo={(x) => p.cerrar("Andrea publicó el diseño.", x)} cancelar={() => p.cerrar("Andrea cerró el diseñador.", "Listo. Cuando querás hacemos otro.")} />
      </div>
    );
    case "rehacer": {
      const pz = p.piezas.find((x) => x.slug === t.slug);
      if (!pz) return null;
      if (!p.enLinea) return <p className="ch-tarjeta pn-nota">Para rehacer la foto, el panel tiene que estar conectado.</p>;
      return (
        <div className="ch-tarjeta">
          <RehacerFoto p={pz} inicial={t.texto} avisar={p.avisar} refrescar={p.refrescar}
            cerrar={(ok) => p.cerrar(ok ? `Se rehízo la foto de IA de ${pz.nombre}.` : "Andrea no quiso rehacer la foto.", ok ? `¡Listo! La foto nueva de ${pz.nombre} está en Tienda, arriba en «Fotos nuevas hechas con IA». Si te gusta, la ponés de portada.` : "Listo, no rehice nada.")} />
        </div>
      );
    }
  }
}

/** Lo que el asistente entendió, para que Andrea lo confirme. Cada movimiento se puede corregir antes de guardar. */
function Confirmar({ acciones: iniciales, aprendo, d, guardar, cerrar }: { acciones: Accion[]; aprendo?: string; d: Datos; guardar: G; cerrar: (nota?: string, dicho?: string) => void }) {
  const [acciones, setAcciones] = useState(iniciales);
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cambiar = (id: string, c: Partial<Movimiento>) => setAcciones((l) => l.map((a) => (a.id === id && a.tipo === "movimiento" ? { ...a, ...c } : a)));
  return (
    <div className="ch-tarjeta">
      <ul className="ch-acciones">
        {acciones.map((a) => (
          <li key={a.id}>
            <div className="ch-accion"><Icon n="check" s={20} /><span>{describir(a)}</span>
              {a.tipo === "movimiento" && editando !== a.id && <button className="pn-txt" onClick={() => setEditando(a.id)}>Corregir</button>}
            </div>
            {a.tipo === "movimiento" && editando === a.id && (
              <div className="ch-editar">
                <label className="pn-campo"><span>Monto</span><span className="pn-con-prefijo"><span>{a.moneda === "USD" ? "$" : "₡"}</span><input inputMode="numeric" defaultValue={a.monto} onChange={(e) => { const n = Number(e.target.value.replace(/[^\d.]/g, "")); if (n > 0) cambiar(a.id, { monto: n }); }} /></span></label>
                <p className="pn-etq">Categoría</p>
                <div className="pn-chips">{categoriasDe(d, a.sentido).map((c) => <button key={c} className={a.categoria === c ? "is-on" : ""} onClick={() => cambiar(a.id, { categoria: c })}>{c}</button>)}</div>
                <p className="pn-etq">Cómo se pagó</p>
                <div className="pn-chips">{METODOS.filter((m) => m !== "ONVO").map((m) => <button key={m} className={a.metodo === m ? "is-on" : ""} onClick={() => cambiar(a.id, { metodo: m })}>{m}</button>)}</div>
                <label className="pn-campo"><span>{a.sentido === "ingreso" ? "¿De quién?" : "¿A quién?"}</span><input defaultValue={a.persona ?? ""} onChange={(e) => cambiar(a.id, { persona: e.target.value.trim() || undefined })} placeholder="Nombre (opcional)" /></label>
                <label className="pn-campo"><span>Fecha</span><input type="date" defaultValue={a.fecha} max={hoy()} onChange={(e) => e.target.value && cambiar(a.id, { fecha: e.target.value })} /></label>
                <button className="pn-btn is-tinte" onClick={() => setEditando(null)}>Listo</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {aprendo && <p className="pn-nota">{aprendo}</p>}
      {!editando && (
        <div className="pn-botones">
          <button className="pn-btn is-grande" disabled={ocupado} onClick={async () => { setOcupado(true); const ok = await guardar(acciones); setOcupado(false); if (ok) cerrar("Andrea confirmó y se guardó.", "¡Listo, guardado!"); }}><Icon n="check" s={24} />{ocupado ? "Guardando…" : "Sí, guardalo"}</button>
          <button className="pn-btn is-gris is-grande" disabled={ocupado} onClick={() => cerrar("Andrea dijo que no; no se guardó.", "Listo, no guardé nada. ¿Qué cambio?")}>No</button>
        </div>
      )}
    </div>
  );
}

/** Gasto que el asistente no conocía: Andrea escoge (o crea) la categoría y el asistente la aprende. */
function Categoria({ mov, clave, d, guardar, cerrar }: { mov: Movimiento; clave?: string; d: Datos; guardar: G; cerrar: (nota?: string, dicho?: string) => void }) {
  const [nueva, setNueva] = useState(false);
  const [nombre, setNombre] = useState("");
  const [elegida, setElegida] = useState<string | null>(null);
  const ops = categoriasDe(d, mov.sentido).filter((c) => c !== "Otro");
  if (elegida) {
    const aprender: Accion = { id: nid(), tipo: "aprender", sentido: mov.sentido, categoria: elegida, clave };
    return <Confirmar acciones={[{ ...mov, id: mov.id || nid(), categoria: elegida }]} d={d} aprendo={clave ? `La próxima vez que digás «${clave}», ya sé que va en ${elegida}.` : `Ya aprendí la categoría ${elegida}.`}
      guardar={(a) => guardar([aprender, ...a])} cerrar={cerrar} />;
  }
  return (
    <div className="ch-tarjeta">
      {!nueva ? (
        <div className="pn-chips">
          {ops.map((c) => <button key={c} onClick={() => setElegida(c)}>{c}</button>)}
          <button className="is-otra" onClick={() => setNueva(true)}><Icon n="mas" s={18} />Otra cosa</button>
        </div>
      ) : (
        <form className="ch-nueva" onSubmit={(e) => { e.preventDefault(); const n = nombre.trim(); if (n.length >= 2) setElegida(n[0].toUpperCase() + n.slice(1, 40)); }}>
          <label className="pn-campo"><span>¿Cómo le ponemos a ese gasto?</span><input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Planchado, Empaques, Gasolina" /></label>
          <div className="pn-botones"><button className="pn-btn" disabled={nombre.trim().length < 2}>Listo</button><button type="button" className="pn-btn is-gris" onClick={() => setNueva(false)}>Volver</button></div>
        </form>
      )}
    </div>
  );
}

/** Mejorar una foto: escoger la pieza, subir o escoger la foto, mejorarla con IA y usarla. */
function FlujoFoto({ slug, piezas, subirFotos, avisar, cerrar }: { slug?: string; piezas: Pieza[]; subirFotos: Props["subirFotos"]; avisar: Props["avisar"]; cerrar: (nota?: string, dicho?: string) => void }) {
  const [pieza, setPieza] = useState<Pieza | null>(() => piezas.find((p) => p.slug === slug) ?? null);
  const [busca, setBusca] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mejorada, setMejorada] = useState<string | null>(null);
  const [estado, setEstado] = useState<"" | "mejorando" | "subiendo" | "sin-ia">("");
  const antes = useMemo(() => (archivo ? URL.createObjectURL(archivo) : ""), [archivo]);
  useEffect(() => () => { if (antes) URL.revokeObjectURL(antes); }, [antes]);

  if (!pieza) {
    const n = busca.toLowerCase();
    const lista = piezas.filter((p) => !n || p.nombre.toLowerCase().includes(n)).slice(0, 12);
    return (
      <div className="ch-tarjeta">
        <label className="pn-buscar"><Icon n="buscar" s={22} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar la pieza" /></label>
        <ul className="ch-piezas">{lista.map((p) => (
          <li key={p.slug}><button onClick={() => setPieza(p)}>{p.foto ? <img src={p.foto} alt="" /> : <span className="ti-sinfoto"><Icon n="foto" s={22} /></span>}<span>{p.nombre}</span></button></li>
        ))}</ul>
      </div>
    );
  }

  async function mejorar(f: File) {
    setArchivo(f); setMejorada(null); setEstado("mejorando");
    try {
      const fd = new FormData();
      fd.set("slug", pieza!.slug); fd.set("imagen", await achicarFoto(f, 1600), "foto");
      const r = await fetch("/api/fotos/mejorar", { method: "POST", body: fd });
      if (r.status === 501) { setEstado("sin-ia"); return; }
      if (r.status === 401) { location.href = "/admin/entrar"; return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.imagen) throw new Error(j.error || "No se pudo mejorar la foto.");
      setMejorada(j.imagen); setEstado("");
    } catch (e) {
      setEstado(""); avisar((e as Error).message, true);
    }
  }
  async function usar(f: File, texto: string) {
    setEstado("subiendo");
    const ok = await subirFotos(pieza!, [f]);
    setEstado("");
    if (ok) cerrar("Se subió la foto.", texto);
  }

  return (
    <div className="ch-tarjeta ch-foto">
      <button className="ch-elegido" onClick={() => { setPieza(null); setArchivo(null); setMejorada(null); }}>
        {pieza.foto ? <img src={pieza.foto} alt="" /> : <span className="ti-sinfoto"><Icon n="percha" s={22} /></span>}<span>{pieza.nombre}</span><small>Cambiar</small>
      </button>
      {!archivo && (
        <label className="pn-btn is-grande"><Icon n="foto" s={24} />Tomar o escoger la foto
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) mejorar(f); }} />
        </label>
      )}
      {archivo && (
        <div className="ch-antes-despues">
          <figure><img src={antes} alt="Foto original" /><figcaption>Antes</figcaption></figure>
          <figure className={estado === "mejorando" ? "is-cargando" : ""}>
            {mejorada ? <img src={mejorada} alt="Foto mejorada" /> : <span className="pn-girando" />}
            <figcaption>{estado === "mejorando" ? "Mejorando… (un minutito)" : estado === "sin-ia" ? "IA sin conectar" : "Mejorada"}</figcaption>
          </figure>
        </div>
      )}
      {estado === "sin-ia" && archivo && (
        <div className="pn-botones"><button className="pn-btn" onClick={() => usar(archivo, `Listo, la foto ya está en ${pieza.nombre}.`)}>Subirla así</button><button className="pn-btn is-gris" onClick={() => cerrar("No subió nada.", "Listo, no subí nada.")}>No</button></div>
      )}
      {mejorada && archivo && (
        <div className="pn-botones is-columna">
          <button className="pn-btn is-grande" disabled={estado === "subiendo"} onClick={async () => { const b = await (await fetch(mejorada)).blob(); usar(new File([b], "mejorada.webp", { type: b.type || "image/webp" }), `¡Listo! La foto mejorada ya está en ${pieza.nombre}.`); }}>
            <Icon n="check" s={22} />{estado === "subiendo" ? "Subiendo…" : "Usar la mejorada"}
          </button>
          <button className="pn-btn is-gris" disabled={estado === "subiendo"} onClick={() => usar(archivo, `Listo, subí la original a ${pieza.nombre}.`)}>Usar la original</button>
        </div>
      )}
    </div>
  );
}

/** Achica una foto antes de mandarla (más rápido y liviano). */
