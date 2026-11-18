"use client";

import type { ReactNode } from "react";

/**
 * Vista previa con forma de post patrocinado de Instagram, para que Andrea vea cómo le va a salir a la gente.
 * Es solo una vista: la publicación real la arma Meta con el post original.
 */
export default function PostIG({ imagen, texto, pie, compacto, children }: {
  imagen: string | null; texto: string | null; pie?: ReactNode; compacto?: boolean; children?: ReactNode;
}) {
  return (
    <article className={"ig" + (compacto ? " is-compacto" : "")} aria-label="Así se ve el anuncio en Instagram">
      <header className="ig-cab">
        <span className="ig-avatar" aria-hidden>EU</span>
        <span className="ig-quien"><b>eucaliptochicr</b><small>Publicidad</small></span>
        <span className="ig-mas" aria-hidden>•••</span>
      </header>
      <div className="ig-media">
        {imagen ? <img src={imagen} alt="" loading="lazy" /> : <span className="ig-sin">Sin foto</span>}
        {children}
      </div>
      <div className="ig-cta"><span>Enviar mensaje</span><svg viewBox="0 0 24 24" aria-hidden><path d="m9 6 6 6-6 6" /></svg></div>
      {!compacto && (
        <div className="ig-acciones" aria-hidden>
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
          <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3.3-6.5L20 4l-.9 3.6A8 8 0 0 1 20 12Z" /></svg>
          <svg viewBox="0 0 24 24"><path d="m21 3-9 9M21 3l-6 18-3-9-9-3 18-6Z" /></svg>
          <svg viewBox="0 0 24 24" className="ig-guardar"><path d="M6 3h12v18l-6-4-6 4V3Z" /></svg>
        </div>
      )}
      {texto && <p className="ig-texto"><b>eucaliptochicr</b> {texto}</p>}
      {pie && <div className="ig-pie">{pie}</div>}
    </article>
  );
}
