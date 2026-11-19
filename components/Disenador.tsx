"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, hoy, type Datos, type Feria, type Pieza } from "@/lib/asistente";
import { Publicar } from "./Anuncios";
import Icon from "./Icon";
import { MEDIDAS, PLANTILLAS, aBlob, cargarFuentes, cargarImagen, dibujar, type Diseno, type Formato, type Imagenes, type Plantilla, type Textos } from "./lienzo";

/**
 * Diseñador de posts con IA (como un Canva sencillo): Andrea dice para qué es el post, sube o escoge la foto,
 * la IA escribe los textos y escoge el encuadre, y el diseño sale con su logo (y el de la organizadora si es
 * de una feria). Lo puede cambiar, guardar en el teléfono o publicar directo en Instagram.
 */

export type TipoPost = "feria" | "coleccion" | "prenda" | "oferta" | "otro";
export type PreDiseno = { tipo?: TipoPost; feria?: string; coleccion?: string; slug?: string; texto?: string };
type Logo = { id: string; nombre: string; url: string };
type Foto = { src: string; nombre: string };

const TIPOS: { id: TipoPost; nombre: string; ico: string; sub: string }[] = [
  { id: "feria", nombre: "Una feria", ico: "carpa", sub: "Para que lleguen" },
  { id: "coleccion", nombre: "Colección nueva", ico: "capas", sub: "El lanzamiento" },
  { id: "prenda", nombre: "Una prenda", ico: "percha", sub: "Nueva o favorita" },
  { id: "oferta", nombre: "Una oferta", ico: "moneda", sub: "Descuento o promo" },
  { id: "otro", nombre: "Otra cosa", ico: "chispa", sub: "Lo que querás decir" },
];
const ETIQUETA: Record<TipoPost, string> = { feria: "Feria", coleccion: "Colección nueva", prenda: "Nuevo", oferta: "Oferta", otro: "Eucalipto Chic" };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (f: string) => { const d = new Date(f + "T12:00:00"); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const nid = () => crypto.randomUUID();

/** Las fotos de la tienda pasan por el servidor para poder dibujarlas en el teléfono. */
function fuente(url: string) {
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (url.startsWith("/fotos/")) return /\.(webp|jpg|png)$/.test(url) ? url : `${url}-1600.webp`;
  if (url.startsWith("http")) return `/api/disenos?foto=${encodeURIComponent(url.replace(/-800\.(webp|jpg|jpeg|png)$/, "-1600.$1"))}`;
  return url;
}

function miniatura(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  const r = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

async function logoPng(f: File): Promise<Blob> {
  const img = await cargarImagen(URL.createObjectURL(f));
  const r = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No pude leer el logo."))), "image/png"));
}

export default function Disenador({ d, piezas, pre, avisar, refrescar, listo, cancelar }: {
  d: Datos; piezas: Pieza[]; pre?: PreDiseno; avisar: (m: string, malo?: boolean) => void; refrescar?: () => Promise<void>;
  listo: (texto: string) => void; cancelar: () => void;
}) {
  const proximas = useMemo(() => d.ferias.filter((f) => f.fecha >= hoy()).sort((a, b) => a.fecha.localeCompare(b.fecha)), [d.ferias]);
  const buscarFeria = (q?: string) => (q ? d.ferias.find((f) => f.id === q || f.nombre.toLowerCase().includes(q.toLowerCase())) : undefined);
  const [tipo, setTipo] = useState<TipoPost | null>(pre?.tipo ?? null);
  const [feria, setFeria] = useState<Feria | undefined>(buscarFeria(pre?.feria) ?? proximas[0]);
  const [horario, setHorario] = useState("");
  const [coleccion, setColeccion] = useState(pre?.coleccion ?? "");
  const [pieza, setPieza] = useState<Pieza | undefined>(piezas.find((p) => p.slug === pre?.slug));
  const [oferta, setOferta] = useState("");
  const [hasta, setHasta] = useState("");
  const [extra, setExtra] = useState(pre?.texto ?? "");
  const logos = (d.ajustes.panel_logos as Logo[] | undefined) ?? [];
  const logoDeFeria = (f?: Feria) => (f ? logos.find((l) => l.nombre.toLowerCase().includes(f.nombre.toLowerCase().replace(/^feria\s+/, "").slice(0, 12))) ?? null : null);
  const [org, setOrg] = useState<Logo | null>(() => logoDeFeria(buscarFeria(pre?.feria) ?? proximas[0])); // null = no hay organizadora
  const [orgNombre, setOrgNombre] = useState("");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [foto, setFoto] = useState<Foto | null>(null);
  const [escogerFoto, setEscogerFoto] = useState(false);
  const [formato, setFormato] = useState<Formato>("post");
  const [diseno, setDiseno] = useState<Diseno | null>(null);
  const [caption, setCaption] = useState("");
  const [imgs, setImgs] = useState<Imagenes | null>(null);
  const [pensando, setPensando] = useState(false);
  const [editar, setEditar] = useState(false);
  const [publicar, setPublicar] = useState<{ blob: Blob; url: string } | null>(null);
  const grande = useRef<HTMLCanvasElement>(null);
  const minis = useRef<Record<string, HTMLCanvasElement | null>>({});

  // Al escoger una prenda o una feria, su foto queda puesta una sola vez; si la cambia, no se vuelve a poner sola.
  const fotoDePieza = (p?: Pieza) => p?.lista?.find((x) => x.ia)?.base ?? p?.lista?.[0]?.base;
  const auto = useRef("");
  useEffect(() => {
    const clave = `${tipo}:${tipo === "prenda" ? pieza?.slug : tipo === "feria" ? feria?.id : ""}`;
    if (auto.current === clave) return;
    auto.current = clave;
    if (tipo === "prenda" && pieza) { const f = fotoDePieza(pieza); if (f) setFoto({ src: f, nombre: pieza.nombre }); }
    else if (tipo === "feria" && feria?.foto) setFoto({ src: feria.foto, nombre: `Foto de ${feria.nombre}` });
  }, [tipo, pieza, feria]);

  const datosTexto = () => {
    switch (tipo) {
      case "feria": return feria ? [`Feria: ${feria.nombre}`, `Fecha: ${fechaLarga(feria.fecha)}`, feria.lugar ? `Lugar: ${feria.lugar}${feria.direccion ? ", " + feria.direccion : ""}` : "", horario ? `Horario: ${horario}` : "", org ? `Organiza: ${org.nombre}` : "", extra ? `Lo que Andrea quiere que diga: ${extra}` : ""].filter(Boolean).join("\n") : "";
      case "coleccion": return coleccion ? [`Colección nueva: ${coleccion}`, extra ? `Lo que Andrea quiere que diga: ${extra}` : ""].filter(Boolean).join("\n") : "";
      case "prenda": return pieza ? [`Prenda: ${pieza.nombre} (${pieza.tipo})`, pieza.precio ? `Precio: ${fmt(pieza.precio)}` : "", pieza.tallas?.length ? `Tallas: ${pieza.tallas.map((t) => t.talla).join(", ")}` : "", pieza.coleccion ? `Colección: ${pieza.coleccion}` : "", extra ? `Lo que Andrea quiere que diga: ${extra}` : ""].filter(Boolean).join("\n") : "";
      case "oferta": return oferta ? [`Oferta: ${oferta}`, hasta ? `Hasta: ${hasta}` : "", extra ? `Lo que Andrea quiere que diga: ${extra}` : ""].filter(Boolean).join("\n") : "";
      case "otro": return extra;
      default: return "";
    }
  };
  const falta = !tipo ? "para qué es el post"
    : tipo === "feria" && !feria ? "la feria"
    : tipo === "coleccion" && coleccion.trim().length < 2 ? "el nombre de la colección"
    : tipo === "prenda" && !pieza ? "la prenda"
    : tipo === "oferta" && oferta.trim().length < 2 ? "la oferta"
    : tipo === "otro" && extra.trim().length < 4 ? "qué querés que diga"
    : !foto ? "la foto" : "";

  /** Textos de respaldo si la IA no responde: con los mismos datos, sin inventar nada. */
  function textosBase(): Textos {
    switch (tipo) {
      case "feria": return { etiqueta: "Feria", titular: feria?.nombre ?? "Nos vemos en la feria", bajada: extra, detalles: [feria ? fechaLarga(feria.fecha).replace(/^./, (c) => c.toUpperCase()) : "", horario, feria?.lugar ?? ""].filter(Boolean), llamado: "¡Te esperamos!" };
      case "coleccion": return { etiqueta: "Colección nueva", titular: coleccion, bajada: extra, detalles: [], llamado: "Ya disponible" };
      case "prenda": return { etiqueta: "Nuevo", titular: pieza?.nombre ?? "", bajada: extra, detalles: pieza?.precio ? [fmt(pieza.precio)] : [], llamado: "Pedila por WhatsApp" };
      case "oferta": return { etiqueta: "Oferta", titular: oferta, bajada: extra, detalles: hasta ? [`Hasta ${hasta}`] : [], llamado: "Aprovechá" };
      default: return { etiqueta: "Eucalipto Chic", titular: extra.split(/[.!?]/)[0].slice(0, 50), bajada: "", detalles: [], llamado: "" };
    }
  }

  async function disenar() {
    if (falta || !tipo || !foto) return;
    setPensando(true);
    try {
      await cargarFuentes();
      const [f, logo, o] = await Promise.all([cargarImagen(fuente(foto.src)), cargarImagen("/logo/full.png"), org ? cargarImagen(fuente(org.url)).catch(() => null) : Promise.resolve(null)]);
      setImgs({ foto: f, logo, org: o });
      let textos: Textos & { plantilla?: Plantilla; foco?: { x: number; y: number }; caption?: string } = textosBase();
      try {
        const r = await fetch("/api/disenos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo, datos: datosTexto(), formato, imagen: miniatura(f) }) });
        if (r.status === 401) { location.href = "/admin/entrar"; return; }
        if (r.ok) textos = await r.json();
        else avisar("La IA no respondió; te dejé un diseño con tus datos para que lo ajustés.", true);
      } catch { avisar("La IA no respondió; te dejé un diseño con tus datos para que lo ajustés.", true); }
      setDiseno({ etiqueta: textos.etiqueta || ETIQUETA[tipo], titular: textos.titular, bajada: textos.bajada, detalles: textos.detalles ?? [], llamado: textos.llamado, plantilla: textos.plantilla ?? "ventana", foco: textos.foco ?? { x: 0.5, y: 0.35 }, formato });
      setCaption(textos.caption ?? "");
    } catch (e) { avisar((e as Error).message, true); } finally { setPensando(false); }
  }

  // Dibujar cada vez que cambia algo.
  useEffect(() => {
    if (!diseno || !imgs) return;
    if (grande.current) dibujar(grande.current, diseno, imgs, 1);
    for (const p of PLANTILLAS) { const c = minis.current[p.id]; if (c) dibujar(c, { ...diseno, plantilla: p.id }, imgs, 0.2); }
  }, [diseno, imgs]);

  async function subirLogo(file: File) {
    setSubiendoLogo(true);
    try {
      const f = new FormData();
      f.set("id", nid()); f.set("nombre", orgNombre.trim() || (feria ? `Organizadora de ${feria.nombre}` : "Organizadora")); f.set("logo", await logoPng(file), "logo.png");
      const r = await fetch("/api/disenos", { method: "POST", body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo guardar el logo.");
      setOrg(j.logo); refrescar?.();
      avisar("Logo guardado. La próxima vez ya aparece para escogerlo.");
    } catch (e) { avisar((e as Error).message, true); } finally { setSubiendoLogo(false); }
  }

  async function guardarEnTelefono() {
    if (!grande.current) return;
    try {
      const blob = await aBlob(grande.current);
      const archivo = new File([blob], `eucalipto-${Date.now()}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo], title: "Post de Eucalipto Chic" }); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = archivo.name; a.click();
      avisar("Listo, el diseño quedó en tus descargas.");
    } catch (e) { if ((e as Error).name !== "AbortError") avisar("No se pudo guardar el diseño.", true); }
  }

  async function irAPublicar() {
    if (!grande.current) return;
    const blob = await aBlob(grande.current);
    setPublicar({ blob, url: URL.createObjectURL(blob) });
  }

  const cambiar = (c: Partial<Diseno>) => setDiseno((x) => (x ? { ...x, ...c } : x));

  // ── Publicar el diseño ──
  if (publicar && diseno) {
    return <Publicar piezas={piezas} que={diseno.formato} avisar={avisar} inicial={{ ...publicar, caption }} listo={listo} cancelar={() => setPublicar(null)} />;
  }

  // ── El diseño listo ──
  if (diseno && imgs) {
    const [W, H] = MEDIDAS[diseno.formato];
    return (
      <div className="ds">
        <div className="pn-seg">
          <button className={diseno.formato === "post" ? "is-on" : ""} onClick={() => cambiar({ formato: "post" })}>Post</button>
          <button className={diseno.formato === "story" ? "is-on" : ""} onClick={() => cambiar({ formato: "story" })}>Historia</button>
        </div>
        <div className={"ds-lienzo" + (diseno.formato === "story" ? " is-historia" : "")}><canvas ref={grande} width={W} height={H} aria-label={`Diseño: ${diseno.titular}`} /></div>
        <p className="pn-etq">Estilo</p>
        <div className="ds-plantillas">
          {PLANTILLAS.map((p) => (
            <button key={p.id} className={diseno.plantilla === p.id ? "is-on" : ""} onClick={() => cambiar({ plantilla: p.id })} aria-pressed={diseno.plantilla === p.id}>
              <canvas ref={(c) => { minis.current[p.id] = c; }} /><span>{p.nombre}</span>
            </button>
          ))}
        </div>
        <button className="pn-fila ds-editar" onClick={() => setEditar(!editar)} aria-expanded={editar}><Icon n="lapiz" s={20} /><span>Cambiar los textos</span><Icon n="flecha" s={18} /></button>
        {editar && (
          <div className="ds-campos">
            <label className="pn-campo"><span>Arriba (chiquito)</span><input value={diseno.etiqueta} maxLength={30} onChange={(e) => cambiar({ etiqueta: e.target.value })} /></label>
            <label className="pn-campo"><span>Titular</span><input value={diseno.titular} maxLength={60} onChange={(e) => cambiar({ titular: e.target.value })} /></label>
            <label className="pn-campo"><span>Frase</span><input value={diseno.bajada} maxLength={120} onChange={(e) => cambiar({ bajada: e.target.value })} /></label>
            {[0, 1, 2].map((i) => (
              <label key={i} className="pn-campo"><span>Dato {i + 1} (fecha, lugar, precio…)</span><input value={diseno.detalles[i] ?? ""} maxLength={60}
                onChange={(e) => { const det = [...diseno.detalles]; det[i] = e.target.value; cambiar({ detalles: det }); }} /></label>
            ))}
            <label className="pn-campo"><span>Invitación</span><input value={diseno.llamado} maxLength={40} onChange={(e) => cambiar({ llamado: e.target.value })} /></label>
            <p className="pn-etq">¿Qué parte de la foto se ve?</p>
            <div className="pn-seg">
              {([["Arriba", 0.15], ["Centro", 0.45], ["Abajo", 0.8]] as const).map(([n, y]) => (
                <button key={n} className={Math.abs(diseno.foco.y - y) < 0.12 ? "is-on" : ""} onClick={() => cambiar({ foco: { ...diseno.foco, y } })}>{n}</button>
              ))}
            </div>
          </div>
        )}
        <div className="pn-botones is-columna">
          <button className="pn-btn is-grande" onClick={irAPublicar}><Icon n="insta" s={24} />Publicar en Instagram</button>
          <button className="pn-btn is-tinte" onClick={guardarEnTelefono}><Icon n="bolsa" s={22} />Guardar en el teléfono</button>
          <button className="pn-btn is-gris" disabled={pensando} onClick={disenar}><Icon n="chispa" s={20} />{pensando ? "Escribiendo…" : "Otros textos con IA"}</button>
          <button className="pn-txt" onClick={() => { setDiseno(null); setImgs(null); }}>Cambiar la foto o los datos</button>
        </div>
      </div>
    );
  }

  // ── Los datos ──
  const conFoto = piezas.filter((p) => p.lista?.some((x) => x.base));
  return (
    <div className="ds">
      <p className="pn-etq">¿Para qué es el post?</p>
      <div className="ds-tipos">
        {TIPOS.map((t) => (
          <button key={t.id} className={tipo === t.id ? "is-on" : ""} onClick={() => { if (t.id !== tipo) { setTipo(t.id); setFoto(null); } }} aria-pressed={tipo === t.id}>
            <span className="ds-tipo-ico"><Icon n={t.ico} s={24} /></span><b>{t.nombre}</b><small>{t.sub}</small>
          </button>
        ))}
      </div>

      {tipo === "feria" && (
        <>
          <p className="pn-etq">¿Cuál feria?</p>
          {proximas.length ? (
            <div className="pn-chips">{proximas.map((f) => <button key={f.id} className={feria?.id === f.id ? "is-on" : ""} onClick={() => { setFeria(f); setOrg(logoDeFeria(f)); }}>{f.nombre} · {fechaLarga(f.fecha).split(" ").slice(0, 2).join(" ")}</button>)}</div>
          ) : <p className="pn-nota">No tenés ferias próximas anotadas. Agregala en Ferias y volvé.</p>}
          <label className="pn-campo"><span>Horario (opcional)</span><input value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Ej.: 10 a.m. a 6 p.m." maxLength={40} /></label>
          <p className="pn-etq">¿La feria tiene organizadora?</p>
          <p className="pn-nota">Si tiene, subí su logo y lo pongo en el post. Si no, dejalo en «No hay».</p>
          <div className="ds-logos">
            {logos.map((l) => (
              <button key={l.id} className={org?.id === l.id ? "is-on" : ""} onClick={() => setOrg(l)} aria-pressed={org?.id === l.id}>
                <img src={fuente(l.url)} alt="" /><span>{l.nombre}</span>
              </button>
            ))}
            <button className={org === null ? "is-on" : ""} onClick={() => setOrg(null)} aria-pressed={org === null}><span className="ds-sin">—</span><span>No hay</span></button>
          </div>
          <div className="ds-subir-logo">
            <input value={orgNombre} onChange={(e) => setOrgNombre(e.target.value)} placeholder="Nombre de la organizadora" aria-label="Nombre de la organizadora" maxLength={60} />
            <label className={"pn-btn is-tinte" + (subiendoLogo ? " is-ocupado" : "")}><Icon n="foto" s={20} />{subiendoLogo ? "Guardando…" : "Subir su logo"}
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subirLogo(f); }} />
            </label>
          </div>
        </>
      )}

      {tipo === "coleccion" && (
        <>
          <label className="pn-campo"><span>Nombre de la colección</span><input value={coleccion} onChange={(e) => setColeccion(e.target.value)} placeholder="Ej.: Viajando por el mundo" maxLength={60} /></label>
          {d.colecciones.length > 0 && <div className="pn-chips">{d.colecciones.slice(0, 8).map((c) => <button key={c} className={coleccion === c ? "is-on" : ""} onClick={() => setColeccion(c)}>{c}</button>)}</div>}
        </>
      )}

      {tipo === "prenda" && (
        <>
          <p className="pn-etq">¿Cuál prenda?</p>
          <ul className="ds-rejilla">{conFoto.slice(0, 60).map((p) => (
            <li key={p.slug}><button className={pieza?.slug === p.slug ? "is-on" : ""} onClick={() => setPieza(p)}><img src={p.foto} alt="" loading="lazy" /><span>{p.nombre}</span></button></li>
          ))}</ul>
        </>
      )}

      {tipo === "oferta" && (
        <>
          <label className="pn-campo"><span>¿Qué oferta?</span><input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Ej.: 20% en todas las blusas" maxLength={80} /></label>
          <label className="pn-campo"><span>¿Hasta cuándo? (opcional)</span><input value={hasta} onChange={(e) => setHasta(e.target.value)} placeholder="Ej.: el domingo 30" maxLength={40} /></label>
        </>
      )}

      {tipo && (
        <label className="pn-campo"><span>{tipo === "otro" ? "¿Qué querés que diga?" : "¿Algo más que quieras que diga? (opcional)"}</span>
          <textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={400} placeholder={tipo === "feria" ? "Ej.: habrá ropa nueva y descuentos" : "Contalo con tus palabras y la IA lo acomoda"} /></label>
      )}

      {tipo && (
        <>
          <p className="pn-etq">La foto</p>
          {foto && !escogerFoto && (
            <div className="ds-foto">
              <img src={fuente(foto.src)} alt="" />
              <div><b>{foto.nombre}</b><span>Esta es la foto del post.</span></div>
            </div>
          )}
          {escogerFoto ? (
            <>
              <p className="pn-nota">Tocá la prenda.</p>
              <ul className="ds-rejilla">{conFoto.slice(0, 80).map((p) => (
                <li key={p.slug}><button onClick={() => { const f = fotoDePieza(p); if (f) { setFoto({ src: f, nombre: p.nombre }); setEscogerFoto(false); } }}><img src={p.foto} alt="" loading="lazy" /><span>{p.nombre}</span></button></li>
              ))}</ul>
              <button className="pn-btn is-gris" onClick={() => setEscogerFoto(false)}>Volver</button>
            </>
          ) : (
            <div className="ds-foto-botones">
              <label className={"pn-btn" + (foto ? " is-gris" : " is-grande")}><Icon n="foto" s={22} />{foto ? "Subir otra foto" : "Tomar o subir una foto"}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setFoto({ src: URL.createObjectURL(f), nombre: "Tu foto" }); }} />
              </label>
              <button className={"pn-btn" + (foto ? " is-gris" : " is-tinte")} onClick={() => setEscogerFoto(true)}><Icon n="percha" s={22} />{foto ? "Usar la de una prenda" : "Usar la foto de una prenda"}</button>
              {tipo === "feria" && feria?.foto && foto?.src !== feria.foto && (
                <button className="pn-btn is-gris" onClick={() => setFoto({ src: feria.foto!, nombre: `Foto de ${feria.nombre}` })}><Icon n="carpa" s={22} />Usar la foto de la feria</button>
              )}
            </div>
          )}
        </>
      )}

      {tipo && (
        <>
          <p className="pn-etq">¿Dónde va?</p>
          <div className="pn-seg">
            <button className={formato === "post" ? "is-on" : ""} onClick={() => setFormato("post")}>Post</button>
            <button className={formato === "story" ? "is-on" : ""} onClick={() => setFormato("story")}>Historia</button>
          </div>
        </>
      )}

      {falta && tipo && <p className="pn-nota">Falta {falta}.</p>}
      <div className="pn-botones is-columna">
        <button className="pn-btn is-grande" disabled={!!falta || pensando} onClick={disenar}>
          {pensando ? <><span className="pn-girando" aria-hidden />Diseñando…</> : <><Icon n="chispa" s={24} />Diseñar con IA</>}
        </button>
        <button className="pn-btn is-gris" disabled={pensando} onClick={cancelar}>Cancelar</button>
      </div>
    </div>
  );
}
