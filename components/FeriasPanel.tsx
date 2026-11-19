"use client";

import { useState } from "react";
import { fechaLinda, fmt, hoy, porFeria, type Accion, type Datos, type Feria } from "@/lib/asistente";
import { comoLlegar } from "@/lib/ferias";
import Icon from "./Icon";
import BuscarLugar, { type Lugar } from "./Lugar";

type Props = {
  d: Datos;
  enLinea: boolean;
  guardar: (a: Accion[], msg?: string) => Promise<boolean>;
  subirFoto: (f: Feria, archivo: File) => Promise<void>;
  avisar: (m: string, malo?: boolean) => void;
};
const nid = () => crypto.randomUUID();

/** Ficha de feria nueva: nombre, fecha y lugar real (con mapa). La usan la pestaña Ferias y el chat. */
export function FichaFeria({ inicial, guardar, listo, cancelar }: {
  inicial?: { nombre?: string; fecha?: string; lugar?: string };
  guardar: Props["guardar"]; listo: (f: { id: string; nombre: string }) => void; cancelar?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy());
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ok = nombre.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  return (
    <form className="pn-ficha" onSubmit={async (e) => {
      e.preventDefault();
      if (!ok) return;
      setOcupado(true);
      const id = nid();
      const g = await guardar([{ id, tipo: "feria", nombre: nombre.trim(), fecha, ...(lugar ? { lugar: lugar.nombre, direccion: lugar.direccion, lat: lugar.lat, lng: lugar.lng } : {}) }],
        lugar ? "Feria anotada. Ya sale en la página con el botón de cómo llegar." : "Feria anotada. Cuando sepás el lugar, ponéselo para que salga cómo llegar.");
      setOcupado(false);
      if (g) listo({ id, nombre: nombre.trim() });
    }}>
      <label className="pn-campo"><span>Nombre de la feria</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Feria Navideña Escazú" autoComplete="off" /></label>
      <label className="pn-campo"><span>Fecha</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      <div className="pn-campo"><span>¿Dónde es?</span><BuscarLugar inicial={inicial?.lugar ?? ""} valor={lugar} alElegir={setLugar} /></div>
      <div className="pn-botones is-columna">
        <button className="pn-btn is-grande" disabled={!ok || ocupado}><Icon n="check" s={22} />{ocupado ? "Guardando…" : "Guardar feria"}</button>
        {cancelar && <button type="button" className="pn-btn is-gris" onClick={cancelar}>Cancelar</button>}
      </div>
    </form>
  );
}

export default function FeriasPanel({ d, enLinea, guardar, subirFoto, avisar }: Props) {
  const h = hoy();
  const proximas = d.ferias.filter((f) => f.fecha >= h).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pasadas = d.ferias.filter((f) => f.fecha < h).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);

  return (
    <section className="pn-seccion">
      <header className="pn-titulo">
        <h1>Ferias</h1>
        <p>Las próximas salen en la página con su foto y botones para llegar con Waze o Google Maps.</p>
      </header>

      {nueva ? (
        <div className="pn-tarjeta"><FichaFeria guardar={guardar} cancelar={() => setNueva(false)} listo={(f) => { setNueva(false); setAbierta(f.id); }} /></div>
      ) : (
        <button className="pn-btn is-grande" onClick={() => setNueva(true)}><Icon n="mas" s={24} />Agregar una feria</button>
      )}

      {d.ferias.length === 0 && !nueva && <p className="pn-vacio">Todavía no hay ferias anotadas.</p>}

      {proximas.length > 0 && (
        <>
          <h2 className="pn-sub">Próximas</h2>
          <ul className="pn-lista">
            {proximas.map((f) => (
              <li key={f.id} className={"pn-tarjeta fp-feria" + (abierta === f.id ? " is-abierta" : "")}>
                <button className="fp-fila" onClick={() => enLinea && setAbierta(abierta === f.id ? null : f.id)} aria-expanded={abierta === f.id}>
                  <span className="fp-mini">{f.foto ? <img src={f.foto} alt="" /> : <Icon n="carpa" s={26} />}</span>
                  <span className="fp-dato">
                    <b>{f.nombre}</b>
                    <small>{fechaLinda(f.fecha).replace(/^./, (c) => c.toUpperCase())}</small>
                    <span className={f.lat != null ? "fp-ok" : "fp-falta"}>
                      {f.lat != null ? <><Icon n="pin" s={16} />{f.lugar}</> : "Falta el lugar"}{!f.foto && " · Falta la foto"}
                    </span>
                  </span>
                  <Icon n={abierta === f.id ? "cerrar" : "flecha"} s={20} />
                </button>
                {abierta === f.id && <Editor f={f} guardar={guardar} subirFoto={subirFoto} avisar={avisar} cerrar={() => setAbierta(null)} />}
              </li>
            ))}
          </ul>
        </>
      )}

      {pasadas.length > 0 && (
        <>
          <h2 className="pn-sub">Ya pasaron</h2>
          <ul className="pn-lista">
            {pasadas.map((f) => { const x = porFeria(d, f.nombre); return (
              <li key={f.id} className="pn-tarjeta fp-pasada">
                <div className="fp-pasada-cab"><b>{f.nombre}</b><small>{fechaLinda(f.fecha)}</small></div>
                <dl className="pn-numeros">
                  <div><dt>Vendió</dt><dd>{fmt(x.vendio)}</dd></div>
                  <div><dt>Gastó</dt><dd>{fmt(x.gasto)}</dd></div>
                  <div className="is-fuerte"><dt>Te dejó</dt><dd>{fmt(x.dejo)}</dd></div>
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

function Editor({ f, guardar, subirFoto, avisar, cerrar }: { f: Feria; guardar: Props["guardar"]; subirFoto: Props["subirFoto"]; avisar: Props["avisar"]; cerrar: () => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [cambiar, setCambiar] = useState(f.lat == null);
  const ir = f.lat != null && f.lng != null ? comoLlegar({ ...f, lat: f.lat, lng: f.lng } as never) : null;
  return (
    <div className="fp-editor">
      <div className="fp-foto">
        {f.foto ? <img src={f.foto} alt={`Foto de ${f.nombre}`} /> : <span className="fp-sinfoto"><Icon n="foto" s={30} />Sin foto</span>}
        <div className="pn-botones">
          <label className={"pn-btn is-tinte" + (subiendo ? " is-ocupado" : "")}>
            <Icon n="foto" s={22} />{subiendo ? "Subiendo…" : f.foto ? "Cambiar foto" : "Poner foto"}
            <input type="file" accept="image/*" hidden disabled={subiendo} onChange={async (e) => {
              const a = e.target.files?.[0]; e.target.value = "";
              if (!a) return;
              setSubiendo(true); await subirFoto(f, a); setSubiendo(false);
            }} />
          </label>
          {f.foto && <button className="pn-btn is-gris" onClick={() => guardar([{ id: nid(), tipo: "feria_sin_foto", feria: f.id, nombre: f.nombre }], "Foto quitada.")}>Quitar foto</button>}
        </div>
      </div>

      <div className="fp-lugar">
        <h3>Lugar</h3>
        {!cambiar && f.lat != null ? (
          <>
            <p className="fp-lugar-txt"><Icon n="pin" s={20} /><span><b>{f.lugar}</b>{f.direccion && <small>{f.direccion}</small>}</span></p>
            {ir && <div className="fp-ir"><a className="pn-btn is-gris is-chico" href={ir.waze} target="_blank" rel="noopener">Probar en Waze</a><a className="pn-btn is-gris is-chico" href={ir.google} target="_blank" rel="noopener">Probar en Maps</a></div>}
            <button className="pn-txt" onClick={() => setCambiar(true)}>Cambiar el lugar</button>
          </>
        ) : (
          <BuscarLugar inicial={f.lugar ?? ""} valor={null} alElegir={async (l) => {
            if (!l) return;
            const ok = await guardar([{ id: nid(), tipo: "feria_lugar", feria: f.id, nombre: f.nombre, lugar: l.nombre, direccion: l.direccion, lat: l.lat, lng: l.lng }], "Lugar guardado. Ya sale «Cómo llegar» en la página.");
            if (ok) setCambiar(false); else avisar("No se guardó el lugar. Probá de nuevo.", true);
          }} />
        )}
      </div>
      <Borrar f={f} guardar={guardar} alBorrar={cerrar} />
    </div>
  );
}

function Borrar({ f, guardar, alBorrar }: { f: Feria; guardar: Props["guardar"]; alBorrar?: () => void }) {
  const [seguro, setSeguro] = useState(false);
  if (!seguro) return <button className="pn-txt is-peligro fp-borrar" onClick={() => setSeguro(true)}><Icon n="basura" s={18} />Borrar feria</button>;
  return (
    <div className="pn-seguro">
      <p>¿Borrar {f.nombre}? Se quita de la página. Lo que vendiste ahí queda anotado en Plata.</p>
      <div className="pn-botones">
        <button className="pn-btn is-peligro" onClick={async () => { if (await guardar([{ id: nid(), tipo: "borrar_feria", feria: f.id, nombre: f.nombre }], "Feria borrada.")) alBorrar?.(); }}>Sí, borrarla</button>
        <button className="pn-btn is-gris" onClick={() => setSeguro(false)}>No</button>
      </div>
    </div>
  );
}
