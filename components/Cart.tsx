"use client";

import Link from "next/link";
import Icon, { Rama } from "./Icon";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Mark } from "./Logo";

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
  useEffect(() => {
    document.documentElement.toggleAttribute("data-lock", open);
  }, [open]);

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
          <h2><Icon n="bolsa" s={30} /> Tu bolsa {value.count > 0 && <small>{value.count}</small>}</h2>
          <button className="redondo" onClick={() => setOpen(false)} aria-label="Cerrar bolsa"><Icon n="cerrar" /></button>
        </header>
        {lines.length === 0 ? (
          <div className="bolsa-vacia">
            <Rama />
            <p>Tu bolsa está vacía.</p>
            <a className="btn" href="/tienda" onClick={() => setOpen(false)}>Ver la tienda</a>
          </div>
        ) : (
          <>
            <ul className="bolsa-lista">
              {lines.map((l) => (
                <li key={lineKey(l)}>
                  <a href={`/tienda/${l.slug}`}><img src={l.foto} alt="" width={96} height={128} /></a>
                  <div className="bolsa-info">
                    <strong>{l.nombre}</strong>
                    <span>Talla {l.talla}{l.color ? ", " + l.color : ""}</span>
                    <div className="bolsa-fila">
                      <div className="qty">
                        <button aria-label={`Quitar una ${l.nombre}`} onClick={() => value.setQty(lineKey(l), l.qty - 1)}><Icon n="menos" s={18} /></button>
                        <span aria-live="polite">{l.qty}</span>
                        <button aria-label={`Agregar otra ${l.nombre}`} onClick={() => value.setQty(lineKey(l), l.qty + 1)}><Icon n="mas" s={18} /></button>
                      </div>
                      <b>{l.precio ? fmt(l.precio * l.qty) : "Consultar"}</b>
                    </div>
                    <button className="bolsa-quitar" onClick={() => value.setQty(lineKey(l), 0)}>Quitar</button>
                  </div>
                </li>
              ))}
            </ul>
            <footer className="bolsa-pie">
              <p><span>Total</span><b>{fmt(value.total)}</b></p>
              <a className="btn btn-full btn-wa" href={`https://wa.me/${whatsapp}?text=${mensaje}`} target="_blank" rel="noopener noreferrer">
                <Icon n="chat" s={22} /> Pedir por WhatsApp
              </a>
              <small>Andrea te confirma disponibilidad, entrega y forma de pago por WhatsApp.</small>
            </footer>
          </>
        )}
      </aside>
    </CartCtx.Provider>
  );
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("CartProvider ausente");
  return c;
}

export function BagButton() {
  const { count, setOpen } = useCart();
  return (
    <button className="nav-item bag" onClick={() => setOpen(true)} aria-label={`Abrir bolsa, ${count} piezas`}>
      <span className="bag-ico"><Icon n="bolsa" s={28} />{count > 0 && <i key={count} className="bump">{count}</i>}</span>
      <span>Bolsa</span>
    </button>
  );
}
