"use client";

import { useState } from "react";
import { fechaLinda, fmt, hoy, porFeria, type Accion, type Datos, type Feria } from "@/lib/asistente";
import Icon from "./Icon";

type Lugar = { nombre: string; direccion: string; lat: number; lng: number };
type Props = {
  d: Datos;
  enLinea: boolean;
  guardar: (a: Accion[], msg?: string) => void | Promise<void>;
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
    <section className="ad-card">
      <h1>Ferias</h1>
      <p className="ad-linea">Anotá la feria, ponele una foto y el lugar exacto. Las próximas salen en la página con botones para llegar con Waze o Google Maps.</p>
      <form className="ad-barra" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const nombre = String(f.get("n") ?? "").trim();
        if (!nombre) return;
        const id = nid();
        guardar([{ id, tipo: "feria", nombre, fecha: String(f.get("f") || hoy()) }], "Feria anotada. Ahora ponele foto y lugar.");
        if (String(f.get("f") || hoy()) >= hoy()) setAbierta(id);
        e.currentTarget.reset();
      }}>
        <label className="ad-busca"><Icon n="carpa" s={22} /><input name="n" placeholder="Nombre de la feria" /></label>
        <input className="ad-fecha" type="date" name="f" defaultValue={hoy()} aria-label="Fecha" />
        <button className="btn"><Icon n="mas" s={22} />Agregar feria</button>
      </form>

      {d.ferias.length === 0 && <p className="ad-linea">Todavía no hay ferias anotadas.</p>}

      {proximas.length > 0 && (
        <>
          <h2 className="fp-titulo">Próximas</h2>
          <ul className="fp-lista">
            {proximas.map((f) => (
              <li key={f.id} className={abierta === f.id ? "is-abierta" : ""}>
                <div className="fp-fila">
                  <div className="fp-mini">{f.foto ? <img src={f.foto} alt="" /> : <Icon n="foto" s={28} />}</div>
                  <div className="fp-dato">
                    <b>{f.nombre}</b>
                    <small>{fechaLinda(f.fecha)}</small>
                    <span className={f.lat != null ? "fp-ok" : "fp-falta"}>
                      {f.lat != null ? <><Icon n="pin" s={18} />{f.lugar}</> : "Falta el lugar"}
                      {!f.foto && <> · Falta la foto</>}
                    </span>
                  </div>
                  {enLinea && (
                    <button className={abierta === f.id ? "btn btn-claro" : "btn"} onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                      {abierta === f.id ? "Listo" : f.foto && f.lat != null ? "Cambiar" : "Poner foto y lugar"}
                    </button>
                  )}
                </div>
                {abierta === f.id && <Editor f={f} guardar={guardar} subirFoto={subirFoto} avisar={avisar} />}
              </li>
            ))}
          </ul>
          {!enLinea && <p className="ad-linea">La foto y el lugar se ponen cuando el panel está conectado a la base.</p>}
        </>
      )}

      {pasadas.length > 0 && (
        <>
          <h2 className="fp-titulo">Ya pasaron</h2>
          <ul className="ad-ferias">
            {pasadas.map((f) => { const x = porFeria(d, f.nombre); return (
              <li key={f.id}><div><b>{f.nombre}</b><small>{fechaLinda(f.fecha)}</small></div><p><span>Vendió</span>{fmt(x.vendio)}</p><p><span>Gastó</span>{fmt(x.gasto)}</p><p className="ad-queda"><span>Dejó</span>{fmt(x.dejo)}</p></li>
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

  const buscar = async () => {
    const t = q.trim();
    if (t.length < 2) return;
    setBuscando(true); setLugares(null); setElegido(null);
    try {
      const r = await fetch(`/api/lugares?q=${encodeURIComponent(t)}`);
      if (r.status === 401) { location.href = "/admin/entrar"; return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No pude buscar ahora.");
      const ls = (j.lugares ?? []) as Lugar[];
      setLugares(ls);
      if (ls.length === 1) setElegido(ls[0]);
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
        <p className="ad-linea">El afiche de la feria o una foto del stand. Es lo primero que ve la gente.</p>
        {f.foto && <img className="fp-afiche" src={f.foto} alt={`Foto de ${f.nombre}`} />}
        <div className="fp-botones">
          <label className={`btn${subiendo ? " is-ocupado" : ""}`}>
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
            <button className="fp-quitar" onClick={() => guardar([{ id: nid(), tipo: "feria_sin_foto", feria: f.id, nombre: f.nombre }], "Foto quitada.")}>Quitar foto</button>
          )}
        </div>
      </div>

      <div className="fp-bloque">
        <h3>¿Dónde es?</h3>
        {!cambiar && f.lat != null && f.lng != null ? (
          <>
            <p className="fp-lugar"><Icon n="pin" s={20} /><span><b>{f.lugar}</b>{f.direccion && <small>{f.direccion}</small>}</span></p>
            <MapaChico lat={f.lat} lng={f.lng} />
            <button className="fp-quitar" onClick={() => setCambiar(true)}>Cambiar el lugar</button>
          </>
        ) : (
          <>
            <p className="ad-linea">Escribí el nombre del lugar, o pegá el link de Google Maps o Waze que te mandaron.</p>
            <form className="fp-busca" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
              <label className="ad-busca"><Icon n="buscar" s={22} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej.: Avenida Escazú, o el link del mapa" /></label>
              <button className="btn" disabled={buscando}>{buscando ? "Buscando…" : "Buscar"}</button>
            </form>
            {lugares && lugares.length === 0 && <p className="ad-linea">No encontré ese lugar. Probá con otro nombre o pegá el link de Google Maps.</p>}
            {lugares && lugares.length > 1 && !elegido && (
              <div className="ad-an-elegir fp-resultados">
                {lugares.map((l, i) => (
                  <button key={i} onClick={() => setElegido(l)}><b>{l.nombre}</b>{l.direccion && <span>{l.direccion}</span>}</button>
                ))}
              </div>
            )}
            {elegido && (
              <div className="fp-elegido">
                <p className="fp-lugar"><Icon n="pin" s={20} /><span><b>{elegido.nombre}</b>{elegido.direccion && <small>{elegido.direccion}</small>}</span></p>
                <MapaChico lat={elegido.lat} lng={elegido.lng} />
                <p className="ad-linea">¿El punto del mapa está bien?</p>
                <div className="fp-botones">
                  <button className="btn" onClick={() => confirmar(elegido)}><Icon n="check" s={22} />Sí, es aquí</button>
                  <button className="fp-quitar" onClick={() => setElegido(null)}>{lugares && lugares.length > 1 ? "No, ver los otros" : "No, buscar otro"}</button>
                </div>
              </div>
            )}
            {f.lat != null && <button className="fp-quitar" onClick={() => { setCambiar(false); setLugares(null); setElegido(null); }}>Dejar el lugar que estaba</button>}
          </>
        )}
      </div>
    </div>
  );
}
