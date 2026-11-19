// Reporte mensual de la plata: todo se calcula en el teléfono a partir de los movimientos.

import { fmt, hoy, type Datos, type Mov } from "./asistente";

export type Fila = { nombre: string; monto: number; veces: number };
export type Reporte = {
  mes: string; nombre: string; entro: number; salio: number; queda: number; ventas: number; promedio: number; iva: number;
  antes: { entro: number; salio: number; queda: number; nombre: string };
  gastos: Fila[]; canales: Fila[]; metodos: Fila[]; personas: Fila[]; ferias: { nombre: string; vendio: number; gasto: number; dejo: number }[];
  movs: Mov[];
};

export const mesDe = (f: string) => f.slice(0, 7);
export const mesActual = () => mesDe(hoy());
export function mover(mes: string, n: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export const nombreMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-CR", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.replace(" de ", " ").replace(/^./, (c) => c.toUpperCase());
};

function agrupar(movs: Mov[], clave: (m: Mov) => string | undefined): Fila[] {
  const t = new Map<string, Fila>();
  for (const m of movs) {
    const k = clave(m);
    if (!k) continue;
    const f = t.get(k) ?? { nombre: k, monto: 0, veces: 0 };
    f.monto += m.crc; f.veces++;
    t.set(k, f);
  }
  return [...t.values()].sort((a, b) => b.monto - a.monto);
}

export function reporte(d: Datos, mes: string): Reporte {
  const vivos = d.movs.filter((m) => !m.anulado);
  const delMes = vivos.filter((m) => mesDe(m.fecha) === mes);
  const previo = vivos.filter((m) => mesDe(m.fecha) === mover(mes, -1));
  const suma = (l: Mov[], s: "ingreso" | "gasto") => l.filter((m) => m.sentido === s).reduce((a, m) => a + m.crc, 0);
  const ing = delMes.filter((m) => m.sentido === "ingreso");
  const gas = delMes.filter((m) => m.sentido === "gasto");
  const entro = suma(delMes, "ingreso"), salio = suma(delMes, "gasto");
  const nombresFerias = [...new Set(delMes.map((m) => m.feria).filter((f): f is string => !!f))];
  return {
    mes, nombre: nombreMes(mes), entro, salio, queda: entro - salio, ventas: ing.length, promedio: ing.length ? entro / ing.length : 0,
    iva: Math.round((entro * 13) / 113),
    antes: { entro: suma(previo, "ingreso"), salio: suma(previo, "gasto"), queda: suma(previo, "ingreso") - suma(previo, "gasto"), nombre: nombreMes(mover(mes, -1)) },
    gastos: agrupar(gas, (m) => m.categoria),
    canales: agrupar(ing, (m) => m.categoria),
    metodos: agrupar(ing, (m) => m.metodo),
    personas: agrupar(delMes, (m) => m.persona ? `${m.persona} (${m.sentido === "ingreso" ? "clienta" : "pago"})` : undefined).slice(0, 6),
    ferias: nombresFerias.map((f) => {
      const v = suma(delMes.filter((m) => m.feria === f), "ingreso"), g = suma(delMes.filter((m) => m.feria === f), "gasto");
      return { nombre: f, vendio: v, gasto: g, dejo: v - g };
    }).sort((a, b) => b.dejo - a.dejo),
    movs: delMes,
  };
}

/** Cambio contra el mes anterior, en palabras ("12 % más que octubre"). */
export function cambio(ahora: number, antes: number, mesAntes: string) {
  if (!antes) return "";
  const p = Math.round(((ahora - antes) / Math.abs(antes)) * 100);
  if (p === 0) return `Igual que ${mesAntes.split(" ")[0].toLowerCase()}`;
  return `${Math.abs(p)} % ${p > 0 ? "más" : "menos"} que ${mesAntes.split(" ")[0].toLowerCase()}`;
}

/** Lo que se le manda a la IA para el análisis (solo números, sin datos sensibles de más). */
export function paraIA(r: Reporte) {
  const f = (l: Fila[]) => l.map((x) => `${x.nombre}: ${fmt(x.monto)} (${x.veces})`).join("; ");
  return {
    mes: r.nombre, entro: r.entro, salio: r.salio, queda: r.queda, ventas: r.ventas, ticket_promedio: Math.round(r.promedio),
    mes_anterior: r.antes, gastos_por_categoria: f(r.gastos), ventas_por_canal: f(r.canales), como_le_pagan: f(r.metodos),
    personas: f(r.personas), ferias: r.ferias.map((x) => `${x.nombre}: vendió ${fmt(x.vendio)}, gastó ${fmt(x.gasto)}, dejó ${fmt(x.dejo)}`).join("; "),
    dias_con_movimientos: new Set(r.movs.map((m) => m.fecha)).size,
  };
}
