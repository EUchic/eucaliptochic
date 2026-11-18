// Ayudas para las promociones de Instagram, compartidas por la pestaña Anuncios y el asistente.
// Nada se cobra sin que Andrea toque "Sí, autorizo": el servidor exige confirmo:true y respeta su tope.

import type { Feria } from "./asistente";

export type Post = { id: string; caption: string; tipo: string; miniatura: string; permalink: string; fecha: string };
export type Promo = {
  id: string; caption: string | null; miniatura: string | null; permalink: string | null;
  por_dia: number; dias: number; total: number; inicio: string; fin: string;
  estado: "creando" | "activa" | "detenida" | "terminada" | "error"; gastado: number; alcance: number; mensajes: number;
};
export type InfoAnuncios = { conectado: boolean; tope?: number | null; usado?: number; restante?: number | null; publico?: string; promos?: Promo[] };

export const IVA = 1.13;
export const conIva = (n: number) => Math.round(n * IVA);
export const DIAS = [1, 2, 3, 5, 7, 10, 14];
export const MONTOS = [2000, 2500, 3000];
export const RECOMENDADO = 2500;
export const TOPES = [15000, 25000, 40000];

const DIA = 864e5;
export const hoyCR = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
export const sumar = (f: string, n: number) => new Date(Date.parse(f + "T12:00:00Z") + n * DIA).toISOString().slice(0, 10);
export const entre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DIA);
export const fechaCorta = (f: string) =>
  new Date(f.length === 10 ? f + "T12:00:00Z" : f).toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Costa_Rica" });
export const primeraLinea = (t: string | null) => (t ?? "").split("\n")[0].trim() || "Post de Instagram";
export const plata = (n: number) => "₡" + Math.round(n).toLocaleString("es-CR").replace(/[.,\s]/g, " ");

/** Desde cuándo: hoy, mañana o terminando el día de una feria que viene. */
export type Arranque = { clave: string; etiqueta: string; feria?: Feria };
export function arranques(ferias: Feria[]): Arranque[] {
  const h = hoyCR();
  const prox = ferias.filter((f) => f.fecha > h && f.fecha <= sumar(h, 45)).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 2);
  return [
    { clave: "hoy", etiqueta: "Desde hoy" },
    { clave: "manana", etiqueta: "Desde mañana" },
    ...prox.map((f) => ({ clave: "feria-" + f.id, etiqueta: `Antes de ${f.nombre}`, feria: f })),
  ];
}

/** Fechas reales de la promoción según desde cuándo y cuántos días. */
export function calendario(a: Arranque, dias: number): { inicio: string; dias: number; fin: string; texto: string } {
  const h = hoyCR();
  let inicio = a.clave === "manana" ? sumar(h, 1) : h;
  let d = dias;
  if (a.feria) {
    // Termina el día de la feria; si no da el tiempo, empieza hoy y dura lo que alcance.
    inicio = sumar(a.feria.fecha, -(dias - 1));
    if (inicio < h) { inicio = h; d = entre(h, a.feria.fecha) + 1; }
  }
  d = Math.max(1, Math.min(14, d));
  const fin = sumar(inicio, d - 1);
  const texto = d === 1 ? `Solo el ${fechaCorta(inicio)}` : `Del ${fechaCorta(inicio)} al ${fechaCorta(fin)} (${d} días)`;
  return { inicio, dias: d, fin, texto };
}

export async function apiAnuncios<T = InfoAnuncios & { posts?: Post[]; alcance?: { min: number; max: number } | null }>(cuerpo?: object, que = ""): Promise<T> {
  const r = await fetch("/api/anuncios" + que, cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
  if (r.status === 401) { location.href = "/admin/entrar"; throw new Error("Entrá de nuevo."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Algo falló. Probá de nuevo.");
  return j as T;
}

export const nidPromo = () => crypto.randomUUID();
