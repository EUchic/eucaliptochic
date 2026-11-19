import { NextResponse } from "next/server";
import { hayIA, jsonIA } from "@/lib/ia";
import { no, permitido } from "@/lib/panel";

// Análisis del mes con recomendaciones: la IA lee los números del reporte (ya calculados en el panel)
// y le explica a Andrea, en simple, cómo le fue y qué puede hacer. No guarda nada.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type Analisis = { titular: string; puntos: { tipo: "bien" | "ojo" | "idea"; texto: string }[]; recomendaciones: string[] };

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  if (!hayIA()) return no("El análisis con IA se activa con OpenAI.", 501);
  const b = (await req.json().catch(() => null)) as { mes?: string; datos?: unknown } | null;
  const datos = JSON.stringify(b?.datos ?? {}).slice(0, 12_000);
  if (!b?.mes || datos.length < 10) return no("Faltan los datos del mes.", 400);
  try {
    const a = await jsonIA<Analisis>({
      instrucciones: "Sos la asesora financiera de confianza de Andrea, dueña de Eucalipto Chic (ropa de mujer de diseño costarricense; vende en ferias, por WhatsApp/Instagram y en su web; le confecciona Juanita). Explicás con cariño y claridad, en español de Costa Rica con voseo, sin tecnicismos, con números exactos en colones (formato ₡12 345). Sos honesta: si algo va mal, lo decís con tacto y con una solución concreta. Nunca inventés datos que no están.",
      pedido: `Analizá el mes ${b.mes} con estos datos (incluyen el mes anterior para comparar): ${datos}\nDevolvé: titular (una frase que resuma cómo le fue), puntos (3 a 5; tipo 'bien' para lo bueno, 'ojo' para alertas, 'idea' para oportunidades; cada uno 1 o 2 frases) y recomendaciones (2 a 4 acciones concretas y realistas para el próximo mes).`,
      esquema: { type: "object", additionalProperties: false, required: ["titular", "puntos", "recomendaciones"], properties: {
        titular: { type: "string" },
        puntos: { type: "array", items: { type: "object", additionalProperties: false, required: ["tipo", "texto"], properties: { tipo: { type: "string", enum: ["bien", "ojo", "idea"] }, texto: { type: "string" } } } },
        recomendaciones: { type: "array", items: { type: "string" } },
      } },
      esfuerzo: "medium", max: 4000,
    });
    return NextResponse.json({ analisis: a });
  } catch (e) {
    console.error("[analisis]", (e as Error).message);
    return no("La IA no pudo hacer el análisis ahora. Probá en un rato.", 502);
  }
}
