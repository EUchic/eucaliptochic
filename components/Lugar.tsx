"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// Buscador de lugares de Costa Rica: mientras Andrea escribe salen sugerencias (como en Google Maps),
// toca la correcta, ve el punto en un mapa chiquito y listo. Así en la página sale "Cómo llegar" con Waze o Maps.

export type Lugar = { nombre: string; direccion: string; lat: number; lng: number };

export function MapaChico({ lat, lng }: { lat: number; lng: number }) {
  const caja = [lng - 0.006, lat - 0.0035, lng + 0.006, lat + 0.0035].map((n) => n.toFixed(5)).join(",");
  return (
    <iframe
      className="lu-mapa" title="Mapa del lugar" loading="lazy" referrerPolicy="no-referrer"
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${caja}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`}
    />
  );
}

export default function BuscarLugar({ inicial = "", valor, alElegir, autoFocus }: { inicial?: string; valor: Lugar | null; alElegir: (l: Lugar | null) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState(inicial);
  const [lugares, setLugares] = useState<Lugar[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [aFondo, setAFondo] = useState(false);
  const pedido = useRef<AbortController | null>(null);

  async function buscar(t: string, fondo: boolean, c: AbortController) {
    setBuscando(true);
    try {
      const r = await fetch(`/api/lugares?${fondo ? "" : "auto=1&"}q=${encodeURIComponent(t)}`, { signal: c.signal });
      if (r.status === 401) { location.href = "/admin/entrar"; return; }
      const j = await r.json().catch(() => ({}));
      if (!c.signal.aborted) setLugares((j.lugares ?? []) as Lugar[]);
    } catch {} finally { if (!c.signal.aborted) setBuscando(false); }
  }

  useEffect(() => {
    const t = q.trim();
    pedido.current?.abort();
    if (t.length < 3 || valor) { setLugares(null); setBuscando(false); return; }
    const c = new AbortController();
    pedido.current = c;
    const espera = setTimeout(() => buscar(t, false, c), 280);
    return () => { clearTimeout(espera); c.abort(); };
  }, [q, valor]);

  if (valor) {
    return (
      <div className="lu-elegido">
        <MapaChico lat={valor.lat} lng={valor.lng} />
        <div className="lu-elegido-txt">
          <Icon n="pin" s={22} />
          <span><b>{valor.nombre}</b>{valor.direccion && <small>{valor.direccion}</small>}</span>
          <button type="button" className="pn-txt" onClick={() => { setQ(valor.nombre); alElegir(null); }}>Cambiar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lu">
      <label className="pn-buscar">
        <Icon n="pin" s={22} />
        <input
          value={q} onChange={(e) => { setQ(e.target.value); setAFondo(false); }} autoFocus={autoFocus}
          placeholder="Escribí el lugar, ej.: Avenida Escazú" aria-label="Lugar" autoComplete="off" enterKeyHint="search"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const c = new AbortController(); pedido.current?.abort(); pedido.current = c; setAFondo(true); buscar(q.trim(), true, c); } }}
        />
        {buscando && <span className="pn-girando is-chico" aria-label="Buscando" />}
      </label>
      {lugares && (
        <ul className="lu-lista" role="listbox">
          {lugares.map((l, i) => (
            <li key={l.nombre + l.lat + i}>
              <button type="button" onClick={() => alElegir(l)}>
                <Icon n="pin" s={22} />
                <span><b>{l.nombre}</b>{l.direccion && <small>{l.direccion}</small>}</span>
              </button>
            </li>
          ))}
          {!lugares.length && !buscando && <li className="lu-nada">No encontré ese lugar.</li>}
          {!aFondo && q.trim().length >= 3 && (
            <li><button type="button" className="lu-fondo" onClick={() => { const c = new AbortController(); pedido.current?.abort(); pedido.current = c; setAFondo(true); buscar(q.trim(), true, c); }}>
              <Icon n="buscar" s={20} /><span>Buscar más a fondo</span>
            </button></li>
          )}
        </ul>
      )}
    </div>
  );
}
