"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { colones } from "@/lib/catalog";
import type { Feria } from "@/lib/asistente";

// Promociones de Instagram, paso a paso y en palabras simples.
// Nada se cobra sin que Andrea toque "Sí, autorizo" en la última pantalla.

type Promo = {
  id: string; caption: string | null; miniatura: string | null; permalink: string | null;
  por_dia: number; dias: number; total: number; inicio: string; fin: string;
  estado: "creando" | "activa" | "detenida" | "terminada" | "error"; gastado: number; alcance: number; mensajes: number;
};
type Info = { conectado: boolean; tope?: number | null; usado?: number; restante?: number | null; publico?: string; promos?: Promo[] };
type Post = { id: string; caption: string; tipo: string; miniatura: string; permalink: string; fecha: string };
type Cuando = { etiqueta: string; detalle: string; inicio: string; dias: number };
type Vista = "inicio" | "tope" | "post" | "cuando" | "cuanto" | "revisar" | "listo";

const IVA = 1.13;
const conIva = (n: number) => Math.round(n * IVA);
const DIA = 864e5;
const hoyCR = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const sumar = (f: string, n: number) => new Date(Date.parse(f + "T12:00:00Z") + n * DIA).toISOString().slice(0, 10);
const entre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DIA);
const fechaCorta = (f: string) =>
  new Date(f.length === 10 ? f + "T12:00:00Z" : f).toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Costa_Rica" });
const primeraLinea = (t: string | null) => (t ?? "").split("\n")[0].trim() || "Post de Instagram";
const nid = () => crypto.randomUUID();
const PASOS: Vista[] = ["post", "cuando", "cuanto", "revisar"];
const TOPES = [15000, 25000, 40000];
const MONTOS = [2000, 2500, 3000];

export default function Anuncios({ ferias, arrancar, alArrancar, avisar }: {
  ferias: Feria[]; arrancar: boolean; alArrancar: () => void; avisar: (m: string, mal?: boolean) => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [vista, setVista] = useState<Vista>("inicio");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [cuando, setCuando] = useState<Cuando | null>(null);
  const [porDia, setPorDia] = useState(2500);
  const [otro, setOtro] = useState("");
  const [alcance, setAlcance] = useState<{ min: number; max: number } | null>(null);
  const [idPromo, setIdPromo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [topeOtro, setTopeOtro] = useState("");

  const api = useCallback(async (cuerpo?: object, que = "") => {
    const r = await fetch("/api/anuncios" + que, cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
    if (r.status === 401) { location.href = "/admin/entrar"; throw new Error("Entrá de nuevo."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Algo falló. Probá de nuevo.");
    return j;
  }, []);

  const cargar = useCallback(() => api().then(setInfo).catch((e) => setError(e.message)), [api]);
  useEffect(() => { cargar(); }, [cargar]);

  const empezar = useCallback(() => {
    setPost(null); setCuando(null); setPorDia(2500); setOtro(""); setAlcance(null); setIdPromo(nid());
    setVista(info?.tope == null ? "tope" : "post");
  }, [info]);

  // Si Andrea llegó desde una sugerencia ("¿Querés promocionar…?"), abrimos directo el paso 1.
  useEffect(() => { if (arrancar && info?.conectado) { empezar(); alArrancar(); } }, [arrancar, info, empezar, alArrancar]);

  useEffect(() => {
    if (vista !== "post" || posts) return;
    api(undefined, "?que=posts").then((j) => setPosts(j.posts)).catch((e) => { setError(e.message); setPosts([]); });
  }, [vista, posts, api]);

  useEffect(() => {
    if (vista !== "cuanto") return;
    setAlcance(null);
    const t = setTimeout(() => { api({ accion: "estimar", porDia }).then((j) => setAlcance(j.alcance)).catch(() => {}); }, 500);
    return () => clearTimeout(t);
  }, [vista, porDia, api]);

  const hoy = hoyCR();
  const opcionesCuando = useMemo<Cuando[]>(() => {
    const prox = ferias.filter((f) => f.fecha >= hoy && f.fecha <= sumar(hoy, 45)).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 3);
    const deFerias = prox.map((f) => {
      const inicio = f.fecha > sumar(hoy, 7) ? sumar(f.fecha, -7) : hoy;
      const dias = entre(inicio, f.fecha) + 1;
      return { etiqueta: `La semana antes de ${f.nombre}`, detalle: `Del ${fechaCorta(inicio)} al ${fechaCorta(f.fecha)} (${dias} ${dias === 1 ? "día" : "días"})`, inicio, dias: Math.min(dias, 14) };
    });
    const semana = { etiqueta: "Desde hoy, por una semana", detalle: `Del ${fechaCorta(hoy)} al ${fechaCorta(sumar(hoy, 6))} (7 días)`, inicio: hoy, dias: 7 };
    return deFerias.some((f) => f.inicio === semana.inicio && f.dias === semana.dias) ? deFerias : [...deFerias, semana];
  }, [ferias, hoy]);

  const total = cuando ? porDia * cuando.dias : 0;
  const restante = info?.restante ?? 0;
  const cabe = conIva(total) <= restante;

  async function guardarTope(monto: number) {
    if (!(monto > 0)) return;
    try {
      const j = await api({ accion: "tope", monto });
      setInfo(j); avisar(`Listo: tu tope del mes es ${colones(monto)}.`);
      setVista(post || vista === "tope" && idPromo ? "post" : "inicio");
    } catch (e) { avisar((e as Error).message, true); }
  }

  async function lanzar() {
    if (!post || !cuando) return;
    setEnviando(true);
    try {
      const j = await api({ accion: "promocionar", confirmo: true, id: idPromo, mediaId: post.id, porDia, dias: cuando.dias, inicio: cuando.inicio });
      setInfo(j); setConfirmar(false); setVista("listo");
      avisar("¡Listo! Tu promoción quedó lista.");
    } catch (e) {
      setConfirmar(false); avisar((e as Error).message, true);
    } finally {
      setEnviando(false);
    }
  }

  async function parar(p: Promo) {
    if (!confirm(`¿Detener la promoción de «${primeraLinea(p.caption)}»? Deja de mostrarse y de cobrar desde ya.`)) return;
    try { setInfo(await api({ accion: "detener", id: p.id })); avisar("Promoción detenida."); } catch (e) { avisar((e as Error).message, true); }
  }

  if (error && !info) return <section className="ad-card"><h1>Anuncios</h1><p className="ad-an-nota">{error}</p></section>;
  if (!info) return <section className="ad-card"><h1>Anuncios</h1><p className="ad-an-nota">Cargando…</p></section>;
  if (!info.conectado) return (
    <section className="ad-card"><h1>Anuncios</h1>
      <p className="ad-an-nota">Todavía falta conectar Instagram con el panel. Mateo lo está terminando; apenas esté, aquí vas a poder promocionar tus posts.</p>
    </section>
  );

  const paso = PASOS.indexOf(vista);
  const atras = () => setVista(paso > 0 ? PASOS[paso - 1] : "inicio");
  const encabezado = (titulo: string, ayuda?: string) => (
    <>
      <div className="ad-an-paso">
        <button className="ad-an-atras" onClick={atras}><Icon n="atras" s={22} />Atrás</button>
        <span>Paso {paso + 1} de 4</span>
      </div>
      <h1>{titulo}</h1>
      {ayuda && <p className="ad-an-ayuda">{ayuda}</p>}
    </>
  );

  return (
    <section className="ad-card ad-an">
      {vista === "inicio" && (
        <>
          <h1>Anuncios</h1>
          <p className="ad-an-ayuda">Hacé que más gente vea un post de Instagram y te escriba. Vos decidís cuánto, y nada se cobra sin que lo confirmés.</p>
          <div className="ad-an-tope">
            {info.tope == null ? (
              <p>Primero poné cuánto es lo máximo que querés gastar al mes.</p>
            ) : (
              <>
                <p>Este mes llevás <b>{colones(info.usado ?? 0)}</b> de tu tope de <b>{colones(info.tope)}</b></p>
                <i><span style={{ width: `${Math.min(100, ((info.usado ?? 0) / Math.max(1, info.tope)) * 100)}%` }} /></i>
              </>
            )}
            <button className="ad-an-link" onClick={() => setVista("tope")}>{info.tope == null ? "Poner mi tope" : "Cambiar mi tope"}</button>
          </div>
          <button className="btn ad-an-grande" onClick={empezar}><Icon n="megafono" s={28} />Promocionar un post</button>

          {!!info.promos?.length && <h2>Tus promociones</h2>}
          <ul className="ad-an-lista">
            {info.promos?.map((p) => (
              <li key={p.id} className={"is-" + p.estado}>
                {p.miniatura ? <img src={p.miniatura} alt="" loading="lazy" /> : <span className="ad-sinfoto"><Icon n="foto" s={26} /></span>}
                <div>
                  <b>{primeraLinea(p.caption)}</b>
                  <span className="ad-an-chip">
                    {p.estado === "activa" ? (Date.parse(p.inicio) > Date.now() + 2 * 3600e3 ? `Empieza el ${fechaCorta(p.inicio)}` : `Corriendo hasta el ${fechaCorta(p.fin)}`)
                      : p.estado === "terminada" ? `Terminó el ${fechaCorta(p.fin)}`
                      : p.estado === "detenida" ? "Detenida"
                      : p.estado === "creando" ? "Preparándose…"
                      : "No se pudo crear (no se cobró nada)"}
                  </span>
                  {p.estado !== "error" && p.estado !== "creando" && (
                    <small>Le llegó a {p.alcance.toLocaleString("es-CR")} personas · {p.mensajes} te escribieron · Gastado {colones(conIva(Number(p.gastado)))} con IVA, de {colones(conIva(p.total))} máximo</small>
                  )}
                </div>
                {p.estado === "activa" && <button className="ad-an-parar" onClick={() => parar(p)}>Detener</button>}
              </li>
            ))}
          </ul>
        </>
      )}

      {vista === "tope" && (
        <>
          <button className="ad-an-atras" onClick={() => setVista("inicio")}><Icon n="atras" s={22} />Atrás</button>
          <h1>¿Cuánto es lo máximo que querés gastar en anuncios al mes?</h1>
          <p className="ad-an-ayuda">El sistema nunca se pasa de este monto, ya contando el 13% de IVA que cobra el banco. Lo podés cambiar cuando querás.</p>
          <div className="ad-an-opciones">
            {TOPES.map((t) => <button key={t} className={info.tope === t ? "is-on" : ""} onClick={() => guardarTope(t)}><b>{colones(t)}</b><span>al mes</span></button>)}
          </div>
          <form className="ad-an-otro" onSubmit={(e) => { e.preventDefault(); guardarTope(Number(topeOtro.replace(/\D/g, ""))); }}>
            <label>Otro monto<input inputMode="numeric" value={topeOtro} onChange={(e) => setTopeOtro(e.target.value)} placeholder="₡" /></label>
            <button className="btn" disabled={!topeOtro.replace(/\D/g, "")}>Guardar</button>
          </form>
        </>
      )}

      {vista === "post" && (
        <>
          {encabezado("¿Qué post querés que vea más gente?", "Tocá el post. Funcionan mejor los que muestran una pieza puesta y se ve bien el color.")}
          {!posts ? <p className="ad-an-nota">Trayendo tus posts de Instagram…</p> : !posts.length ? <p className="ad-an-nota">No encontré posts. {error}</p> : (
            <ul className="ad-an-posts">
              {posts.map((p) => (
                <li key={p.id}>
                  <button className={post?.id === p.id ? "is-on" : ""} onClick={() => { setPost(p); setVista("cuando"); }}>
                    <img src={p.miniatura} alt={primeraLinea(p.caption)} loading="lazy" />
                    <span>{p.tipo} · {new Date(p.fecha).toLocaleDateString("es-CR", { day: "numeric", month: "short" })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {vista === "cuando" && (
        <>
          {encabezado("¿Cuándo querés que se vea?", "Lo ideal es la semana antes de una feria, para que la gente llegue.")}
          <div className="ad-an-elegir">
            {opcionesCuando.map((c) => (
              <button key={c.etiqueta} className={cuando?.etiqueta === c.etiqueta ? "is-on" : ""} onClick={() => { setCuando(c); setVista("cuanto"); }}>
                <b>{c.etiqueta}</b><span>{c.detalle}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {vista === "cuanto" && cuando && (
        <>
          {encabezado("¿Cuánto por día?", "Con poquito ya se nota. Te recomiendo ₡2 500 por día.")}
          <div className="ad-an-opciones">
            {MONTOS.map((m) => (
              <button key={m} className={porDia === m && !otro ? "is-on" : ""} onClick={() => { setPorDia(m); setOtro(""); }}>
                <b>{colones(m)}</b><span>{m === 2500 ? "Recomendado" : "por día"}</span>
              </button>
            ))}
          </div>
          <label className="ad-an-otro-monto">Otro monto por día
            <input inputMode="numeric" value={otro} placeholder="₡" onChange={(e) => { setOtro(e.target.value); const v = Number(e.target.value.replace(/\D/g, "")); if (v >= 1000 && v <= 20000) setPorDia(v); }} />
          </label>
          <div className="ad-an-cuenta">
            <p>En {cuando.dias} {cuando.dias === 1 ? "día" : "días"}, Meta cobra como máximo <b>{colones(total)}</b>.</p>
            <p>Con el 13% de IVA del banco: <b>{colones(conIva(total))}</b>. Nunca más que eso.</p>
            {alcance && <p>Le podría llegar a unas <b>{alcance.min.toLocaleString("es-CR")} a {alcance.max.toLocaleString("es-CR")} personas por día</b>.</p>}
            {!cabe && <p className="ad-an-alerta">Eso pasa tu tope del mes: te quedan {colones(restante)}. Escogé menos por día o <button className="ad-an-link" onClick={() => setVista("tope")}>subí tu tope</button>.</p>}
          </div>
          <button className="btn ad-an-grande" disabled={!cabe} onClick={() => setVista("revisar")}>Seguir</button>
        </>
      )}

      {vista === "revisar" && post && cuando && (
        <>
          {encabezado("Revisá que todo esté bien")}
          <div className="ad-an-resumen">
            <img src={post.miniatura} alt="" />
            <dl>
              <dt>Post</dt><dd>{primeraLinea(post.caption)}</dd>
              <dt>Cuándo</dt><dd>{cuando.detalle}</dd>
              <dt>Por día</dt><dd>{colones(porDia)}</dd>
              <dt>Máximo a cobrar</dt><dd><b>{colones(conIva(total))}</b> con IVA</dd>
              <dt>Quién lo ve</dt><dd>{info.publico}</dd>
              <dt>Qué pasa</dt><dd>Aparece en Instagram con un botón para escribirte un mensaje a eucaliptochicr.</dd>
            </dl>
          </div>
          <button className="btn ad-an-grande" onClick={() => setConfirmar(true)}><Icon n="check" s={26} />Sí, promocionar</button>
          <button className="ad-an-link ad-an-centro" onClick={() => setVista("inicio")}>No, todavía no</button>
        </>
      )}

      {vista === "listo" && (
        <>
          <h1>¡Listo!</h1>
          <p className="ad-an-ayuda">Tu promoción empieza {cuando && cuando.inicio === hoy ? "en unos minutos" : cuando ? `el ${fechaCorta(cuando.inicio)}` : "pronto"}. Aquí vas a ver a cuánta gente le llega y cuántas te escriben.</p>
          <button className="btn ad-an-grande" onClick={() => { setVista("inicio"); cargar(); }}>Ver mis promociones</button>
        </>
      )}

      {confirmar && (
        <div className="ad-an-modal" role="dialog" aria-modal="true" aria-labelledby="an-conf">
          <div>
            <h2 id="an-conf">Última confirmación</h2>
            <p>¿Autorizás que se cobren hasta <b>{colones(conIva(total))}</b> (con IVA) a la tarjeta de Eucalipto Chic por esta promoción?</p>
            <button className="btn ad-an-grande" disabled={enviando} onClick={lanzar}>{enviando ? "Creando la promoción…" : "Sí, autorizo"}</button>
            <button className="ad-an-link ad-an-centro" disabled={enviando} onClick={() => setConfirmar(false)}>No</button>
          </div>
        </div>
      )}
    </section>
  );
}
