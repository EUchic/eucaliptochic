"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Line = { slug: string; nombre: string; precio: number; foto: string; talla: string; color: string | null; qty: number };
type Ctx = {
  lines: Line[];
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (l: Omit<Line, "qty">) => void;
  setQty: (key: string, qty: number) => void;
  total: number;
  count: number;
};
const CartCtx = createContext<Ctx | null>(null);
export const lineKey = (l: Pick<Line, "slug" | "talla" | "color">) => `${l.slug}|${l.talla}|${l.color ?? ""}`;
const fmt = (n: number) => "₡" + n.toLocaleString("es-CR").replace(/[.,]/g, " ");
const KEY = "euchic-bolsa-v1";

export function CartProvider({ children, whatsapp }: { children: ReactNode; whatsapp: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setLines(saved);
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {}
  }, [lines, ready]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<Ctx>(() => {
    const total = lines.reduce((s, l) => s + l.precio * l.qty, 0);
    const count = lines.reduce((s, l) => s + l.qty, 0);
    return {
      lines, open, setOpen, total, count,
      add: (l) => {
        setLines((prev) => {
          const k = lineKey(l);
          const hit = prev.find((x) => lineKey(x) === k);
          return hit ? prev.map((x) => (x === hit ? { ...x, qty: x.qty + 1 } : x)) : [...prev, { ...l, qty: 1 }];
        });
        setOpen(true);
      },
      setQty: (k, qty) =>
        setLines((prev) => prev.flatMap((x) => (lineKey(x) !== k ? [x] : qty <= 0 ? [] : [{ ...x, qty }]))),
    };
  }, [lines, open]);

  const mensaje = encodeURIComponent(
    "Hola Andrea, quiero pedir:\n" +
      lines.map((l) => `• ${l.qty} × ${l.nombre} (${l.talla}${l.color ? ", " + l.color : ""})${l.precio ? " — " + fmt(l.precio * l.qty) : ""}`).join("\n") +
      (value.total ? `\n\nTotal: ${fmt(value.total)}` : ""),
  );

  return (
    <CartCtx.Provider value={value}>
      {children}
      <div className={"scrim" + (open ? " is-open" : "")} onClick={() => setOpen(false)} aria-hidden />
      <aside className={"bolsa" + (open ? " is-open" : "")} aria-label="Tu bolsa" aria-hidden={!open} inert={!open}>
        <header className="bolsa-top">
          <h2>Tu bolsa</h2>
          <button className="link" onClick={() => setOpen(false)}>Cerrar</button>
        </header>
        {lines.length === 0 ? (
          <p className="bolsa-vacia">Todavía no has agregado piezas. Cuando elijas una talla y la agregues, aparece aquí.</p>
        ) : (
          <>
            <ul className="bolsa-lista">
              {lines.map((l) => (
                <li key={lineKey(l)}>
                  <img src={l.foto} alt="" width={84} height={112} />
                  <div>
                    <strong>{l.nombre}</strong>
                    <span>{l.talla}{l.color ? " · " + l.color : ""}</span>
                    <div className="qty">
                      <button aria-label={`Quitar una ${l.nombre}`} onClick={() => setQty(lineKey(l), l.qty - 1)}>−</button>
                      <span aria-live="polite">{l.qty}</span>
                      <button aria-label={`Agregar otra ${l.nombre}`} onClick={() => setQty(lineKey(l), l.qty + 1)}>+</button>
                    </div>
                  </div>
                  <b>{l.precio ? fmt(l.precio * l.qty) : "—"}</b>
                </li>
              ))}
            </ul>
            <footer className="bolsa-pie">
              <p><span>Total</span><b>{fmt(value.total)}</b></p>
              <a className="btn btn-full" href={`https://wa.me/${whatsapp}?text=${mensaje}`} target="_blank" rel="noopener noreferrer">
                Pedir por WhatsApp
              </a>
              <small>El pago con tarjeta y SINPE desde la web se activa al conectar ONVO Pay.</small>
            </footer>
          </>
        )}
      </aside>
    </CartCtx.Provider>
  );

  function setQty(k: string, q: number) {
    value.setQty(k, q);
  }
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("CartProvider ausente");
  return c;
}

export function BagButton() {
  const { count, setOpen } = useCart();
  return (
    <button className="bag" onClick={() => setOpen(true)} aria-label={`Abrir bolsa, ${count} piezas`}>
      Bolsa <span key={count} className={count ? "bump" : ""}>{count}</span>
    </button>
  );
}
