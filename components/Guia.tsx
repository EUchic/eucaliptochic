"use client";

import { useEffect, useRef, useState } from "react";
import type { Guia as GuiaT } from "@/lib/guias";
import { hablar } from "./hablar";
import Icon from "./Icon";

/**
 * La tarjetita que acompaña a Andrea después de «Te llevo»: le dice qué tocar, lo resalta en la pantalla
 * y avanza sola cuando ella lo hace. Al final le dice que ya terminó.
 */
export default function Guia({ g, voz, cerrar, volver }: { g: GuiaT; voz: boolean; cerrar: () => void; volver: () => void }) {
  const [i, setI] = useState(0);
  const [perdido, setPerdido] = useState(false);
  const fin = i >= g.pasos.length;
  const paso = g.pasos[i];
  const avanzar = useRef(() => {});
  avanzar.current = () => setI((x) => Math.min(x + 1, g.pasos.length));

  // Decir el paso en voz alta (si la voz está prendida).
  useEffect(() => {
    if (!voz) return;
    const t = setTimeout(() => { hablar(fin ? g.fin : paso.texto).catch(() => {}); }, 350);
    return () => clearTimeout(t);
  }, [i, voz, fin, g.fin, paso]);

  // Resaltar lo que hay que tocar (la pantalla cambia, así que se busca seguido) y llevarlo a la vista.
  useEffect(() => {
    setPerdido(false);
    if (fin || !paso.sel) return;
    let visto = false;
    const empezo = Date.now();
    const buscar = () => {
      const el = document.querySelector<HTMLElement>(paso.sel!);
      document.querySelectorAll(".gu-foco").forEach((x) => x !== el && x.classList.remove("gu-foco"));
      if (!el) { if (Date.now() - empezo > 5000) setPerdido(true); return; }
      el.classList.add("gu-foco");
      setPerdido(false);
      if (!visto) {
        visto = true;
        const r = el.getBoundingClientRect();
        const libre = window.innerHeight - 330; // lo que queda entre la barra de arriba y la guía
        if (r.top < 70 || r.bottom > window.innerHeight - 220) el.scrollIntoView({ behavior: "smooth", block: r.height > libre ? "start" : "center" });
      }
    };
    buscar();
    const t = setInterval(buscar, 400);
    return () => { clearInterval(t); document.querySelectorAll(".gu-foco").forEach((x) => x.classList.remove("gu-foco")); };
  }, [i, fin, paso]);

  // Avanzar solo: cuando toca lo indicado o cuando el panel avisa que pasó lo esperado.
  useEffect(() => {
    if (fin) return;
    const alTocar = (e: Event) => {
      if (paso.clic && e.target instanceof Element && e.target.closest(paso.clic)) setTimeout(() => avanzar.current(), 250);
    };
    const alEvento = (e: Event) => {
      const ev = (e as CustomEvent<string>).detail;
      if (paso.evento?.includes(ev)) setTimeout(() => avanzar.current(), 300);
    };
    document.addEventListener("click", alTocar, true);
    window.addEventListener("eu-guia", alEvento);
    return () => { document.removeEventListener("click", alTocar, true); window.removeEventListener("eu-guia", alEvento); };
  }, [i, fin, paso]);

  // Al terminar, se cierra sola después de un rato.
  useEffect(() => {
    if (!fin) return;
    const t = setTimeout(cerrar, 12000);
    return () => clearTimeout(t);
  }, [fin, cerrar]);

  const manual = !fin && (!paso.clic && !paso.evento || perdido);
  return (
    <aside className={"gu" + (fin ? " is-fin" : "")} role="status" aria-live="polite">
      <div className="gu-cab">
        <span className="gu-ico"><Icon n={fin ? "check" : "chispa"} s={18} /></span>
        <span className="gu-titulo">{g.titulo}</span>
        {!fin && g.pasos.length > 1 && <span className="gu-cuenta">{i + 1} de {g.pasos.length}</span>}
        <button className="gu-x" onClick={cerrar} aria-label="Cerrar la guía"><Icon n="cerrar" s={18} /></button>
      </div>
      <p className="gu-texto">{fin ? g.fin : paso.texto}</p>
      {!fin && perdido && <p className="gu-nota">Si no lo ves, bajá un poquito en la pantalla.</p>}
      {(manual || fin) && (
        <div className="gu-botones">
          {fin
            ? <><button className="pn-btn is-chico" onClick={volver}><Icon n="mic" s={18} />Volver al asistente</button><button className="pn-btn is-gris is-chico" onClick={cerrar}>Cerrar</button></>
            : <button className="pn-btn is-chico" onClick={() => avanzar.current()}><Icon n="check" s={18} />Listo, ya está</button>}
        </div>
      )}
    </aside>
  );
}
