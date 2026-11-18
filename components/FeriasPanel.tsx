"use client";

import { useEffect, useRef, useState } from "react";
import { fechaLinda, fmt, hoy, porFeria, type Accion, type Datos, type Feria } from "@/lib/asistente";
import Icon from "./Icon";

type Lugar = { nombre: string; direccion: string; lat: number; lng: number };
type Props = {
  d: Datos;
  enLinea: boolean;
  guardar: (a: Accion[], msg?: string) => Promise<boolean | void> | void;
  subirFoto: (f: Feria, archivo: File) => Promise<void>;
  avisar: (m: string, malo?: boolean) => void;
};
const nid = () => crypto.randomUUID();

/** Mapa chiquito de OpenStreetMap para que Andrea confirme que el punto es el correcto. */
export function MapaChico({ lat, lng }: { lat: number; lng: number }) {
  const caja = [lng - 0.006, lat - 0.0035, lng + 0.006, lat + 0.0035].map((n) => n.toFixed(5)).join(",");
  return (
    <iframe
      className="fp-mapa" title="Mapa del lugar" loading="lazy" referrerPolicy="no-referrer"
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${caja}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`}
    />
  );
}

export default function FeriasPanel({ d, enLinea, guardar, subirFoto, avisar }: Props) {
  const h = hoy();
  const proximas = d.ferias.filter((f) => f.fecha >= h).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pasadas = d.ferias.filter((f) => f.fecha < h).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <section className="pn-seccion">
      <header className="pn-cabeza">
        <h1>Ferias</h1>
        <p>Anotá la feria, ponele foto y el lugar. Las próximas salen en la página con botones para llegar en Waze o Google Maps.</p>
      </header>

      <form className="pn-tarjeta fp-nueva" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const nombre = String(f.get("n") ?? "").trim();
        if (!nombre) return;
        const id = nid();
        const fecha = String(f.get("f") || hoy());
        guardar([{ id, tipo: "feria", nombre, fecha }], "Feria anotada. Ahora ponele foto y lugar.");
        if (fecha >= hoy()) setAbierta(id);
        e.currentTarget.reset();
      }}>
        <label className="pn-campo"><span>Nombre de la feria</span><input name="n" placeholder="Ej.: Feria Navideña Escazú" autoComplete="off" /></label>
        <label className="pn-campo"><span>Fecha</span><input type="date" name="f" defaultValue={hoy()} /></label>
        <button className="pn-boton"><Icon n="mas" s={22} />Agregar feria</button>
      </form>

      {d.ferias.length === 0 && <p className="pn-vacio">Todavía no hay ferias anotadas.</p>}

      {proximas.length > 0 && (
        <>
          <h2 className="pn-sub">Próximas</h2>
          <ul className="fp-lista">
            {proximas.map((f) => (
              <li key={f.id} className={"pn-tarjeta" + (abierta === f.id ? " is-abierta" : "")}>
                <button className="fp-fila" onClick={() => enLinea && setAbierta(abierta === f.id ? null : f.id)} aria-expanded={abierta === f.id}>
                  <span className="fp-mini">{f.foto ? <img src={f.foto} alt="" /> : <Icon n="foto" s={26} />}</span>
                  <span className="fp-dato">
                    <b>{f.nombre}</b>
                    <small>{fechaLinda(f.fecha)}</small>
                    <span className={f.lat != null ? "fp-ok" : "fp-falta"}>
                      {f.lat != null ? <><Icon n="pin" s={18} />{f.lugar}</> : "Falta el lugar"}{!f.foto && " · Falta la foto"}
                    </span>
                  </span>
                  {enLinea && <span className="fp-flecha" aria-hidden><Icon n={abierta === f.id ? "cerrar" : "lapiz"} s={22} /></span>}
                </button>
                {abierta === f.id && (
                  <>
                    <Editor f={f} guardar={guardar} subirFoto={subirFoto} avisar={avisar} />
                    <Borrar f={f} guardar={guardar} alBorrar={() => setAbierta(null)} />
                  </>
                )}
              </li>
            ))}
          </ul>
          {!enLinea && <p className="pn-vacio">La foto y el lugar se ponen cuando el panel está conectado a la base.</p>}
        </>
      )}

      {pasadas.length > 0 && (
        <>
          <h2 className="pn-sub">Ya pasaron</h2>
          <ul className="fp-pasadas">
            {pasadas.map((f) => { const x = porFeria(d, f.nombre); return (
              <li key={f.id} className="pn-tarjeta">
                <div className="fp-pasada-cab"><b>{f.nombre}</b><small>{fechaLinda(f.fecha)}</small></div>
                <dl className="fp-numeros">
                  <div><dt>Vendió</dt><dd>{fmt(x.vendio)}</dd></div>
                  <div><dt>Gastó</dt><dd>{fmt(x.gasto)}</dd></div>
                  <div className="is-queda"><dt>Te dejó</dt><dd>{fmt(x.dejo)}</dd></div>
                </dl>
                {enLinea && <Borrar f={f} guardar={guardar} />}
              </li>
            ); })}
          </ul>
        </>
      )}
    </section>
  );
}

function Editor({ f, guardar, subirFoto, avisar }: { f: Feria; guardar: Props["guardar"]; subirFoto: Props["subirFoto"]; avisar: Props["avisar"] }) {
  const [subiendo, setSubiendo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [cambiar, setCambiar] = useState(f.lat == null);
  const [q, setQ] = useState("");
  const [lugares, setLugares] = useState<Lugar[] | null>(null);
  const [elegido, setElegido] = useState<Lugar | null>(null);
  const pedido = useRef<AbortController | null>(null);

  // Sugerencias mientras escribe (como en Google Maps), solo lugares de Costa Rica.
  useEffect(() => {
    const t = q.trim();
    pedido.current?.abort();
    if (t.length < 3 || elegido) { setLugares(null); setBuscando(false); return; }
    const c = new AbortController();
    pedido.current = c;
    const espera = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/lugares?auto=1&q=${encodeURIComponent(t)}`, { signal: c.signal });
        if (r.status === 401) { location.href = "/admin/entrar"; return; }
        const j = await r.json().catch(() => ({}));
        if (!c.signal.aborted) setLugares((j.lugares ?? []) as Lugar[]);
      } catch {} finally {
        if (!c.signal.aborted) setBuscando(false);
      }
    }, 300);
    return () => { clearTimeout(espera); c.abort(); };
  }, [q, elegido]);

  // Si no aparece en las sugerencias, se busca más a fondo.
  const aFondo = async () => {
    const t = q.trim();
    if (t.length < 2) return;
    pedido.current?.abort();
    setBuscando(true);
    try {
      const r = await fetch(`/api/lugares?q=${encodeURIComponent(t)}`);
      if (r.status === 401) { location.href = "/admin/entrar"; return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No pude buscar ahora.");
      setLugares((j.lugares ?? []) as Lugar[]);
    } catch (e) {
      avisar(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No hay internet. Probá de nuevo.", true);
    } finally {
      setBuscando(false);
    }
  };

  const confirmar = async (l: Lugar) => {
    await guardar([{ id: nid(), tipo: "feria_lugar", feria: f.id, nombre: f.nombre, lugar: l.nombre, direccion: l.direccion || undefined, lat: l.lat, lng: l.lng }], `Listo: ${f.nombre} queda en ${l.nombre}.`);
    setCambiar(false); setLugares(null); setElegido(null); setQ("");
  };

  return (
    <div className="fp-editor">
      <div className="fp-bloque">
        <h3>Foto de la feria</h3>
        <p className="pn-nota">El afiche de la feria o una foto del stand. Es lo primero que ve la gente.</p>
        {f.foto && <img className="fp-afiche" src={f.foto} alt={`Foto de ${f.nombre}`} />}
        <div className="fp-botones">
          <label className={"pn-boton" + (subiendo ? " is-ocupado" : "")}>
            <Icon n="foto" s={22} />{subiendo ? "Subiendo…" : f.foto ? "Cambiar foto" : "Subir foto"}
            <input type="file" accept="image/*" hidden disabled={subiendo} onChange={async (e) => {
              const a = e.target.files?.[0];
              e.target.value = "";
              if (!a) return;
              setSubiendo(true);
              try { await subirFoto(f, a); } finally { setSubiendo(false); }
            }} />
          </label>
          {f.foto && !subiendo && (
            <button className="pn-link" onClick={() => guardar([{ id: nid(), tipo: "feria_sin_foto", feria: f.id, nombre: f.nombre }], "Foto quitada.")}>Quitar foto</button>
          )}
        </div>
      </div>

      <div className="fp-bloque">
        <h3>¿Dónde es?</h3>
        {!cambiar && f.lat != null && f.lng != null ? (
          <>
            <p className="fp-lugar"><Icon n="pin" s={20} /><span><b>{f.lugar}</b>{f.direccion && <small>{f.direccion}</small>}</span></p>
            <MapaChico lat={f.lat} lng={f.lng} />
            <button className="pn-link" onClick={() => setCambiar(true)}>Cambiar el lugar</button>
          </>
        ) : elegido ? (
          <div className="fp-elegido">
            <p className="fp-lugar"><Icon n="pin" s={20} /><span><b>{elegido.nombre}</b>{elegido.direccion && <small>{elegido.direccion}</small>}</span></p>
            <MapaChico lat={elegido.lat} lng={elegido.lng} />
            <p className="pn-nota">¿El punto del mapa está bien?</p>
            <div className="fp-botones">
              <button className="pn-boton" onClick={() => confirmar(elegido)}><Icon n="check" s={22} />Sí, es aquí</button>
              <button className="pn-link" onClick={() => setElegido(null)}>No, ver otros</button>
            </div>
          </div>
        ) : (
          <>
            <label className="pn-buscador">
              <Icon n="buscar" s={22} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribí el lugar, ej.: Avenida Escazú" autoComplete="off" enterKeyHint="search"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (lugares?.length) setElegido(lugares[0]); else aFondo(); } }} />
              {buscando && <span className="pn-girando" aria-label="Buscando" />}
            </label>
            {lugares && lugares.length > 0 && (
              <ul className="fp-sugerencias" role="listbox" aria-label="Lugares encontrados">
                {lugares.map((l, i) => (
                  <li key={i}><button role="option" aria-selected={false} onClick={() => setElegido(l)}><Icon n="pin" s={20} /><span><b>{l.nombre}</b>{l.direccion && <small>{l.direccion}</small>}</span></button></li>
                ))}
              </ul>
            )}
            {lugares && lugares.length === 0 && !buscando && (
              <p className="pn-nota">No aparece. Probá con el cantón (ej.: «Plaza Antares, Curridabat») o <button type="button" className="pn-link" onClick={aFondo}>buscar más a fondo</button>.</p>
            )}
            {f.lat != null && <button className="pn-link" onClick={() => { setCambiar(false); setQ(""); }}>Dejar el lugar que estaba</button>}
          </>
        )}
      </div>
    </div>
  );
}

/** Borrar una feria, con confirmación en el mismo lugar (sin ventanas emergentes). */
function Borrar({ f, guardar, alBorrar }: { f: Feria; guardar: Props["guardar"]; alBorrar?: () => void }) {
  const [seguro, setSeguro] = useState(false);
  if (!seguro) return <button className="fp-borrar" onClick={() => setSeguro(true)}><Icon n="basura" s={20} />Borrar feria</button>;
  return (
    <div className="fp-seguro" role="alertdialog" aria-label={`Borrar ${f.nombre}`}>
      <p>¿Borrar <b>{f.nombre}</b>? Se quita de la página. Lo que vendiste o gastaste ahí queda anotado en Plata.</p>
      <div className="fp-botones">
        <button className="pn-boton is-peligro" onClick={async () => { await guardar([{ id: nid(), tipo: "borrar_feria", feria: f.id, nombre: f.nombre }], `Listo, borré ${f.nombre}.`); alBorrar?.(); }}>Sí, borrar</button>
        <button className="pn-link" onClick={() => setSeguro(false)}>No</button>
      </div>
    </div>
  );
}
