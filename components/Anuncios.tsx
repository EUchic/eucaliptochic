"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Datos, Feria, Pieza } from "@/lib/asistente";
import {
  apiAnuncios, arranques, calendario, conIva, DIAS, fechaCorta, hoyCR, MONTOS, nidPromo, plata, primeraLinea, RECOMENDADO, sumar, TOPES,
  type Arranque, type InfoAnuncios, type Post, type Promo,
} from "@/lib/promo";
import Icon from "./Icon";
import Disenador, { type PreDiseno } from "./Disenador";
import { avisarGuia } from "@/lib/guias";
import PostIG from "./PostIG";

type Publico = { texto: string; edad_min: number; edad_max: number; intereses: { id: string; name: string }[] };
type Avisar = (m: string, malo?: boolean) => void;

/** Hoja de confirmación de cobro o publicación: siempre la última palabra es de Andrea. */
export function Confirmacion({ titulo, texto, si, no, enviando, boton = "Sí, autorizo" }: { titulo: string; texto: React.ReactNode; si: () => void; no: () => void; enviando: boolean; boton?: string }) {
  return createPortal(
    <div className="pn-velo" role="dialog" aria-modal="true" aria-label={titulo} onClick={() => !enviando && no()}>
      <div className="pn-hoja" onClick={(e) => e.stopPropagation()}>
        <span className="pn-agarre" aria-hidden />
        <h2>{titulo}</h2>
        <div className="pn-hoja-txt">{texto}</div>
        <div className="pn-botones is-columna">
          <button className="pn-btn is-grande" disabled={enviando} onClick={si}><Icon n="check" s={24} />{enviando ? "Un momento…" : boton}</button>
          <button className="pn-btn is-gris is-grande" disabled={enviando} onClick={no}>No, todavía no</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Rejilla({ posts, elegido, elegir }: { posts: Post[] | null; elegido?: string; elegir: (p: Post) => void }) {
  if (!posts) return <div className="pr-cargando"><span className="pn-girando" />Trayendo tus publicaciones…</div>;
  if (!posts.length) return <p className="pn-vacio">No encontré publicaciones aquí.</p>;
  return (
    <ul className="pr-rejilla">
      {posts.map((p) => (
        <li key={p.id}>
          <button className={elegido === p.id ? "is-on" : ""} onClick={() => elegir(p)} aria-label={primeraLinea(p.caption)} aria-pressed={elegido === p.id}>
            <img src={p.miniatura} alt="" loading="lazy" />
            {p.tipo !== "Foto" && <span className="pr-tipo">{p.tipo}</span>}
            {elegido === p.id && <span className="pr-check"><Icon n="check" s={22} /></span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

type Paso = "tope" | "post" | "cuando" | "dias" | "monto" | "publico" | "revisar";
const ORDEN: Paso[] = ["post", "cuando", "dias", "monto", "publico", "revisar"];

/** Promocionar un post o una historia, un paso a la vez, con botón de continuar en cada paso. */
export function Promocionar({ ferias, que: queInicial = "post", avisar, listo, cancelar, dias: diasInicial, porDia: porDiaInicial, musica: musicaInicial }: {
  ferias: Feria[]; que?: "post" | "story"; avisar: Avisar; listo: (texto: string) => void; cancelar: () => void; dias?: number; porDia?: number; musica?: boolean;
}) {
  const [info, setInfo] = useState<InfoAnuncios | null>(null);
  const [que, setQue] = useState<"post" | "story">(queInicial);
  const [listas, setListas] = useState<{ post: Post[] | null; story: Post[] | null }>({ post: null, story: null });
  const [post, setPost] = useState<Post | null>(null);
  const ops = useMemo(() => arranques(ferias), [ferias]);
  const [desde, setDesde] = useState<Arranque | null>(null);
  const [dias, setDias] = useState<number | null>(diasInicial ?? null);
  const [porDia, setPorDia] = useState<number | null>(porDiaInicial ?? RECOMENDADO);
  const [otroMonto, setOtroMonto] = useState(porDiaInicial && !MONTOS.includes(porDiaInicial) ? String(porDiaInicial).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "");
  const [otrosDias, setOtrosDias] = useState(!!diasInicial && !DIAS.includes(diasInicial));
  const [musica, setMusica] = useState(musicaInicial ?? true);
  const [publico, setPublico] = useState<Publico | null | undefined>(undefined);
  const [pensando, setPensando] = useState(false);
  const [paso, setPaso] = useState<Paso>("post");
  const [autorizar, setAutorizar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [id] = useState(nidPromo);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => { caja.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [paso]);

  useEffect(() => { apiAnuncios().then((i) => { setInfo(i); if (i.tope == null) setPaso("tope"); }).catch((e) => avisar(e.message, true)); }, [avisar]);
  useEffect(() => {
    if (listas[que]) return;
    apiAnuncios<{ posts: Post[] }>(undefined, que === "story" ? "?que=historias" : "?que=posts")
      .then((j) => setListas((l) => ({ ...l, [que]: j.posts }))).catch(() => setListas((l) => ({ ...l, [que]: [] })));
  }, [que, listas]);

  // Al llegar al paso del público, la IA mira el post y propone a quién mostrarlo.
  useEffect(() => {
    if (paso !== "publico" || !post || publico !== undefined) return;
    setPensando(true);
    apiAnuncios<{ publico: Publico | null }>({ accion: "segmentar", mediaId: post.id, que })
      .then((j) => setPublico(j.publico)).catch(() => setPublico(null)).finally(() => setPensando(false));
  }, [paso, post, publico, que]);

  if (!info) return <div className="pr-cargando"><span className="pn-girando" />Un momento…</div>;
  if (!info.conectado) return <p className="pn-nota">Instagram todavía no está conectado con el panel.</p>;

  const minimo = info.minimo ?? 500;
  const cal = desde && dias ? calendario(desde, dias) : null;
  const total = cal && porDia ? porDia * cal.dias : 0;
  const cabe = conIva(total) <= (info.restante ?? 0);
  const montoOk = !!porDia && porDia >= minimo && porDia <= 50_000;
  const i = ORDEN.indexOf(paso);
  const puede = paso === "post" ? !!post : paso === "cuando" ? !!desde : paso === "dias" ? !!dias : paso === "monto" ? montoOk && cabe : paso === "publico" ? !pensando : true;
  const siguiente = () => setPaso(ORDEN[i + 1]);
  const atras = () => { const n = ORDEN[i - 1]; if (n) setPaso(n); else cancelar(); };

  async function lanzar() {
    if (!post || !cal || !porDia) return;
    setEnviando(true);
    try {
      const r = await apiAnuncios<{ musica?: boolean }>({ accion: "promocionar", confirmo: true, id, mediaId: post.id, porDia, dias: cal.dias, inicio: cal.inicio, que, publico: publico ?? null, musica });
      setAutorizar(false);
      const sinMusica = musica && r.musica === false ? " Instagram no dejó ponerle música a ese post, así que salió sin música." : musica ? " Lleva música que escoge Meta." : "";
      listo(`¡Listo! La promoción ${cal.inicio === new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10) ? "empieza en unos minutos" : "quedó programada"}.${sinMusica} En Anuncios vas a ver a cuánta gente le llega y cuántas te escriben.`);
    } catch (e) {
      setAutorizar(false); avisar((e as Error).message, true);
    } finally { setEnviando(false); }
  }

  if (paso === "tope") return (
    <div className="pr">
      <h3 className="pr-pregunta">Antes de empezar: ¿cuánto es lo máximo que querés gastar en anuncios al mes?</h3>
      <p className="pn-nota">Nunca me paso de ese monto. Lo podés cambiar cuando querás.</p>
      <div className="pn-chips is-grandes">{TOPES.map((t) => <button key={t} onClick={async () => { try { setInfo(await apiAnuncios({ accion: "tope", monto: t })); setPaso("post"); } catch (e) { avisar((e as Error).message, true); } }}>{plata(t)} al mes</button>)}</div>
    </div>
  );

  return (
    <div className="pr" ref={caja}>
      <div className="pr-cab">
        <button className="pn-icono" onClick={atras} aria-label="Atrás"><Icon n="atras" s={24} /></button>
        <span>Paso {i + 1} de {ORDEN.length}</span>
        <button className="pn-icono" onClick={cancelar} aria-label="Cerrar"><Icon n="cerrar" s={22} /></button>
      </div>
      <div className="pr-progreso" aria-hidden><i style={{ width: `${((i + 1) / ORDEN.length) * 100}%` }} /></div>

      {paso === "post" && (
        <>
          <h3 className="pr-pregunta">¿Qué querés que vea más gente?</h3>
          <div className="pn-seg" role="tablist">
            <button className={que === "post" ? "is-on" : ""} onClick={() => { setQue("post"); setPost(null); }} role="tab" aria-selected={que === "post"}>Posts</button>
            <button className={que === "story" ? "is-on" : ""} onClick={() => { setQue("story"); setPost(null); }} role="tab" aria-selected={que === "story"}>Historias</button>
          </div>
          {que === "story" && <p className="pn-nota">Salen las historias que están en vivo ahora (duran 24 horas).</p>}
          <Rejilla posts={listas[que]} elegido={post?.id} elegir={(p) => { setPost(p); setPublico(undefined); }} />
        </>
      )}

      {paso === "cuando" && (
        <>
          <h3 className="pr-pregunta">¿Desde cuándo?</h3>
          <div className="pn-opciones">{ops.map((o) => (
            <button key={o.clave} className={desde?.clave === o.clave ? "is-on" : ""} onClick={() => setDesde(o)}>
              <Icon n={o.feria ? "carpa" : "reloj"} s={22} /><span>{o.etiqueta}{o.feria && <small>Termina el día de la feria</small>}</span>{desde?.clave === o.clave && <Icon n="check" s={22} />}
            </button>
          ))}
            <label className={"pr-fecha" + (desde?.clave === "fecha" ? " is-on" : "")}>
              <Icon n="reloj" s={22} /><span>Otra fecha</span>
              <input type="date" min={hoyCR()} max={sumar(hoyCR(), 60)} value={desde?.fecha ?? ""}
                onChange={(e) => { const f = e.target.value; if (f) setDesde({ clave: "fecha", etiqueta: `Desde el ${fechaCorta(f)}`, fecha: f }); }} />
            </label>
          </div>
        </>
      )}

      {paso === "dias" && (
        <>
          <h3 className="pr-pregunta">¿Por cuántos días?</h3>
          <p className="pn-nota">{que === "story" ? "La historia dura 24 horas en tu perfil, pero como anuncio Meta la puede seguir mostrando los días que escojás." : "Para una feria, con 5 a 7 días antes alcanza."}</p>
          <div className="pn-chips is-grandes">
            {DIAS.map((n) => <button key={n} className={dias === n && !otrosDias ? "is-on" : ""} onClick={() => { setDias(n); setOtrosDias(false); }}>{n} {n === 1 ? "día" : "días"}</button>)}
            <button className={otrosDias ? "is-on" : ""} onClick={() => { setOtrosDias(true); if (!dias) setDias(4); }}>Otro</button>
          </div>
          {otrosDias && (
            <div className="pr-otro">
              <span>Días:</span>
              <div className="pn-paso">
                <button type="button" aria-label="Un día menos" disabled={(dias ?? 1) <= 1} onClick={() => setDias(Math.max(1, (dias ?? 1) - 1))}><Icon n="menos" s={20} /></button>
                <b>{dias ?? 1}</b>
                <button type="button" aria-label="Un día más" disabled={(dias ?? 1) >= 30} onClick={() => setDias(Math.min(30, (dias ?? 1) + 1))}><Icon n="mas" s={20} /></button>
              </div>
            </div>
          )}
          {cal && <p className="pr-dato"><Icon n="reloj" s={20} /><span>{cal.texto}</span></p>}
        </>
      )}

      {paso === "monto" && (
        <>
          <h3 className="pr-pregunta">¿Cuánto por día?</h3>
          <p className="pn-nota">Te recomiendo {plata(RECOMENDADO)}: alcanza para llegarle a bastante gente sin gastar mucho. Lo mínimo que acepta Meta es {plata(minimo)} por día.</p>
          <div className="pn-chips is-grandes">
            {MONTOS.filter((m) => m >= minimo).map((m) => <button key={m} className={porDia === m && !otroMonto ? "is-on" : ""} onClick={() => { setPorDia(m); setOtroMonto(""); }}>{plata(m)}{m === RECOMENDADO ? " · recomendado" : ""}</button>)}
          </div>
          <label className="pn-campo pr-otro-monto"><span>Otro monto por día</span>
            <div className="pn-con-prefijo"><span>₡</span><input inputMode="numeric" value={otroMonto} placeholder="Ej.: 1 200"
              onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setOtroMonto(v.replace(/\B(?=(\d{3})+(?!\d))/g, " ")); setPorDia(v ? Number(v) : null); }} /></div>
          </label>
          {!!porDia && porDia < minimo && <p className="pn-alerta">Meta no acepta menos de {plata(minimo)} por día.</p>}
          {!!porDia && porDia > 50_000 && <p className="pn-alerta">Eso es mucho por día; el máximo aquí es {plata(50_000)}.</p>}
          {cal && porDia && <p className="pr-dato"><Icon n="moneda" s={20} /><span>Máximo a cobrar: <b>{plata(conIva(total))}</b> con IVA, por {cal.dias} {cal.dias === 1 ? "día" : "días"}.</span></p>}
          {!cabe && <p className="pn-alerta">Eso pasa tu tope del mes: te quedan {plata(info.restante ?? 0)}. Escogé menos días o menos por día.</p>}
        </>
      )}

      {paso === "publico" && (
        <>
          <h3 className="pr-pregunta">¿A quién se lo mostramos?</h3>
          {pensando ? (
            <div className="pr-cargando"><span className="pn-girando" />Estoy viendo tu post para escoger a quién mostrárselo…</div>
          ) : publico ? (
            <div className="pr-publico">
              <p className="pr-ia"><Icon n="chispa" s={22} />{publico.texto}</p>
              <dl className="pn-filas">
                <div><dt>Mujeres de</dt><dd>{publico.edad_min} a {publico.edad_max} años</dd></div>
                <div><dt>Dónde</dt><dd>Costa Rica</dd></div>
              </dl>
              {publico.intereses.length > 0 && (
                <>
                  <p className="pn-etq">Les interesa (tocá para quitar):</p>
                  <div className="pn-chips">{publico.intereses.map((x) => (
                    <button key={x.id} className="is-on" onClick={() => setPublico({ ...publico, intereses: publico.intereses.filter((y) => y.id !== x.id) })}>{x.name} <Icon n="cerrar" s={16} /></button>
                  ))}</div>
                </>
              )}
              <p className="pn-nota">Meta también busca sola a quienes tienen más chance de escribirte.</p>
              <button className="pn-txt" onClick={() => setPublico(null)}>Mejor mostrarlo a todo público</button>
            </div>
          ) : (
            <div className="pr-publico"><p className="pr-ia"><Icon n="persona" s={22} />{info.publico}</p></div>
          )}
        </>
      )}

      {paso === "revisar" && post && cal && porDia && (
        <>
          <h3 className="pr-pregunta">Así lo va a ver la gente</h3>
          <PostIG imagen={post.miniatura} texto={que === "story" ? null : post.caption} historia={que === "story"} />
          <dl className="pn-filas">
            <div><dt>Cuándo</dt><dd>{cal.texto}</dd></div>
            <div><dt>Por día</dt><dd>{plata(porDia)}</dd></div>
            <div><dt>Música</dt><dd>{musica ? "Sí" : "No"}</dd></div>
            <div><dt>Para quién</dt><dd>{publico ? `Mujeres de ${publico.edad_min} a ${publico.edad_max}` : "Mujeres en Costa Rica"}</dd></div>
            <div className="is-fuerte"><dt>Máximo a cobrar</dt><dd>{plata(conIva(total))}</dd></div>
          </dl>
          <p className="pn-nota">Incluye el 13 % de IVA que cobra el banco. Meta nunca cobra más que eso.</p>
          <button type="button" className="pn-fila ti-ficha-conia" role="switch" aria-checked={musica} onClick={() => setMusica(!musica)}>
            <span className="pn-fila-ico"><Icon n="altavoz" s={22} /></span>
            <span className="pn-fila-txt"><b>Ponerle música</b><small>Meta le pone una canción que calce con tu {que === "story" ? "historia" : "post"}. Si en algún lugar no se puede, sale sin música.</small></span>
            <span className={"pn-switch" + (musica ? " is-on" : "")} aria-hidden><i /></span>
          </button>
        </>
      )}

      <div className="pr-pie">
        {paso === "revisar"
          ? <button className="pn-btn is-grande" onClick={() => setAutorizar(true)}><Icon n="megafono" s={24} />Promocionar</button>
          : paso === "publico" && !pensando && publico
            ? <button className="pn-btn is-grande" onClick={siguiente}><Icon n="check" s={24} />Usar este público</button>
            : <button className="pn-btn is-grande" disabled={!puede} onClick={siguiente}>Continuar<Icon n="flecha" s={22} /></button>}
      </div>
      {autorizar && cal && (
        <Confirmacion titulo="¿Autorizás la promoción?" enviando={enviando} si={lanzar} no={() => setAutorizar(false)}
          texto={<><p>Meta te va a cobrar <b>como máximo {plata(conIva(total))}</b> (con IVA) en tu tarjeta.</p><p>{cal.texto}.</p></>} />
      )}
    </div>
  );
}

/** Convierte una foto a JPEG recortada al formato de Instagram (4:5 para posts, 9:16 para historias). */
async function aJpeg(archivo: Blob, que: "post" | "story"): Promise<{ blob: Blob; url: string }> {
  const src = URL.createObjectURL(archivo);
  try {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.src = src;
    await im.decode();
    const prop = que === "story" ? 9 / 16 : 4 / 5;
    let w = im.naturalWidth, h = im.naturalHeight;
    if (w / h > prop) w = Math.round(h * prop); else h = Math.round(w / prop);
    const ancho = Math.min(1440, w);
    const cv = document.createElement("canvas");
    cv.width = ancho; cv.height = Math.round(ancho / prop);
    const cx = cv.getContext("2d")!;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(im, (im.naturalWidth - w) / 2, (im.naturalHeight - h) / 2, w, h, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/jpeg", 0.9));
    if (!blob) throw new Error();
    return { blob, url: URL.createObjectURL(blob) };
  } catch {
    throw new Error("No pude leer esa foto. Probá con otra.");
  } finally { URL.revokeObjectURL(src); }
}

/** Subir un post o una historia nueva a Instagram: foto, texto (con ayuda de la IA), vista previa y confirmación. */
export function Publicar({ piezas, que: queInicial = "post", idea = "", avisar, listo, cancelar, inicial, etiquetas: etiquetasIniciales }: {
  piezas: Pieza[]; que?: "post" | "story"; idea?: string; avisar: Avisar; listo: (texto: string) => void; cancelar: () => void; etiquetas?: string[];
  /** Un diseño ya hecho (desde el diseñador): se publica tal cual, con su texto. */
  inicial?: { blob: Blob; url: string; caption?: string };
}) {
  const [que, setQue] = useState<"post" | "story">(queInicial);
  const [foto, setFoto] = useState<{ blob: Blob; url: string; pieza?: Pieza } | null>(inicial ? { blob: inicial.blob, url: inicial.url } : null);
  const [elegirPieza, setElegirPieza] = useState(false);
  const [caption, setCaption] = useState(inicial?.caption ?? "");
  const [escribiendo, setEscribiendo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [id] = useState(nidPromo);
  const conFoto = piezas.filter((p) => p.foto);
  // Personas etiquetadas (usuarios de Instagram) y las que ya etiquetó antes, para tocarlas rápido.
  const [etiquetas, setEtiquetas] = useState<string[]>(etiquetasIniciales ?? []);
  const [nueva, setNueva] = useState("");
  const [antes, setAntes] = useState<string[]>([]);
  useEffect(() => { apiAnuncios().then((i) => setAntes(i.etiquetas ?? [])).catch(() => {}); }, []);
  const limpiar = (u: string) => u.trim().replace(/^@/, "").toLowerCase();
  const valida = (u: string) => /^[a-z0-9._]{1,30}$/.test(u);
  const agregar = (u: string) => { const x = limpiar(u); if (valida(x) && !etiquetas.includes(x)) setEtiquetas([...etiquetas, x].slice(0, 20)); setNueva(""); };

  async function usar(b: Blob, pieza?: Pieza) {
    try { setFoto({ ...(await aJpeg(b, que)), pieza }); } catch (e) { avisar((e as Error).message, true); }
  }
  async function escribir() {
    setEscribiendo(true);
    try {
      const j = await apiAnuncios<{ caption: string }>({ accion: "caption", que, idea: idea || caption, pieza: foto?.pieza ? `${foto.pieza.nombre} (${foto.pieza.tipo}), ${foto.pieza.precio ? plata(foto.pieza.precio) : ""}` : "", imagen: foto?.pieza?.foto?.startsWith("https://") ? foto.pieza.foto : undefined });
      setCaption(j.caption);
    } catch (e) { avisar((e as Error).message, true); } finally { setEscribiendo(false); }
  }
  async function publicar() {
    if (!foto) return;
    setEnviando(true);
    try {
      const f = new FormData();
      f.set("id", id); f.set("que", que); f.set("caption", caption); f.set("confirmo", "si"); f.set("foto", foto.blob, "foto.jpg");
      f.set("etiquetas", etiquetas.join(","));
      const r = await fetch("/api/anuncios/publicar", { method: "POST", body: f });
      if (r.status === 401) { location.href = "/admin/entrar"; return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo publicar.");
      setConfirmar(false);
      listo(que === "story" ? "¡Listo! La historia ya está en tu Instagram." : "¡Listo! El post ya está en tu Instagram. Si querés, lo promocionamos para que lo vea más gente.");
    } catch (e) {
      setConfirmar(false); avisar((e as Error).message, true);
    } finally { setEnviando(false); }
  }

  return (
    <div className="pr">
      {!inicial && (
        <div className="pn-seg" role="tablist">
          <button className={que === "post" ? "is-on" : ""} onClick={() => { setQue("post"); setFoto(null); }}>Post</button>
          <button className={que === "story" ? "is-on" : ""} onClick={() => { setQue("story"); setFoto(null); }}>Historia</button>
        </div>
      )}
      {!foto ? (
        elegirPieza ? (
          <>
            <h3 className="pr-pregunta">Escogé la foto de una pieza</h3>
            <ul className="pr-rejilla">{conFoto.map((p) => (
              <li key={p.slug}><button onClick={async () => { try { const b = await (await fetch((p.lista?.[0]?.url ?? p.foto).replace(/-800\.(\w+)$/, "-1600.$1"))).blob(); usar(b, p); } catch { avisar("No pude abrir esa foto.", true); } }}>
                <img src={p.foto} alt={p.nombre} loading="lazy" /><span className="pr-tipo">{p.nombre}</span>
              </button></li>
            ))}</ul>
            <button className="pn-txt" onClick={() => setElegirPieza(false)}>Volver</button>
          </>
        ) : (
          <>
            <h3 className="pr-pregunta">¿Qué foto subimos?</h3>
            <div className="pn-botones is-columna">
              <label className="pn-btn is-grande"><Icon n="foto" s={24} />Tomar o escoger una foto
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) usar(f); }} />
              </label>
              <button className="pn-btn is-tinte is-grande" onClick={() => setElegirPieza(true)}><Icon n="percha" s={24} />Usar la foto de una pieza</button>
            </div>
          </>
        )
      ) : (
        <>
          <PostIG imagen={foto.url} texto={que === "story" ? null : caption} historia={que === "story"} publicacion />
          {que === "post" && (
            <label className="pn-campo">
              <span>Texto del post</span>
              <textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Escribí el texto o pedíselo a la IA" />
            </label>
          )}
          <div className="pr-etiquetas">
            <p className="pn-etq">Etiquetar personas (opcional)</p>
            {etiquetas.length > 0 && <div className="pn-chips">{etiquetas.map((u) => <button key={u} className="is-on" onClick={() => setEtiquetas(etiquetas.filter((x) => x !== u))} aria-label={`Quitar a @${u}`}>@{u} <Icon n="cerrar" s={16} /></button>)}</div>}
            <form className="pr-etiqueta-nueva" onSubmit={(e) => { e.preventDefault(); agregar(nueva); }}>
              <span>@</span>
              <input value={nueva} onChange={(e) => setNueva(e.target.value.replace(/\s/g, ""))} placeholder="usuario de Instagram" autoCapitalize="none" autoCorrect="off" maxLength={31} aria-label="Usuario de Instagram para etiquetar" />
              <button className="pn-btn is-chico" disabled={!valida(limpiar(nueva))}>Agregar</button>
            </form>
            {antes.filter((u) => !etiquetas.includes(u)).length > 0 && (
              <div className="pn-chips">{antes.filter((u) => !etiquetas.includes(u)).slice(0, 8).map((u) => <button key={u} onClick={() => agregar(u)}>+ @{u}</button>)}</div>
            )}
            <p className="pn-nota">{que === "story" ? "Les llega la mención y pueden compartir tu historia." : "Aparecen al tocar la foto y les llega aviso."} La cuenta tiene que ser pública.</p>
          </div>
          <div className="pn-botones is-columna">
            {que === "post" && <button className="pn-btn is-tinte" disabled={escribiendo} onClick={escribir}><Icon n="chispa" s={22} />{escribiendo ? "Escribiendo…" : caption ? "Escribir otro con IA" : "Escribir el texto con IA"}</button>}
            <button className="pn-btn is-grande" disabled={que === "post" && !caption.trim()} onClick={() => setConfirmar(true)}><Icon n="insta" s={24} />Publicar en Instagram</button>
            {!inicial && <button className="pn-btn is-gris" onClick={() => setFoto(null)}>Cambiar la foto</button>}
          </div>
        </>
      )}
      <button className="pn-txt pr-cancelar" onClick={cancelar}>Cancelar</button>
      {confirmar && (
        <Confirmacion titulo={que === "story" ? "¿Publicar la historia?" : "¿Publicar el post?"} boton="Sí, publicar" enviando={enviando} si={publicar} no={() => setConfirmar(false)}
          texto={<p>Se va a publicar ya mismo en el Instagram de Eucalipto Chic y lo van a ver tus seguidoras.</p>} />
      )}
    </div>
  );
}

const ESTADOS: Record<Promo["estado"], string> = { creando: "Preparándose", activa: "Corriendo", detenida: "Detenida", terminada: "Terminó", error: "No se hizo" };

/** Pestaña Anuncios: tope del mes, promocionar, publicar y resultados. */
export default function Anuncios({ d, piezas, arrancar, alArrancar, avisar, refrescar, disenar }: {
  d: Datos; piezas: Pieza[]; arrancar: boolean; alArrancar: () => void; avisar: Avisar; refrescar: () => Promise<void>; disenar?: PreDiseno | null;
}) {
  const ferias = d.ferias;
  const [info, setInfo] = useState<InfoAnuncios | null>(null);
  const [vista, setVista] = useState<"" | "promo" | "publicar" | "disenar">(disenar ? "disenar" : "");
  const [tope, setTope] = useState(false);
  const [detener, setDetener] = useState<string | null>(null);
  const cargar = () => apiAnuncios().then(setInfo).catch((e) => avisar(e.message, true));
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (arrancar) { setVista("promo"); alArrancar(); } }, [arrancar, alArrancar]);

  const terminar = (t: string) => { setVista(""); avisar(t); cargar(); avisarGuia("anuncio"); };

  return (
    <section className="pn-seccion">
      <header className="pn-titulo">
        <h1>Anuncios</h1>
        <p>Que más gente vea tus posts e historias, y publicá en Instagram desde aquí. Nada se cobra sin tu autorización.</p>
      </header>

      {vista === "promo" && <div className="pn-tarjeta"><Promocionar ferias={ferias} avisar={avisar} listo={terminar} cancelar={() => setVista("")} /></div>}
      {vista === "publicar" && <div className="pn-tarjeta"><Publicar piezas={piezas} avisar={avisar} listo={terminar} cancelar={() => setVista("")} /></div>}
      {vista === "disenar" && <div className="pn-tarjeta"><Disenador d={d} piezas={piezas} pre={disenar ?? undefined} avisar={avisar} refrescar={refrescar} listo={terminar} cancelar={() => setVista("")} /></div>}

      {!vista && (
        <>
          <div className="pn-acciones">
            <button className="pn-accion" data-guia="disenar" onClick={() => setVista("disenar")}><span className="pn-accion-ico is-diseno"><Icon n="chispa" s={26} /></span><span><b>Diseñar un post con IA</b><small>Para una feria, una colección, una prenda u oferta</small></span><Icon n="flecha" s={20} /></button>
            <button className="pn-accion" data-guia="promocionar" onClick={() => setVista("promo")}><span className="pn-accion-ico"><Icon n="megafono" s={26} /></span><span><b>Promocionar</b><small>Un post o una historia</small></span><Icon n="flecha" s={20} /></button>
            <button className="pn-accion" data-guia="publicar" onClick={() => setVista("publicar")}><span className="pn-accion-ico is-insta"><Icon n="insta" s={26} /></span><span><b>Publicar en Instagram</b><small>Post o historia con texto hecho por IA</small></span><Icon n="flecha" s={20} /></button>
          </div>

          {info?.conectado && (
            <div className="pn-tarjeta an-tope">
              {info.tope == null || tope ? (
                <>
                  <p className="pn-etq">¿Cuánto es lo máximo que querés gastar en anuncios al mes?</p>
                  <div className="pn-chips is-grandes">{TOPES.map((t) => <button key={t} className={info.tope === t ? "is-on" : ""} onClick={async () => { try { setInfo(await apiAnuncios({ accion: "tope", monto: t })); setTope(false); avisar("Tope guardado."); } catch (e) { avisar((e as Error).message, true); } }}>{plata(t)}</button>)}</div>
                </>
              ) : (
                <>
                  <div className="an-tope-fila"><span>Tope del mes</span><b>{plata(info.tope)}</b><button className="pn-txt" onClick={() => setTope(true)}>Cambiar</button></div>
                  <div className="an-barra" aria-hidden><i style={{ width: `${Math.min(100, ((info.usado ?? 0) / Math.max(1, info.tope)) * 100)}%` }} /></div>
                  <p className="pn-nota">Usado o comprometido: {plata(info.usado ?? 0)}. Te quedan {plata(info.restante ?? 0)}.</p>
                </>
              )}
            </div>
          )}

          <h2 className="pn-sub">Tus promociones</h2>
          {!info ? <div className="pr-cargando"><span className="pn-girando" />Cargando…</div>
            : !info.conectado ? <p className="pn-vacio">Instagram todavía no está conectado.</p>
            : !info.promos?.length ? <p className="pn-vacio">Todavía no has promocionado nada.</p>
            : (
              <ul className="an-lista">
                {info.promos.map((p) => (
                  <li key={p.id} className="pn-tarjeta">
                    <PostIG compacto imagen={p.miniatura} texto={null} pie={
                      <>
                        <p className={"an-estado is-" + p.estado}>{ESTADOS[p.estado]}</p>
                        <p className="an-cap">{primeraLinea(p.caption)}</p>
                        <dl className="pn-numeros">
                          <div><dt>Le llegó a</dt><dd>{p.alcance.toLocaleString("es-CR")}</dd></div>
                          <div><dt>Te escribieron</dt><dd>{p.mensajes}</dd></div>
                          <div><dt>Gastado</dt><dd>{plata(conIva(p.gastado))}</dd></div>
                        </dl>
                        {p.estado === "activa" && (detener === p.id ? (
                          <div className="pn-botones"><button className="pn-btn is-peligro is-chico" onClick={async () => { try { setInfo(await apiAnuncios({ accion: "detener", id: p.id })); avisar("Promoción detenida."); } catch (e) { avisar((e as Error).message, true); } setDetener(null); }}>Sí, detener</button><button className="pn-btn is-gris is-chico" onClick={() => setDetener(null)}>No</button></div>
                        ) : <button className="pn-txt is-peligro" onClick={() => setDetener(p.id)}>Detener promoción</button>)}
                      </>
                    } />
                  </li>
                ))}
              </ul>
            )}
        </>
      )}
    </section>
  );
}
