"use client";

import { useEffect, useRef } from "react";

/**
 * Arrastrar y soltar fotos en todo el panel: cualquier cuadro para subir fotos (un <label> con un
 * <input type="file">) también acepta fotos arrastradas desde la compu, otra pestaña u otra app.
 * Mientras arrastra, se marcan los cuadros donde se puede soltar.
 */

const ZONA = "label";
const zonaDe = (el: EventTarget | null) => {
  const z = el instanceof Element ? el.closest<HTMLElement>(ZONA) : null;
  const input = z?.querySelector<HTMLInputElement>('input[type="file"]');
  return z && input && !input.disabled ? { z, input } : null;
};
const conArchivos = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === "Files" || t === "text/uri-list" || t === "text/html");

/** Si arrastró una imagen de una página (sin archivo), la trae por su dirección. */
async function desdeDireccion(dt: DataTransfer): Promise<File | null> {
  const html = dt.getData("text/html");
  const src = html.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? dt.getData("text/uri-list").split("\n").find((l) => l && !l.startsWith("#"));
  if (!src) return null;
  const url = new URL(src.replace(/&amp;/g, "&"), location.href);
  const deLaTienda = url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/public/fotos/");
  const pedir = url.origin === location.origin ? url.href : deLaTienda ? `/api/disenos?foto=${encodeURIComponent(url.href)}` : url.href;
  const r = await fetch(pedir);
  if (!r.ok) throw new Error();
  const b = await r.blob();
  if (!b.type.startsWith("image/")) throw new Error();
  return new File([b], `foto.${b.type.split("/")[1] || "jpg"}`, { type: b.type });
}

export default function Soltar({ avisar: avisarProp }: { avisar: (m: string, malo?: boolean) => void }) {
  const ref = useRef(avisarProp);
  ref.current = avisarProp;
  useEffect(() => {
    const avisar = (m: string, malo?: boolean) => ref.current(m, malo);
    let dentro = 0;
    let encima: HTMLElement | null = null;
    const marcar = (si: boolean) => {
      document.documentElement.classList.toggle("arrastrando", si);
      document.querySelectorAll<HTMLElement>(ZONA).forEach((l) => {
        const ok = si && !!zonaDe(l);
        l.classList.toggle("se-suelta", ok);
      });
      if (!si && encima) { encima.classList.remove("is-encima"); encima = null; }
    };

    const entra = (e: DragEvent) => { if (!conArchivos(e)) return; dentro++; if (dentro === 1) marcar(true); };
    const sale = () => { dentro = Math.max(0, dentro - 1); if (!dentro) marcar(false); };
    const sobre = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      e.preventDefault(); // sin esto el navegador abre la foto y se sale del panel
      const z = zonaDe(e.target)?.z ?? null;
      if (z !== encima) { encima?.classList.remove("is-encima"); z?.classList.add("is-encima"); encima = z; }
      if (e.dataTransfer) e.dataTransfer.dropEffect = z ? "copy" : "none";
    };
    const suelta = async (e: DragEvent) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      dentro = 0; marcar(false);
      const zona = zonaDe(e.target);
      if (!zona) { avisar("Soltá la foto encima de un cuadro de foto.", true); return; }
      const acepta = zona.input.accept || "";
      let archivos = [...(e.dataTransfer?.files ?? [])].filter((f) => (acepta.includes("image") ? f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name) : true));
      if (!archivos.length && e.dataTransfer) {
        try { const f = await desdeDireccion(e.dataTransfer); if (f) archivos = [f]; } catch {
          avisar("Esa foto no se deja traer desde esa página. Guardala en la compu y arrastrala desde ahí.", true); return;
        }
      }
      if (!archivos.length) { avisar("Eso no parece una foto.", true); return; }
      const dt = new DataTransfer();
      (zona.input.multiple ? archivos : archivos.slice(0, 1)).forEach((f) => dt.items.add(f));
      zona.input.files = dt.files;
      zona.input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    window.addEventListener("dragenter", entra);
    window.addEventListener("dragleave", sale);
    window.addEventListener("dragover", sobre);
    window.addEventListener("drop", suelta);
    return () => {
      window.removeEventListener("dragenter", entra);
      window.removeEventListener("dragleave", sale);
      window.removeEventListener("dragover", sobre);
      window.removeEventListener("drop", suelta);
      marcar(false);
    };
  }, []);
  return null;
}
