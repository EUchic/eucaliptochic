"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  describir, fmt, hoy, porFeria, resumenMes, respuestaCorta,
  type Accion, type Datos, type Pieza, type TipoCambio,
} from "@/lib/asistente";
import { categoriasPara, pensarLocal, SUGERENCIAS, type Movimiento, type Pendiente, type Pensado, type Seccion, type Tarjeta } from "@/lib/cerebro";
import {
  apiAnuncios, arranques, calendario, conIva, DIAS, MONTOS, nidPromo, plata, RECOMENDADO, TOPES,
  type Arranque, type InfoAnuncios, type Post,
} from "@/lib/promo";
import Icon from "./Icon";
import PostIG from "./PostIG";
import { Autorizar, Rejilla } from "./Anuncios";
import { Escuchando, useVoz } from "./Voz";

export type Mensaje = { id: string; de: "ella" | "asis"; texto: string; tarjeta?: Tarjeta; hecho?: boolean; motor?: string };
type Props = {
  d: Datos; piezas: Pieza[]; colecciones: string[]; tc: TipoCambio; enLinea: boolean;
  guardar: (a: Accion[], msg?: string) => Promise<boolean>;
  irA: (s: Seccion) => void;
  subirFoto: (p: Pieza, f: File) => Promise<boolean>;
  hablar: (t: string) => void;
  avisar: (m: string, malo?: boolean) => void;
  clave: string;
};
const nid = () => crypto.randomUUID();

export default function Chat({ d, piezas, colecciones, tc, enLinea, guardar, irA, subirFoto, hablar, avisar, clave }: Props) {
  const [msgs, setMsgs] = useState<Mensaje[]>([]);
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const [pensando, setPensando] = useState(false);
  const [escrito, setEscrito] = useState("");
  const fin = useRef<HTMLDivElement>(null);

  // La conversación se guarda en el teléfono (solo el texto: las tarjetas viejas no se pueden volver a tocar).
  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem(clave) ?? "[]") as Mensaje[]; if (Array.isArray(g)) setMsgs(g.slice(-40)); } catch {}
  }, [clave]);
  useEffect(() => {
    try { localStorage.setItem(clave, JSON.stringify(msgs.slice(-40).map(({ tarjeta, ...m }) => ({ ...m, hecho: true, tarjeta: tarjeta?.tipo === "resumen" ? tarjeta : undefined })))); } catch {}
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, clave]);

  const decir = useCallback((texto: string, tarjeta?: Tarjeta, motor?: string) => {
    setMsgs((m) => [...m, { id: nid(), de: "asis", texto, tarjeta, motor }]);
    hablar(texto);
  }, [hablar]);
  const hecho = (id: string) => setMsgs((m) => m.map((x) => (x.id === id ? { ...x, hecho: true } : x)));

  const mes = resumenMes(d);
  const contexto = useMemo(() => ({
    piezas: piezas.map(({ slug, nombre, precio, tipo, coleccion, oculta }) => ({ slug, nombre, precio, tipo, coleccion, oculta })),
    colecciones,
    ferias: d.ferias.map((f) => ({ id: f.id, nombre: f.nombre, fecha: f.fecha, lugar: f.lugar })),
    resumen: `Este mes entraron ${fmt(mes.entro)} y salieron ${fmt(mes.salio)}. Gastos por categoría: ${Object.entries(mes.porCat).map(([k, v]) => `${k} ${fmt(v)}`).join(", ") || "ninguno"}. Por feria: ${d.ferias.map((f) => { const x = porFeria(d, f.nombre); return `${f.nombre} vendió ${fmt(x.vendio)}, gastó ${fmt(x.gasto)}`; }).join("; ") || "ninguna"}.`,
    categorias: d.categorias, aprendido: d.aprendido, tipoCambio: tc,
  }), [piezas, colecciones, d, mes, tc]);

  const procesar = useCallback(async (texto: string) => {
    const t = texto.trim();
    if (!t || pensando) return;
    const previos = msgs;
    setMsgs((m) => [...m, { id: nid(), de: "ella", texto: t }]);

    // ¿Contestó "sí" o "no" a una confirmación abierta?
    const abierta = [...previos].reverse().find((m) => m.de === "asis" && !m.hecho && m.tarjeta?.tipo === "confirmar");
    if (abierta && abierta.tarjeta?.tipo === "confirmar") {
      const c = respuestaCorta(t);
      if (c === "si") { hecho(abierta.id); const ok = await guardar(abierta.tarjeta.acciones); decir(ok ? "¡Listo, guardado!" : "No se pudo guardar. Probá de nuevo."); return; }
      if (c === "no") { hecho(abierta.id); decir("Listo, no guardé nada."); return; }
    }

    setPensando(true);
    let r: Pensado | null = null;
    try {
      const res = await fetch("/api/asistente", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto: t, contexto, historial: previos.slice(-10).map(({ de, texto }) => ({ de, texto })) }),
      });
      if (res.ok) r = await res.json();
    } catch {}
    if (!r || r.motor === "local" || !r.respuesta) r = { ...pensarLocal(t, piezas, d, tc, pendiente), motor: "local" };
    setPensando(false);
    setPendiente(r.pendiente ?? null);
    const tarjeta: Tarjeta | undefined = r.tarjeta ?? (r.acciones.length ? { tipo: "confirmar", acciones: r.acciones } : undefined);
    decir(r.respuesta, tarjeta, r.motor);
  }, [msgs, pensando, contexto, piezas, d, tc, pendiente, guardar, decir]);

  // Nombres que ayudan a entender bien el audio (piezas, colecciones y ferias de ella).
  const pistas = useMemo(() => ({
    nombres: [...colecciones, ...d.ferias.map((f) => f.nombre)],
    piezas: piezas.map((p) => p.nombre),
  }), [colecciones, d.ferias, piezas]);
  const voz = useVoz({ alTexto: procesar, avisar, pistas });

  const vacio = msgs.length === 0;

  return (
    <section className="ch">
      <div className="ch-hilo" aria-live="polite">
        {vacio && (
          <div className="ch-bienvenida">
            <Etiqueta d={d} />
            <p className="ch-burbuja is-asis">Hola, Andrea. Contame qué pasó hoy o qué ocupás, y yo me encargo. Podés hablarme con el micrófono.</p>
            <Opciones ops={SUGERENCIAS} elegir={procesar} />
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={"ch-msg is-" + m.de}>
            <p className={"ch-burbuja is-" + m.de}>{m.texto}</p>
            {m.tarjeta && !m.hecho && (
              <TarjetaVista
                t={m.tarjeta} d={d} piezas={piezas} enLinea={enLinea} guardar={guardar} irA={irA} subirFoto={subirFoto} avisar={avisar}
                elegir={procesar} cerrar={(dicho) => { hecho(m.id); if (dicho) decir(dicho); }}
              />
            )}
            {m.tarjeta?.tipo === "resumen" && m.hecho && <Etiqueta d={d} />}
          </div>
        ))}
        {pensando && <div className="ch-msg is-asis"><p className="ch-burbuja is-asis ch-puntos" aria-label="Pensando"><i /><i /><i /></p></div>}
        <div ref={fin} />
      </div>

      <div className="ch-pie">
        {voz.estado === "quieto" ? (
          <form className="ch-escribir" onSubmit={(e) => { e.preventDefault(); procesar(escrito); setEscrito(""); }}>
            <input value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="Escribile o tocá el micrófono" aria-label="Escribile al asistente" enterKeyHint="send" />
            {escrito.trim() ? (
              <button className="ch-enviar" aria-label="Enviar"><Icon n="flecha" s={30} /></button>
            ) : (
              <button type="button" className="ch-mic" onClick={voz.empezar} aria-label="Hablarle al asistente">
                <Icon n="mic" s={36} />
              </button>
            )}
          </form>
        ) : (
          <Escuchando voz={voz} />
        )}
      </div>
    </section>
  );
}

/** La "etiqueta" del mes: como la etiqueta colgante de una prenda, con lo que entró, salió y queda. */
export function Etiqueta({ d }: { d: Datos }) {
  const r = resumenMes(d);
  const mesNombre = new Date(hoy() + "T12:00:00").toLocaleDateString("es-CR", { month: "long" });
  return (
    <div className="etq" role="group" aria-label={`Resumen de ${mesNombre}`}>
      <span className="etq-hilo" aria-hidden />
      <div className="etq-cuerpo">
        <p className="etq-mes">{mesNombre}</p>
        <p className="etq-queda"><small>Te queda</small><b>{fmt(r.queda)}</b></p>
        <dl>
          <div><dt>Entró</dt><dd>{fmt(r.entro)}</dd></div>
          <div><dt>Salió</dt><dd>{fmt(r.salio)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

function Opciones({ ops, elegir }: { ops: string[]; elegir: (o: string) => void }) {
  return <div className="ch-opciones">{ops.map((o) => <button key={o} onClick={() => elegir(o)}>{o}</button>)}</div>;
}

type VistaProps = {
  t: Tarjeta; d: Datos; piezas: Pieza[]; enLinea: boolean;
  guardar: Props["guardar"]; irA: Props["irA"]; subirFoto: Props["subirFoto"]; avisar: Props["avisar"];
  elegir: (texto: string) => void; cerrar: (dicho?: string) => void;
};

function TarjetaVista(p: VistaProps) {
  const { t } = p;
  switch (t.tipo) {
    case "opciones": return <Opciones ops={t.ops} elegir={(o) => { p.cerrar(); p.elegir(o); }} />;
    case "ir": return <div className="ch-tarjeta is-chica"><button className="pn-boton" onClick={() => { p.irA(t.seccion); p.cerrar(); }}>{t.boton}<Icon n="flecha" s={22} /></button></div>;
    case "resumen": return <Etiqueta d={p.d} />;
    case "confirmar": return <Confirmar acciones={t.acciones} aprendo={t.aprendo} guardar={p.guardar} cerrar={p.cerrar} />;
    case "categoria": return <Categoria mov={t.mov} clave={t.clave} d={p.d} guardar={p.guardar} cerrar={p.cerrar} />;
    case "posts": return p.enLinea ? <FlujoPromo d={p.d} avisar={p.avisar} cerrar={p.cerrar} /> : <p className="ch-tarjeta pn-nota">Las promociones se hacen cuando el panel está conectado.</p>;
    case "foto": return <FlujoFoto slug={t.slug} piezas={p.piezas} subirFoto={p.subirFoto} avisar={p.avisar} cerrar={p.cerrar} />;
  }
}

function Confirmar({ acciones, aprendo, guardar, cerrar }: { acciones: Accion[]; aprendo?: string; guardar: Props["guardar"]; cerrar: (d?: string) => void }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="ch-tarjeta">
      <ul className="ch-acciones">{acciones.map((a) => <li key={a.id}><Icon n="check" s={20} />{describir(a)}</li>)}</ul>
      {aprendo && <p className="pn-nota">{aprendo}</p>}
      <div className="ch-sino">
        <button className="pn-boton" disabled={ocupado} onClick={async () => { setOcupado(true); const ok = await guardar(acciones); setOcupado(false); if (ok) cerrar("¡Listo, guardado!"); }}><Icon n="check" s={22} />{ocupado ? "Guardando…" : "Sí, guardalo"}</button>
        <button className="pn-link" disabled={ocupado} onClick={() => cerrar("Listo, no guardé nada.")}>No</button>
      </div>
    </div>
  );
}

/** Gasto que el asistente no conocía: Andrea escoge (o crea) la categoría y el asistente la aprende. */
function Categoria({ mov, clave, d, guardar, cerrar }: { mov: Movimiento; clave?: string; d: Datos; guardar: Props["guardar"]; cerrar: (d?: string) => void }) {
  const [nueva, setNueva] = useState(false);
  const [nombre, setNombre] = useState("");
  const [elegida, setElegida] = useState<string | null>(null);
  const ops = categoriasPara(d, mov.sentido).filter((c) => c !== "Otro");
  if (elegida) {
    const cat = elegida;
    const acciones: Accion[] = [
      { id: nid(), tipo: "aprender", sentido: mov.sentido, categoria: cat, clave },
      { ...mov, id: mov.id || nid(), categoria: cat },
    ];
    return <Confirmar acciones={acciones.slice(1)} aprendo={clave ? `La próxima vez que digás «${clave}», ya sé que va en ${cat}.` : undefined}
      guardar={(a) => guardar([acciones[0], ...a])} cerrar={cerrar} />;
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
          <div className="ch-sino"><button className="pn-boton" disabled={nombre.trim().length < 2}>Listo</button><button type="button" className="pn-link" onClick={() => setNueva(false)}>Volver</button></div>
        </form>
      )}
    </div>
  );
}

/** Promocionar un post desde el chat: post → días → monto → vista tipo Instagram → autorización. */
function FlujoPromo({ d, avisar, cerrar }: { d: Datos; avisar: Props["avisar"]; cerrar: (dicho?: string) => void }) {
  const [info, setInfo] = useState<InfoAnuncios | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const ops = useMemo(() => arranques(d.ferias), [d.ferias]);
  const [desde, setDesde] = useState<Arranque>(ops[0]);
  const [dias, setDias] = useState<number | null>(null);
  const [porDia, setPorDia] = useState<number | null>(null);
  const [autorizar, setAutorizar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [id] = useState(nidPromo);

  useEffect(() => {
    apiAnuncios().then(setInfo).catch((e) => avisar(e.message, true));
    apiAnuncios<{ posts: Post[] }>(undefined, "?que=posts").then((j) => setPosts(j.posts)).catch(() => setPosts([]));
  }, [avisar]);

  if (!info) return <p className="ch-tarjeta pn-nota">Un momento…</p>;
  if (!info.conectado) return <p className="ch-tarjeta pn-nota">Instagram todavía no está conectado con el panel.</p>;
  if (info.tope == null) return (
    <div className="ch-tarjeta">
      <p className="ch-pregunta">Antes: ¿cuánto es lo máximo que querés gastar en anuncios al mes? Nunca me paso de eso.</p>
      <div className="pn-chips">{TOPES.map((t) => <button key={t} onClick={async () => { try { setInfo(await apiAnuncios({ accion: "tope", monto: t })); } catch (e) { avisar((e as Error).message, true); } }}>{plata(t)} al mes</button>)}</div>
    </div>
  );

  const cal = dias ? calendario(desde, dias) : null;
  const total = cal && porDia ? porDia * cal.dias : 0;
  const cabe = conIva(total) <= (info.restante ?? 0);

  async function lanzar() {
    if (!post || !cal || !porDia) return;
    setEnviando(true);
    try {
      await apiAnuncios({ accion: "promocionar", confirmo: true, id, mediaId: post.id, porDia, dias: cal.dias, inicio: cal.inicio });
      setAutorizar(false);
      cerrar(`¡Listo! Tu promoción ${cal.inicio === hoy() ? "empieza en unos minutos" : "quedó programada"}. En Anuncios vas a ver a cuánta gente le llega y cuántas te escriben.`);
    } catch (e) {
      setAutorizar(false); avisar((e as Error).message, true);
    } finally { setEnviando(false); }
  }

  return (
    <div className="ch-tarjeta ch-promo">
      {!post ? (
        <Rejilla posts={posts} elegir={setPost} />
      ) : (
        <>
          <button className="ch-elegido" onClick={() => { setPost(null); setDias(null); setPorDia(null); }}>
            <img src={post.miniatura} alt="" /><span>Este post</span><small>Cambiar</small>
          </button>
          <p className="ch-pregunta">¿Desde cuándo y por cuántos días?</p>
          <div className="pn-chips">{ops.map((o) => <button key={o.clave} className={desde.clave === o.clave ? "is-on" : ""} onClick={() => setDesde(o)}>{o.etiqueta}</button>)}</div>
          <div className="pn-chips is-numeros">{DIAS.map((n) => <button key={n} className={dias === n ? "is-on" : ""} onClick={() => setDias(n)}>{n} {n === 1 ? "día" : "días"}</button>)}</div>
          {cal && (
            <>
              <p className="pn-nota">{cal.texto}</p>
              <p className="ch-pregunta">¿Cuánto por día? Te recomiendo {plata(RECOMENDADO)}.</p>
              <div className="pn-chips">{MONTOS.map((m) => <button key={m} className={porDia === m ? "is-on" : ""} onClick={() => setPorDia(m)}>{plata(m)}{m === RECOMENDADO ? " ★" : ""}</button>)}</div>
            </>
          )}
          {cal && porDia && (
            <>
              <p className="ch-pregunta">Así lo va a ver la gente:</p>
              <PostIG imagen={post.miniatura} texto={post.caption} />
              <p className="pn-nota">{cal.texto}. Máximo a cobrar: <b>{plata(conIva(total))}</b> con IVA. {info.publico}</p>
              {cabe ? (
                <div className="ch-sino"><button className="pn-boton" onClick={() => setAutorizar(true)}><Icon n="check" s={22} />Sí, promocionar</button><button className="pn-link" onClick={() => cerrar("Listo, no promocioné nada.")}>No, todavía no</button></div>
              ) : (
                <p className="an-alerta">Eso pasa tu tope del mes: te quedan {plata(info.restante ?? 0)}. Escogé menos días o menos por día.</p>
              )}
            </>
          )}
        </>
      )}
      {autorizar && <Autorizar total={conIva(total)} enviando={enviando} si={lanzar} no={() => setAutorizar(false)} />}
    </div>
  );
}

/** Mejorar una foto: escoger la pieza, subir o escoger la foto, mejorarla con IA y usarla. */
function FlujoFoto({ slug, piezas, subirFoto, avisar, cerrar }: { slug?: string; piezas: Pieza[]; subirFoto: Props["subirFoto"]; avisar: Props["avisar"]; cerrar: (d?: string) => void }) {
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
        <label className="pn-buscador"><Icon n="buscar" s={22} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar la pieza" /></label>
        <ul className="ch-piezas">{lista.map((p) => (
          <li key={p.slug}><button onClick={() => setPieza(p)}>{p.foto ? <img src={p.foto} alt="" /> : <span className="ch-sinfoto"><Icon n="foto" s={22} /></span>}<span>{p.nombre}</span></button></li>
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
    const ok = await subirFoto(pieza!, f);
    setEstado("");
    if (ok) cerrar(texto);
  }

  return (
    <div className="ch-tarjeta ch-foto">
      <button className="ch-elegido" onClick={() => { setPieza(null); setArchivo(null); setMejorada(null); }}>
        {pieza.foto ? <img src={pieza.foto} alt="" /> : <span className="ch-sinfoto"><Icon n="percha" s={22} /></span>}<span>{pieza.nombre}</span><small>Cambiar</small>
      </button>
      {!archivo && (
        <label className="pn-boton is-grande"><Icon n="foto" s={24} />Tomar o escoger una foto
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) mejorar(f); }} />
        </label>
      )}
      {archivo && (
        <div className="ch-antes-despues">
          <figure><img src={antes} alt="Foto original" /><figcaption>Antes</figcaption></figure>
          <figure className={estado === "mejorando" ? "is-cargando" : ""}>
            {mejorada ? <img src={mejorada} alt="Foto mejorada" /> : <span className="pn-girando" />}
            <figcaption>{estado === "mejorando" ? "Mejorando… (tarda un minutito)" : estado === "sin-ia" ? "IA sin conectar" : "Mejorada"}</figcaption>
          </figure>
        </div>
      )}
      {estado === "sin-ia" && archivo && (
        <>
          <p className="pn-nota">La mejora con IA se activa cuando se conecte OpenAI. Mientras tanto, ¿la subo así como está?</p>
          <div className="ch-sino"><button className="pn-boton" onClick={() => usar(archivo, `Listo, la foto ya está en ${pieza.nombre}.`)}>Subirla así</button><button className="pn-link" onClick={() => cerrar("Listo, no subí nada.")}>No</button></div>
        </>
      )}
      {mejorada && archivo && (
        <div className="ch-sino">
          <button className="pn-boton" disabled={estado === "subiendo"} onClick={async () => { const b = await (await fetch(mejorada)).blob(); usar(new File([b], "mejorada.webp", { type: b.type || "image/webp" }), `¡Listo! La foto mejorada ya está en ${pieza.nombre}.`); }}>
            <Icon n="check" s={22} />{estado === "subiendo" ? "Subiendo…" : "Usar la mejorada"}
          </button>
          <button className="pn-link" disabled={estado === "subiendo"} onClick={() => usar(archivo, `Listo, subí la original a ${pieza.nombre}.`)}>Usar la original</button>
        </div>
      )}
    </div>
  );
}

/** Achica una foto antes de mandarla (más rápido y liviano). */
export async function achicarFoto(archivo: Blob, lado: number): Promise<Blob> {
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
    let b = await hacer("image/webp", 0.86);
    if (!b || b.type !== "image/webp") b = await hacer("image/jpeg", 0.88);
    if (!b) throw new Error("No pude leer esa foto. Probá con otra.");
    return b;
  } catch (e) {
    throw e instanceof Error && e.message.startsWith("No pude") ? e : new Error("No pude leer esa foto. Probá con otra.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
