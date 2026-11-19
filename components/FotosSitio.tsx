"use client";

import { useState } from "react";
import type { Datos, Pieza } from "@/lib/asistente";
import { achicarFoto } from "./Chat";
import Icon from "./Icon";

/**
 * Fotos de la página web que Andrea puede cambiar desde el panel.
 * Por ahora: la foto grande del inicio («Ropa cómoda, hecha para moverse con vos.»).
 */

type Pos = "arriba" | "centro" | "abajo";
type Sitio = { ventana?: { url: string; pos?: Pos } };
const ORIGINAL = "/fotos/andrea-cafe-eucalipto";
const ENCUADRE: Record<Pos, string> = { arriba: "center 4%", centro: "center 35%", abajo: "center 78%" };
const FRASE = "Ropa cómoda, hecha para moverse con vos.";

const chica = (u: string) =>
  u.startsWith("/fotos/") ? `${u}-800.webp`
  : /-1600\.(webp|jpg|png)$/.test(u) ? u.replace(/-1600\.(webp|jpg|png)$/, "-800.$1")
  : u.includes("squarespace-cdn.com") ? `${u}?format=750w` : u;

export default function FotosSitio({ d, piezas, avisar, refrescar }: {
  d: Datos; piezas: Pieza[]; avisar: (m: string, malo?: boolean) => void; refrescar: () => Promise<void>;
}) {
  const actual = (d.ajustes?.panel_sitio as Sitio | undefined)?.ventana;
  const [abierto, setAbierto] = useState(false);
  const [escoger, setEscoger] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const pos: Pos = actual?.pos ?? "centro";
  const foto = chica(actual?.url ?? ORIGINAL);

  async function mandar(cuerpo: BodyInit, json: boolean, ok: string) {
    try {
      const r = await fetch("/api/sitio", { method: "POST", body: cuerpo, headers: json ? { "content-type": "application/json" } : undefined });
      if (r.status === 401) { location.href = "/admin/entrar"; return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo cambiar la foto.");
      await refrescar();
      avisar(ok);
      setEscoger(false);
    } catch (e) { avisar((e as Error).message, true); } finally { setOcupado(""); }
  }
  const json = (b: object, ok: string) => mandar(JSON.stringify({ lugar: "ventana", ...b }), true, ok);

  async function subir(archivo: File) {
    setOcupado("Subiendo la foto…");
    try {
      const fd = new FormData();
      fd.set("lugar", "ventana"); fd.set("pos", pos); fd.set("id", crypto.randomUUID());
      fd.set("grande", await achicarFoto(archivo, 1600), "grande");
      fd.set("chica", await achicarFoto(archivo, 800), "chica");
      await mandar(fd, false, "Listo, ya cambió la foto del inicio. En la página se ve en un ratito.");
    } catch (e) { avisar((e as Error).message, true); setOcupado(""); }
  }

  // Una foto por pieza (la portada) para escoger rápido; primero las que tienen foto de IA.
  const opciones = piezas
    .map((p) => ({ p, f: (p.lista ?? []).find((x) => x.ia) ?? p.lista?.[0] }))
    .filter((x): x is { p: Pieza; f: NonNullable<Pieza["lista"]>[number] } => !!x.f?.base)
    .sort((a, b) => Number(!!b.f.ia) - Number(!!a.f.ia));

  return (
    <div className="pn-tarjeta si-tarjeta">
      <button className="si-cabeza" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <img src={foto} alt="" style={{ objectPosition: ENCUADRE[pos] }} />
        <span><b>Fotos de la página web</b><small>Cambiá la foto grande del inicio</small></span>
        <Icon n="flecha" s={20} />
      </button>

      {abierto && (
        <div className="si-cuerpo">
          <p className="pn-nota">Es la foto que aparece con «{FRASE}». Así se ve:</p>
          <div className="si-vistas">
            <figure className="si-cel">
              <div><img src={foto} alt="Vista en el celular" style={{ objectPosition: ENCUADRE[pos] }} /><p>{FRASE}</p></div>
              <figcaption>Celular</figcaption>
            </figure>
            <figure className="si-compu">
              <div><img src={foto} alt="Vista en la computadora" style={{ objectPosition: ENCUADRE[pos] }} /><p>{FRASE}</p></div>
              <figcaption>Computadora</figcaption>
            </figure>
          </div>

          <p className="pn-etq">¿Qué parte de la foto se ve?</p>
          <div className="pn-seg">
            {(["arriba", "centro", "abajo"] as const).map((k) => (
              <button key={k} className={pos === k ? "is-on" : ""} disabled={!!ocupado} onClick={() => k !== pos && (setOcupado("Guardando…"), json({ base: actual?.url ?? ORIGINAL, pos: k }, "Listo, ya cambié qué parte se ve."))}>
                {k === "arriba" ? "Arriba" : k === "centro" ? "Centro" : "Abajo"}
              </button>
            ))}
          </div>

          <div className="pn-botones is-columna">
            <label className={"pn-btn is-grande" + (ocupado ? " is-ocupado" : "")}>
              <Icon n="foto" s={22} />{ocupado || "Subir otra foto"}
              <input type="file" accept="image/*" hidden disabled={!!ocupado} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subir(f); }} />
            </label>
            <button className="pn-btn is-tinte" disabled={!!ocupado} onClick={() => setEscoger(!escoger)}><Icon n="percha" s={22} />{escoger ? "Cerrar las fotos de piezas" : "Usar la foto de una pieza"}</button>
            {actual && actual.url !== ORIGINAL && <button className="pn-txt is-centro" disabled={!!ocupado} onClick={() => { setOcupado("Guardando…"); json({ quitar: true }, "Listo, volvió la foto original."); }}>Volver a la foto original</button>}
          </div>

          {escoger && (
            <>
              <p className="pn-nota">Tocá la que querés poner. Las fotos verticales se ven mejor con «Arriba».</p>
              <ul className="si-rejilla">
                {opciones.map(({ p, f }) => (
                  <li key={f.id}>
                    <button disabled={!!ocupado} aria-pressed={actual?.url === f.base} onClick={() => { setOcupado("Guardando…"); json({ base: f.base, pos }, `Listo, ahora la foto del inicio es la de ${p.nombre}. En la página se ve en un ratito.`); }}>
                      <img src={f.url} alt="" loading="lazy" /><span>{p.nombre}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
