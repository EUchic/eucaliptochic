// La revisión: cada día el panel mira qué se ve raro o incompleto y se lo pregunta a Andrea con botones para
// resolverlo. Nunca más de tres preguntas por día; lo que ella marca como "está bien" no se vuelve a preguntar.

import { fmt, hoy, type Datos, type Pieza } from "./asistente";

export type Pregunta = {
  clave: string;
  texto: string;
  que: "fotos_ia" | "precio" | "foto" | "categoria" | "feria_ventas" | "feria_lugar" | "existencias" | "sin_movs";
  slug?: string;
  mov?: string;
  feria?: string;
  chat?: string; // lo que se le manda al asistente para resolverlo conversando
};

const dias = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

export function revisar(d: Datos, piezas: Pieza[]): Pregunta[] {
  const h = hoy();
  const ok = new Set((d.ajustes.panel_revision_ok as string[] | undefined) ?? []);
  const out: Pregunta[] = [];
  const visibles = piezas.filter((p) => !p.oculta);

  const propuestas = piezas.filter((p) => p.propuesta).length;
  if (propuestas) out.push({ clave: "fotos-ia-" + h, que: "fotos_ia", texto: propuestas === 1 ? "Tengo una foto nueva de producto hecha con IA. ¿La revisás?" : `Tengo ${propuestas} fotos nuevas de producto hechas con IA. ¿Las revisás?` });

  for (const p of visibles.filter((p) => !p.precio)) out.push({ clave: "precio-" + p.slug, que: "precio", slug: p.slug, texto: `¿Cuánto cuesta ${p.nombre}? En la tienda sale sin precio.` });
  for (const p of visibles.filter((p) => !p.foto)) out.push({ clave: "foto-" + p.slug, que: "foto", slug: p.slug, texto: `A ${p.nombre} le falta foto. ¿Me la mandás?` });

  for (const m of d.movs.filter((m) => !m.anulado && m.sentido === "gasto" && m.categoria === "Otro" && dias(m.fecha, h) <= 60).slice(0, 3)) {
    out.push({ clave: "cat-" + m.id, que: "categoria", mov: m.id, texto: `¿Qué fue el gasto de ${fmt(m.crc)} del ${m.fecha.slice(8)}/${m.fecha.slice(5, 7)}${m.concepto && m.concepto !== "Otro" ? ` («${m.concepto}»)` : ""}? Lo tengo en «Otro».` });
  }

  for (const f of d.ferias) {
    const pasaron = dias(f.fecha, h);
    if (pasaron >= 1 && pasaron <= 21 && !d.movs.some((m) => !m.anulado && m.sentido === "ingreso" && m.feria === f.nombre)) {
      out.push({ clave: "feria-ventas-" + f.id, que: "feria_ventas", feria: f.id, texto: `¿Cuánto vendiste en ${f.nombre}? No tengo ventas anotadas de esa feria.`, chat: `Quiero anotar lo que vendí en la feria ${f.nombre}` });
    }
    if (pasaron <= 0 && pasaron >= -45 && (f.lat == null || f.lng == null)) {
      out.push({ clave: "feria-lugar-" + f.id, que: "feria_lugar", feria: f.id, texto: `¿Dónde es ${f.nombre}? Si me decís el lugar, en la página sale el botón de cómo llegar.` });
    }
  }

  const sinConteo = visibles.filter((p) => p.tallas?.length && p.tallas.every((t) => t.existencias == null));
  if (sinConteo.length) {
    const p = sinConteo[Number(h.replace(/-/g, "")) % sinConteo.length]; // una distinta cada día
    out.push({ clave: "existencias-" + p.slug + "-" + h.slice(0, 7), que: "existencias", slug: p.slug, texto: `¿Cuántas te quedan de ${p.nombre}? Así la tienda no vende lo que no hay.` });
  }

  const ultimo = d.movs.find((m) => !m.anulado)?.fecha;
  if (ultimo && dias(ultimo, h) >= 7) out.push({ clave: "sin-movs-" + ultimo, que: "sin_movs", texto: `No hemos anotado nada desde el ${ultimo.slice(8)}/${ultimo.slice(5, 7)}. ¿Hubo ventas o gastos que se nos pasaron?`, chat: "Quiero anotar ventas o gastos que se me pasaron" });

  return out.filter((p) => !ok.has(p.clave));
}
