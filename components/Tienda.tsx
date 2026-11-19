"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt, norm, type Accion, type Datos, type Pieza, type Talla } from "@/lib/asistente";
import type { BorradorPieza } from "@/lib/cerebro";
import Icon from "./Icon";
import FotosSitio from "./FotosSitio";
import { achicarFoto } from "./achicar";
import { avisarGuia } from "@/lib/guias";

type G = (a: Accion[], msg?: string) => Promise<boolean>;
type Subir = (p: Pieza, f: File[]) => Promise<boolean>;
type FotoSuelta = { id: string; src: string; alt: string; pieza?: string };
const nid = () => crypto.randomUUID();
const TALLAS = ["S-M", "M-L", "Talla única", "S", "M", "L", "XL"];
const slugDe = (t: string) => norm(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "pieza";

/** Tallas con cuántas hay de cada una: tocar para agregar, + y − para la cantidad. */
export function EditorTallas({ tallas, set }: { tallas: Talla[]; set: (t: Talla[]) => void }) {
  const [otra, setOtra] = useState("");
  const tiene = (t: string) => tallas.some((x) => x.talla === t);
  const cambiar = (t: string, n: number | null) => set(tallas.map((x) => (x.talla === t ? { ...x, existencias: n } : x)));
  return (
    <div className="ti-tallas">
      <div className="pn-chips">
        {[...new Set([...TALLAS, ...tallas.map((t) => t.talla)])].map((t) => (
          <button type="button" key={t} className={tiene(t) ? "is-on" : ""} onClick={() => set(tiene(t) ? tallas.filter((x) => x.talla !== t) : [...tallas, { talla: t, existencias: null }])}>{t}</button>
        ))}
        <span className="ti-otra"><input value={otra} onChange={(e) => setOtra(e.target.value)} placeholder="Otra" aria-label="Otra talla" maxLength={20} />
          <button type="button" disabled={!otra.trim() || tiene(otra.trim())} onClick={() => { set([...tallas, { talla: otra.trim(), existencias: null }]); setOtra(""); }} aria-label="Agregar talla"><Icon n="mas" s={18} /></button></span>
      </div>
      {tallas.length > 0 && (
        <ul className="ti-cantidades">
          {tallas.map((t) => (
            <li key={t.talla}>
              <span>{t.talla}</span>
              <div className="pn-paso">
                <button type="button" aria-label={`Una menos de ${t.talla}`} disabled={!t.existencias} onClick={() => cambiar(t.talla, Math.max(0, (t.existencias ?? 0) - 1))}><Icon n="menos" s={20} /></button>
                <b>{t.existencias ?? "—"}</b>
                <button type="button" aria-label={`Una más de ${t.talla}`} onClick={() => cambiar(t.talla, (t.existencias ?? 0) + 1)}><Icon n="mas" s={20} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="pn-nota">«—» quiere decir que no sabemos cuántas hay. Con 0, esa talla ya no se ofrece en la tienda.</p>
    </div>
  );
}

/** Ficha para meter un producto nuevo: foto, nombre, tipo, precio, tallas y cuántas hay, colección y descripción. */
export function FichaProducto({ inicial, piezas, colecciones, tipos, guardar, subir, listo, cancelar }: {
  inicial?: BorradorPieza; piezas: Pieza[]; colecciones: string[]; tipos: string[]; guardar: G; subir: Subir;
  listo: (texto: string) => void; cancelar: () => void;
}) {
  const [fotos, setFotos] = useState<File[]>([]);
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [tipo, setTipo] = useState(inicial?.tipoPieza ?? "");
  const [precio, setPrecio] = useState(inicial?.precio ? String(inicial.precio) : "");
  const [tallas, setTallas] = useState<Talla[]>(inicial?.tallas ?? []);
  const [coleccion, setColeccion] = useState(inicial?.coleccion ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [ocupado, setOcupado] = useState("");
  const vistas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  const monto = Number(precio.replace(/\D/g, ""));
  const falta = !fotos.length ? "la foto" : nombre.trim().length < 2 ? "el nombre" : !tipo ? "el tipo de prenda" : !monto ? "el precio" : !tallas.length ? "las tallas" : "";

  async function guardarTodo() {
    if (falta) return;
    setOcupado("Guardando…");
    let slug = slugDe(nombre);
    if (piezas.some((p) => p.slug === slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const ok = await guardar([{ id: nid(), tipo: "pieza", slug, nombre: nombre.trim(), tipoPieza: tipo, precio: monto, coleccion: coleccion || undefined, descripcion: descripcion.trim() || undefined, tallas }], "");
    if (!ok) { setOcupado(""); return; }
    setOcupado("Subiendo la foto…");
    const p: Pieza = { slug, nombre: nombre.trim(), precio: monto, tipo, coleccion, foto: "", fotos: 0 };
    const subio = await subir(p, fotos);
    setOcupado("");
    listo(subio ? `¡Listo! ${nombre.trim()} ya está en la tienda a ${fmt(monto)}.` : `Guardé ${nombre.trim()}, pero la foto no subió. Probá subirla desde Tienda.`);
  }

  return (
    <div className="ti-ficha">
      <div className="ti-ficha-fotos">
        {vistas.map((u, i) => <figure key={u}><img src={u} alt="" />{i === 0 && <figcaption>Portada</figcaption>}<button type="button" aria-label="Quitar foto" onClick={() => setFotos(fotos.filter((_, j) => j !== i))}><Icon n="cerrar" s={16} /></button></figure>)}
        <label className={"ti-ficha-subir" + (fotos.length ? "" : " is-grande")}>
          <Icon n="foto" s={fotos.length ? 26 : 34} /><span>{fotos.length ? "Otra foto" : "Tomar o subir la foto"}</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; setFotos([...fotos, ...fs].slice(0, 6)); }} />
        </label>
      </div>
      <label className="pn-campo"><span>Nombre</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Blusa Jade" autoComplete="off" /></label>
      <p className="pn-etq">Tipo de prenda</p>
      <div className="pn-chips">{tipos.map((t) => <button type="button" key={t} className={tipo === t ? "is-on" : ""} onClick={() => setTipo(t)}>{t}</button>)}</div>
      <label className="pn-campo"><span>Precio</span><div className="pn-con-prefijo"><span>₡</span><input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " "))} placeholder="0" /></div></label>
      <p className="pn-etq">Tallas y cuántas hay</p>
      <EditorTallas tallas={tallas} set={setTallas} />
      <p className="pn-etq">Colección (opcional)</p>
      <div className="pn-chips">{["", ...colecciones].map((c) => <button type="button" key={c || "-"} className={coleccion === c ? "is-on" : ""} onClick={() => setColeccion(c)}>{c || "Ninguna"}</button>)}</div>
      <label className="pn-campo"><span>Descripción (opcional)</span><textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Tela, corte, cómo se usa…" /></label>
      {falta && <p className="pn-nota">Falta {falta}.</p>}
      <div className="pn-botones is-columna">
        <button className="pn-btn is-grande" disabled={!!falta || !!ocupado} onClick={guardarTodo}><Icon n="check" s={24} />{ocupado || "Guardar producto"}</button>
        <button className="pn-btn is-gris" disabled={!!ocupado} onClick={cancelar}>Cancelar</button>
      </div>
    </div>
  );
}

type Avisar = (m: string, malo?: boolean) => void;
const ERRORES: [string, string][] = [["Color", "El color no es igual"], ["Largo", "Cambió el largo"], ["Mangas", "Las mangas están mal"], ["Detalles", "Le faltan o sobran detalles"], ["Tela", "Cambió la tela o el estampado"], ["La modelo", "La modelo o la pose"]];

/** «Tiene un error»: Andrea dice qué está mal y la IA hace la foto otra vez, corrigiendo eso. */
export function RehacerFoto({ p, inicial, avisar, refrescar, cerrar }: { p: Pieza; inicial?: string; avisar: Avisar; refrescar: () => Promise<void>; cerrar: (hecho?: boolean) => void }) {
  const [txt, setTxt] = useState(inicial ?? "");
  const [haciendo, setHaciendo] = useState(false);
  const [suyas, setSuyas] = useState<File[]>([]);
  const vistas = useMemo(() => suyas.map((f) => URL.createObjectURL(f)), [suyas]);
  const listo = txt.trim().length >= 4 || suyas.length > 0;
  async function rehacer() {
    setHaciendo(true);
    try {
      const fd = new FormData();
      fd.set("slug", p.slug); fd.set("correccion", txt.trim());
      for (const f of suyas) fd.append("referencia", await achicarFoto(f, 1600), "referencia");
      const r = await fetch("/api/fotos/estudio", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { location.href = "/admin/entrar"; return; }
      if (!r.ok) throw new Error(j.error || "No se pudo rehacer la foto.");
      await refrescar();
      avisar("¡Lista! Revisá la foto nueva en «Fotos nuevas hechas con IA».");
      avisarGuia("rehecha");
      cerrar(true);
    } catch (e) { avisar((e as Error).message, true); setHaciendo(false); }
  }
  return (
    <div className="ti-rehacer" data-guia="rehacer-caja">
      <p className="pn-etq">¿Qué está mal en la foto de {p.nombre}?</p>
      <div className="pn-chips">
        {ERRORES.map(([c, e]) => <button type="button" key={c} disabled={haciendo} className={txt.includes(e) ? "is-on" : ""} onClick={() => setTxt((t) => (t.includes(e) ? t : t.trim() ? `${t.trim().replace(/[.,:]$/, "")}. ${e}: ` : `${e}: `))}>{c}</button>)}
      </div>
      <textarea rows={3} maxLength={400} value={txt} disabled={haciendo} onChange={(e) => setTxt(e.target.value)} placeholder="Ej.: la blusa es azul más oscuro y las mangas llegan al codo" aria-label="Qué está mal" />

      <p className="pn-etq">Foto de cómo es de verdad</p>
      <p className="pn-nota">Tomale una foto a la prenda real, sobre todo a la parte que salió mal (el color, la manga, el botón…). Así la IA copia lo real y no adivina.</p>
      <div className="ti-ficha-fotos">
        {vistas.map((u, i) => (
          <figure key={u}><img src={u} alt={`Foto de referencia ${i + 1}`} />
            <button type="button" aria-label="Quitar esta foto" disabled={haciendo} onClick={() => setSuyas(suyas.filter((_, j) => j !== i))}><Icon n="cerrar" s={16} /></button></figure>
        ))}
        {suyas.length < 3 && (
          <label className={"ti-ficha-subir" + (suyas.length ? "" : " is-grande is-ref")}>
            <Icon n="foto" s={suyas.length ? 26 : 30} /><span>{suyas.length ? "Otra" : "Tomar o subir la foto"}</span>
            <input type="file" accept="image/*" multiple hidden disabled={haciendo} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; setSuyas([...suyas, ...fs].slice(0, 3)); }} />
          </label>
        )}
      </div>

      <p className="pn-nota">La foto de ahora no se toca hasta que aprobés la nueva.</p>
      <div className="pn-botones is-columna">
        <button className="pn-btn is-grande" disabled={!listo || haciendo} onClick={rehacer}><Icon n="chispa" s={22} />{haciendo ? "Rehaciendo la foto… (1 a 2 minutos)" : "Rehacer la foto"}</button>
        <button className="pn-btn is-gris" disabled={haciendo} onClick={() => cerrar()}>Cancelar</button>
      </div>
    </div>
  );
}

/** Fotos de producto hechas con IA que esperan el sí de Andrea. */
function FotosIA({ piezas, guardar, avisar, refrescar }: { piezas: Pieza[]; guardar: G; avisar: Avisar; refrescar: () => Promise<void> }) {
  const lista = piezas.filter((p) => p.propuesta);
  const [i, setI] = useState(0);
  const [error, setError] = useState(false);
  if (!lista.length) return null;
  const p = lista[Math.min(i, lista.length - 1)];
  const prop = p.propuesta!;
  return (
    <div className="pn-tarjeta ti-ia" data-guia="fotos-ia">
      <p className="pl-ia-etq"><Icon n="chispa" s={20} />Fotos nuevas hechas con IA · {Math.min(i, lista.length - 1) + 1} de {lista.length}</p>
      <h3>{p.nombre}</h3>
      <div className="ti-ia-par">
        <figure>{p.foto ? <img src={p.foto} alt="Foto actual" /> : <span className="ti-sinfoto"><Icon n="foto" s={26} /></span>}<figcaption>Ahora</figcaption></figure>
        <figure className="is-nueva"><a href={prop.grande ?? prop.url} target="_blank" rel="noopener"><img src={prop.url} alt="Foto nueva" /></a><figcaption>Nueva</figcaption></figure>
      </div>
      {error ? <RehacerFoto key={prop.id} p={p} avisar={avisar} refrescar={refrescar} cerrar={() => setError(false)} /> : (
        <>
          <p className="pn-nota">Fijate que la prenda sea igualita: color, largo, mangas y detalles. Tocá la nueva para verla grande.</p>
          <div className="pn-botones">
            <button className="pn-btn is-grande" onClick={() => guardar([{ id: nid(), tipo: "foto_aprobar", foto_id: prop.id, slug: p.slug, nombre: p.nombre }], `Listo, la foto nueva ya es la portada de ${p.nombre}.`)}><Icon n="check" s={22} />Usarla de portada</button>
            <button className="pn-btn is-gris is-grande" onClick={() => guardar([{ id: nid(), tipo: "foto_descartar", foto_id: prop.id, slug: p.slug, nombre: p.nombre }], "Descartada.")}>No me gusta</button>
          </div>
          <button className="pn-btn is-tinte" onClick={() => setError(true)}><Icon n="lapiz" s={20} />Tiene un error: decir qué y rehacerla</button>
          {lista.length > 1 && <button className="pn-txt" onClick={() => setI((i + 1) % lista.length)}>Ver la siguiente</button>}
        </>
      )}
    </div>
  );
}

function Detalle({ p, colecciones, guardar, subir, avisar, refrescar }: { p: Pieza; colecciones: string[]; guardar: G; subir: Subir; avisar: (m: string, malo?: boolean) => void; refrescar: () => Promise<void> }) {
  const [subiendo, setSubiendo] = useState(false);
  const [tallas, setTallas] = useState<Talla[]>(p.tallas ?? []);
  const [precio, setPrecio] = useState(p.precio ? String(p.precio) : "");
  const [haciendo, setHaciendo] = useState(false);
  const [error, setError] = useState(false);
  const [seguro, setSeguro] = useState("");
  const conIA = (p.lista ?? []).some((f) => f.ia);
  const cambioTallas = JSON.stringify(tallas) !== JSON.stringify(p.tallas ?? []);
  async function fotoIA() {
    setHaciendo(true);
    try {
      const r = await fetch("/api/fotos/estudio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: p.slug }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo hacer la foto.");
      await refrescar();
      avisar("¡Lista! Revisá la foto nueva arriba, en «Fotos nuevas hechas con IA».");
    } catch (e) { avisar((e as Error).message, true); } finally { setHaciendo(false); }
  }
  return (
    <div className="ti-detalle">
      <div className="ti-fotos" data-guia="fotos">
        {(p.lista ?? []).map((f, i) => (
          <figure key={f.id}>
            <img src={f.url} alt="" loading="lazy" />
            {(i === 0 || f.ia) && <figcaption>{[i === 0 ? "Portada" : "", f.ia ? "IA" : ""].filter(Boolean).join(" · ")}</figcaption>}
            {seguro === f.id
              ? <span className="ti-quitar-ok"><button onClick={() => guardar([{ id: nid(), tipo: "quitar_foto", foto_id: f.id, slug: p.slug, nombre: p.nombre }], "Foto quitada.")}>Quitar</button><button onClick={() => setSeguro("")}>No</button></span>
              : <button className="ti-quitar" aria-label="Quitar esta foto" onClick={() => setSeguro(f.id)}><Icon n="cerrar" s={16} /></button>}
          </figure>
        ))}
        <label className={"ti-subir" + (subiendo ? " is-ocupado" : "")} data-guia="subir-foto">
          <input type="file" accept="image/*" multiple hidden disabled={subiendo} onChange={async (e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; setSubiendo(true); await subir(p, fs); setSubiendo(false); }} />
          <Icon n={subiendo ? "reloj" : "mas"} s={24} /><span>{subiendo ? "Subiendo…" : "Foto"}</span>
        </label>
      </div>
      {p.propuesta ? <p className="pn-nota">Hay una foto nueva de IA esperando tu sí, arriba en «Fotos nuevas hechas con IA».</p>
        : error ? <RehacerFoto p={p} avisar={avisar} refrescar={refrescar} cerrar={() => setError(false)} />
        : conIA ? <button className="pn-btn is-tinte" data-guia="rehacer" onClick={() => setError(true)}><Icon n="lapiz" s={20} />La foto de IA tiene un error</button>
        : (p.lista?.length ?? 0) > 0 && (
          <button className="pn-btn is-tinte" disabled={haciendo} onClick={fotoIA}><Icon n="chispa" s={22} />{haciendo ? "Haciendo la foto… (1 a 2 minutos)" : "Hacer foto de producto con IA"}</button>
        )}

      <div className="pn-grupo">
        <label className="pn-fila"><span>Precio</span><span className="pn-con-prefijo is-fila"><span>₡</span><input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " "))}
          onBlur={() => { const v = Number(precio.replace(/\D/g, "")); if (v && v !== p.precio) guardar([{ id: nid(), tipo: "precio", slug: p.slug, nombre: p.nombre, precio: v }], "Precio cambiado."); }} placeholder="0" /></span></label>
        <label className="pn-fila"><span>Colección</span><select value={p.coleccion} onChange={(e) => guardar([{ id: nid(), tipo: "mover", slug: p.slug, nombre: p.nombre, coleccion: e.target.value }], "Colección cambiada.")}><option value="">Ninguna</option>{colecciones.map((c) => <option key={c}>{c}</option>)}</select></label>
        <button className="pn-fila" data-guia="visible" onClick={() => guardar([{ id: nid(), tipo: "visible", slug: p.slug, nombre: p.nombre, visible: !!p.oculta }], p.oculta ? "Ya se ve en la tienda." : "Escondida de la tienda.")} aria-pressed={!p.oculta}>
          <span>Se ve en la tienda</span><span className={"pn-switch" + (p.oculta ? "" : " is-on")} aria-hidden><i /></span>
        </button>
      </div>

      <div className="ti-tallas-caja" data-guia="tallas">
        <p className="pn-etq">Tallas y cuántas hay</p>
        <EditorTallas tallas={tallas} set={setTallas} />
        {cambioTallas && <button className="pn-btn" disabled={!tallas.length} onClick={() => guardar([{ id: nid(), tipo: "tallas", slug: p.slug, nombre: p.nombre, tallas }], "Tallas guardadas.")}><Icon n="check" s={22} />Guardar tallas</button>}
      </div>
    </div>
  );
}

export default function Tienda({ todas, colecciones, tipos, guardar, subir, fotos, d, abrir, avisar, refrescar }: {
  todas: Pieza[]; colecciones: string[]; tipos: string[]; guardar: G; subir: Subir; fotos: FotoSuelta[]; d: Datos; abrir?: string | null;
  avisar: (m: string, malo?: boolean) => void; refrescar: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<string | null>(abrir ?? null);
  useEffect(() => { if (abrir) setTimeout(() => document.getElementById("pz-" + abrir)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150); }, [abrir]);
  const [nueva, setNueva] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "sin-foto" | "escondidas">("todas");
  const vista = todas.filter((p) => norm(p.nombre).includes(norm(q)) && (filtro === "todas" || (filtro === "sin-foto" ? !p.foto : p.oculta)));
  return (
    <section className="pn-seccion">
      <header className="pn-titulo">
        <h1>Tienda</h1>
        <p>{todas.filter((p) => !p.oculta).length} piezas en la tienda. Tocá una para cambiarle precio, tallas o fotos.</p>
      </header>

      {nueva ? (
        <div className="pn-tarjeta"><FichaProducto piezas={todas} colecciones={colecciones} tipos={tipos} guardar={guardar} subir={subir} listo={(t) => { setNueva(false); avisar(t); }} cancelar={() => setNueva(false)} /></div>
      ) : <button className="pn-btn is-grande" data-guia="nuevo" onClick={() => setNueva(true)}><Icon n="mas" s={24} />Meter un producto nuevo</button>}

      <FotosIA piezas={todas} guardar={guardar} avisar={avisar} refrescar={refrescar} />
      <FotosSitio d={d} piezas={todas} avisar={avisar} refrescar={refrescar} />

      <label className="pn-buscar"><Icon n="buscar" s={22} /><input type="search" placeholder="Buscar una pieza" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="pn-seg">
        {([["todas", "Todas"], ["sin-foto", "Sin foto"], ["escondidas", "Escondidas"]] as const).map(([k, t]) => <button key={k} className={filtro === k ? "is-on" : ""} onClick={() => setFiltro(k)}>{t}</button>)}
      </div>

      <ul className="pn-lista ti-lista" data-guia="lista">
        {vista.map((p) => (
          <li key={p.slug} id={"pz-" + p.slug} className={"pn-tarjeta" + (p.oculta ? " is-off" : "") + (abierta === p.slug ? " is-abierta" : "")}>
            <button className="ti-fila" onClick={() => setAbierta(abierta === p.slug ? null : p.slug)} aria-expanded={abierta === p.slug}>
              {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : <span className="ti-sinfoto"><Icon n="foto" s={24} /></span>}
              <span className="ti-nombre"><b>{p.nombre}</b><small>{[p.coleccion || p.tipo, p.oculta ? "Escondida" : "", p.propuesta ? "Foto nueva para revisar" : ""].filter(Boolean).join(" · ")}</small></span>
              <span className="ti-precio">{p.precio ? fmt(p.precio) : "Sin precio"}</span>
            </button>
            {abierta === p.slug && <Detalle p={p} colecciones={colecciones} guardar={guardar} subir={subir} avisar={avisar} refrescar={refrescar} />}
          </li>
        ))}
        {!vista.length && <li className="pn-vacio">No hay piezas así.</li>}
      </ul>

      {fotos.length > 0 && (
        <>
          <h2 className="pn-sub">Fotos sin pieza ({fotos.length})</h2>
          <ul className="ti-sueltas">
            {fotos.map((f) => (
              <li key={f.id} className="pn-tarjeta">
                <img src={f.src} alt={f.alt} loading="lazy" />
                <select value="" onChange={(e) => { const p = todas.find((x) => x.slug === e.target.value); if (p) guardar([{ id: nid(), tipo: "foto", foto: f.id, slug: p.slug, nombre: p.nombre }], `Foto puesta en ${p.nombre}.`); }}>
                  <option value="">¿De cuál pieza es?</option>
                  {todas.map((p) => <option key={p.slug} value={p.slug}>{p.nombre}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
