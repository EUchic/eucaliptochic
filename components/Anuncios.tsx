"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import PostIG from "./PostIG";
import type { Feria } from "@/lib/asistente";
import {
  apiAnuncios, arranques, calendario, conIva, DIAS, fechaCorta, hoyCR, MONTOS, nidPromo, plata, primeraLinea, RECOMENDADO, TOPES,
  type Arranque, type InfoAnuncios, type Post, type Promo,
} from "@/lib/promo";

// Promociones de Instagram, paso a paso y en palabras simples.
// Nada se cobra sin que Andrea toque "Sí, autorizo" en la última pantalla.

type Vista = "inicio" | "tope" | "post" | "cuando" | "cuanto" | "revisar" | "listo";
const PASOS: Vista[] = ["post", "cuando", "cuanto", "revisar"];

export default function Anuncios({ ferias, arrancar, alArrancar, avisar }: {
  ferias: Feria[]; arrancar: boolean; alArrancar: () => void; avisar: (m: string, mal?: boolean) => void;
}) {
  const [info, setInfo] = useState<InfoAnuncios | null>(null);
  const [error, setError] = useState("");
  const [vista, setVista] = useState<Vista>("inicio");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [desde, setDesde] = useState<Arranque | null>(null);
  const [dias, setDias] = useState(5);
  const [porDia, setPorDia] = useState(RECOMENDADO);
  const [otro, setOtro] = useState("");
  const [idPromo, setIdPromo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [topeOtro, setTopeOtro] = useState("");
  const [parando, setParando] = useState<string | null>(null);

  const cargar = useCallback(() => apiAnuncios().then(setInfo).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);

  const opciones = useMemo(() => arranques(ferias), [ferias]);
  const empezar = useCallback(() => {
    setPost(null); setDesde(opciones[0]); setDias(5); setPorDia(RECOMENDADO); setOtro(""); setIdPromo(nidPromo());
    setVista(info?.tope == null ? "tope" : "post");
  }, [info, opciones]);

  // Si Andrea llegó desde una sugerencia ("¿Querés promocionar…?"), abrimos directo el paso 1.
  useEffect(() => { if (arrancar && info?.conectado) { empezar(); alArrancar(); } }, [arrancar, info, empezar, alArrancar]);

  useEffect(() => {
    if (vista !== "post" || posts) return;
    apiAnuncios<{ posts: Post[] }>(undefined, "?que=posts").then((j) => setPosts(j.posts)).catch((e) => { setError(e.message); setPosts([]); });
  }, [vista, posts]);

  const cal = desde ? calendario(desde, dias) : null;
  const total = cal ? porDia * cal.dias : 0;
  const restante = info?.restante ?? 0;
  const cabe = conIva(total) <= restante;

  async function guardarTope(monto: number) {
    if (!(monto > 0)) return;
    try {
      const j = await apiAnuncios({ accion: "tope", monto });
      setInfo(j); avisar(`Listo: tu tope del mes es ${plata(monto)}.`);
      setVista(idPromo ? "post" : "inicio");
    } catch (e) { avisar((e as Error).message, true); }
  }

  async function lanzar() {
    if (!post || !cal) return;
    setEnviando(true);
    try {
      const j = await apiAnuncios({ accion: "promocionar", confirmo: true, id: idPromo, mediaId: post.id, porDia, dias: cal.dias, inicio: cal.inicio });
      setInfo(j); setConfirmar(false); setVista("listo");
      avisar("¡Listo! Tu promoción quedó lista.");
    } catch (e) {
      setConfirmar(false); avisar((e as Error).message, true);
    } finally {
      setEnviando(false);
    }
  }

  async function parar(p: Promo) {
    try { setInfo(await apiAnuncios({ accion: "detener", id: p.id })); setParando(null); avisar("Promoción detenida."); } catch (e) { avisar((e as Error).message, true); }
  }

  const cab = (titulo: string, ayuda?: string) => (
    <header className="pn-cabeza">
      <h1>{titulo}</h1>
      {ayuda && <p>{ayuda}</p>}
    </header>
  );
  if (error && !info) return <section className="pn-seccion">{cab("Anuncios")}<p className="pn-vacio">{error}</p></section>;
  if (!info) return <section className="pn-seccion">{cab("Anuncios")}<p className="pn-vacio">Cargando…</p></section>;
  if (!info.conectado) return (
    <section className="pn-seccion">{cab("Anuncios", "Todavía falta conectar Instagram con el panel. Apenas esté, aquí vas a poder promocionar tus posts.")}</section>
  );

  const paso = PASOS.indexOf(vista);
  const atras = () => setVista(paso > 0 ? PASOS[paso - 1] : "inicio");
  const pasos = (titulo: string, ayuda?: string) => (
    <>
      <div className="pn-pasos">
        <button className="pn-atras" onClick={atras}><Icon n="atras" s={22} />Atrás</button>
        <ol aria-label={`Paso ${paso + 1} de 4`}>{PASOS.map((p, i) => <li key={p} className={i <= paso ? "is-hecho" : ""} />)}</ol>
      </div>
      {cab(titulo, ayuda)}
    </>
  );

  return (
    <section className="pn-seccion an">
      {vista === "inicio" && (
        <>
          {cab("Anuncios", "Hacé que más gente vea un post de Instagram y te escriba. Vos decidís cuánto, y nada se cobra sin que lo confirmés.")}
          <div className="pn-tarjeta an-tope">
            {info.tope == null ? (
              <p>Primero poné cuánto es lo máximo que querés gastar al mes.</p>
            ) : (
              <>
                <p>Este mes llevás <b>{plata(info.usado ?? 0)}</b> de tu tope de <b>{plata(info.tope)}</b></p>
                <i className="an-barra"><span style={{ width: `${Math.min(100, ((info.usado ?? 0) / Math.max(1, info.tope)) * 100)}%` }} /></i>
              </>
            )}
            <button className="pn-link" onClick={() => setVista("tope")}>{info.tope == null ? "Poner mi tope" : "Cambiar mi tope"}</button>
          </div>
          <button className="pn-boton is-grande" onClick={empezar}><Icon n="megafono" s={26} />Promocionar un post</button>

          {!!info.promos?.length && <h2 className="pn-sub">Tus promociones</h2>}
          <ul className="an-lista">
            {info.promos?.map((p) => (
              <li key={p.id}>
                <PostIG compacto imagen={p.miniatura} texto={primeraLinea(p.caption)} pie={
                  <>
                    <span className={"an-estado is-" + p.estado}>
                      {p.estado === "activa" ? (Date.parse(p.inicio) > Date.now() + 2 * 3600e3 ? `Empieza el ${fechaCorta(p.inicio)}` : `Corriendo hasta el ${fechaCorta(p.fin)}`)
                        : p.estado === "terminada" ? `Terminó el ${fechaCorta(p.fin)}`
                        : p.estado === "detenida" ? "Detenida"
                        : p.estado === "creando" ? "Preparándose…"
                        : "No se pudo crear (no se cobró nada)"}
                    </span>
                    {p.estado !== "error" && p.estado !== "creando" && (
                      <dl className="an-numeros">
                        <div><dt>Le llegó a</dt><dd>{p.alcance.toLocaleString("es-CR")}</dd></div>
                        <div><dt>Te escribieron</dt><dd>{p.mensajes}</dd></div>
                        <div><dt>Gastado</dt><dd>{plata(conIva(Number(p.gastado)))}</dd></div>
                      </dl>
                    )}
                    {p.estado === "activa" && (parando === p.id ? (
                      <div className="fp-seguro">
                        <p>¿Detenerla? Deja de mostrarse y de cobrar desde ya.</p>
                        <div className="fp-botones"><button className="pn-boton is-peligro" onClick={() => parar(p)}>Sí, detener</button><button className="pn-link" onClick={() => setParando(null)}>No</button></div>
                      </div>
                    ) : <button className="pn-link is-peligro" onClick={() => setParando(p.id)}>Detener</button>)}
                  </>
                } />
              </li>
            ))}
          </ul>
        </>
      )}

      {vista === "tope" && (
        <>
          <button className="pn-atras" onClick={() => setVista("inicio")}><Icon n="atras" s={22} />Atrás</button>
          {cab("¿Cuánto es lo máximo al mes?", "El sistema nunca se pasa de este monto, ya contando el 13% de IVA que cobra el banco. Lo podés cambiar cuando querás.")}
          <div className="pn-opciones">
            {TOPES.map((t) => <button key={t} className={info.tope === t ? "is-on" : ""} onClick={() => guardarTope(t)}><b>{plata(t)}</b><span>al mes</span></button>)}
          </div>
          <form className="pn-otro" onSubmit={(e) => { e.preventDefault(); guardarTope(Number(topeOtro.replace(/\D/g, ""))); }}>
            <label className="pn-campo"><span>Otro monto</span><input inputMode="numeric" value={topeOtro} onChange={(e) => setTopeOtro(e.target.value)} placeholder="₡" /></label>
            <button className="pn-boton" disabled={!topeOtro.replace(/\D/g, "")}>Guardar</button>
          </form>
        </>
      )}

      {vista === "post" && (
        <>
          {pasos("¿Qué post querés que vea más gente?", "Tocá el post. Funcionan mejor los que muestran una pieza puesta y se ve bien el color.")}
          <Rejilla posts={posts} elegido={post?.id} elegir={(p) => { setPost(p); setVista("cuando"); }} />
        </>
      )}

      {vista === "cuando" && desde && cal && (
        <>
          {pasos("¿Cuándo y por cuántos días?", "Lo ideal es que termine el día de una feria, para que la gente llegue.")}
          <h3 className="pn-pregunta">Empieza</h3>
          <div className="pn-chips">
            {opciones.map((o) => <button key={o.clave} className={desde.clave === o.clave ? "is-on" : ""} onClick={() => setDesde(o)}>{o.etiqueta}</button>)}
          </div>
          <h3 className="pn-pregunta">Cuántos días</h3>
          <div className="pn-chips is-numeros">
            {DIAS.map((n) => <button key={n} className={dias === n ? "is-on" : ""} onClick={() => setDias(n)}>{n} {n === 1 ? "día" : "días"}</button>)}
          </div>
          <p className="pn-tarjeta an-calendario"><Icon n="check" s={22} />{cal.texto}{cal.dias !== dias && " (es lo que alcanza antes de la feria)"}</p>
          <button className="pn-boton is-grande" onClick={() => setVista("cuanto")}>Seguir</button>
        </>
      )}

      {vista === "cuanto" && cal && (
        <>
          {pasos("¿Cuánto por día?", `Con poquito ya se nota. Te recomiendo ${plata(RECOMENDADO)} por día.`)}
          <div className="pn-opciones">
            {MONTOS.map((m) => (
              <button key={m} className={porDia === m && !otro ? "is-on" : ""} onClick={() => { setPorDia(m); setOtro(""); }}>
                <b>{plata(m)}</b><span>{m === RECOMENDADO ? "Recomendado" : "por día"}</span>
              </button>
            ))}
          </div>
          <label className="pn-campo"><span>Otro monto por día</span>
            <input inputMode="numeric" value={otro} placeholder="₡" onChange={(e) => { setOtro(e.target.value); const v = Number(e.target.value.replace(/\D/g, "")); if (v >= 1000 && v <= 20000) setPorDia(v); }} />
          </label>
          <div className="pn-tarjeta an-cuenta">
            <p>En {cal.dias} {cal.dias === 1 ? "día" : "días"}, Meta cobra como máximo <b>{plata(total)}</b>.</p>
            <p>Con el 13% de IVA del banco: <b>{plata(conIva(total))}</b>. Nunca más que eso.</p>
            {!cabe && <p className="an-alerta">Eso pasa tu tope del mes: te quedan {plata(restante)}. Escogé menos por día, menos días o <button className="pn-link" onClick={() => setVista("tope")}>subí tu tope</button>.</p>}
          </div>
          <button className="pn-boton is-grande" disabled={!cabe} onClick={() => setVista("revisar")}>Seguir</button>
        </>
      )}

      {vista === "revisar" && post && cal && (
        <>
          {pasos("Así lo va a ver la gente")}
          <PostIG imagen={post.miniatura} texto={post.caption} />
          <dl className="pn-tarjeta an-resumen">
            <div><dt>Cuándo</dt><dd>{cal.texto}</dd></div>
            <div><dt>Por día</dt><dd>{plata(porDia)}</dd></div>
            <div><dt>Máximo a cobrar</dt><dd><b>{plata(conIva(total))}</b> con IVA</dd></div>
            <div><dt>Quién lo ve</dt><dd>{info.publico}</dd></div>
            <div><dt>Qué pasa</dt><dd>Sale en Instagram con un botón para escribirte un mensaje.</dd></div>
          </dl>
          <button className="pn-boton is-grande" onClick={() => setConfirmar(true)}><Icon n="check" s={24} />Sí, promocionar</button>
          <button className="pn-link is-centro" onClick={() => setVista("inicio")}>No, todavía no</button>
        </>
      )}

      {vista === "listo" && (
        <>
          {cab("¡Listo!", `Tu promoción empieza ${cal && cal.inicio === hoyCR() ? "en unos minutos" : cal ? `el ${fechaCorta(cal.inicio)}` : "pronto"}. Aquí vas a ver a cuánta gente le llega y cuántas te escriben.`)}
          <button className="pn-boton is-grande" onClick={() => { setVista("inicio"); cargar(); }}>Ver mis promociones</button>
        </>
      )}

      {confirmar && cal && <Autorizar total={conIva(total)} enviando={enviando} si={lanzar} no={() => setConfirmar(false)} />}
    </section>
  );
}

/** Rejilla de posts de Instagram para escoger (también la usa el asistente). */
export function Rejilla({ posts, elegido, elegir }: { posts: Post[] | null; elegido?: string; elegir: (p: Post) => void }) {
  if (!posts) return <p className="pn-vacio">Trayendo tus posts de Instagram…</p>;
  if (!posts.length) return <p className="pn-vacio">No encontré posts en Instagram.</p>;
  return (
    <ul className="an-posts">
      {posts.map((p) => (
        <li key={p.id}>
          <button className={elegido === p.id ? "is-on" : ""} onClick={() => elegir(p)} aria-label={primeraLinea(p.caption)}>
            <img src={p.miniatura} alt="" loading="lazy" />
            {p.tipo === "Video" && <span className="an-tipo" aria-hidden>▶</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** La última confirmación antes de cobrar: siempre la toca Andrea. */
export function Autorizar({ total, enviando, si, no }: { total: number; enviando: boolean; si: () => void; no: () => void }) {
  // Va directo al <body>, para que quede encima de todo aunque se abra desde el chat.
  return createPortal(
    <div className="pn-modal" role="dialog" aria-modal="true" aria-labelledby="an-conf">
      <div>
        <h2 id="an-conf">Última confirmación</h2>
        <p>¿Autorizás que se cobren hasta <b>{plata(total)}</b> (con IVA) a la tarjeta de Eucalipto Chic por esta promoción?</p>
        <button className="pn-boton is-grande" disabled={enviando} onClick={si}>{enviando ? "Creando la promoción…" : "Sí, autorizo"}</button>
        <button className="pn-link is-centro" disabled={enviando} onClick={no}>No</button>
      </div>
    </div>,
    document.body,
  );
}
