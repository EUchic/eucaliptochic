import "server-only";

// Llamadas a OpenAI (Responses API) que comparten el asistente, la segmentación de anuncios y los reportes.

export const hayIA = () => Boolean(process.env.OPENAI_API_KEY);
const BASE = () => process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
export const MODELO = () => process.env.OPENAI_MODEL || "gpt-6-luna";

export type Salida = { type: string; name?: string; arguments?: string; call_id?: string; content?: { type: string; text?: string }[] };

export async function responses(cuerpo: Record<string, unknown>, ms = 40_000): Promise<{ output?: Salida[]; output_text?: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Falta OPENAI_API_KEY");
  const r = await fetch(`${BASE()}/responses`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO(), store: false, ...cuerpo }),
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

export const textoDe = (j: { output?: Salida[]; output_text?: string }) =>
  j.output_text ?? (j.output ?? []).flatMap((o) => (o.type === "message" ? (o.content ?? []).map((c) => (c.type === "output_text" ? c.text ?? "" : "")) : [])).join("");

/** Pide una respuesta en JSON con un esquema fijo. `imagen` (URL) es opcional. */
export async function jsonIA<T>(p: { instrucciones: string; pedido: string; esquema: Record<string, unknown>; imagen?: string; esfuerzo?: "low" | "medium" | "high"; max?: number }): Promise<T> {
  const contenido: unknown[] = [{ type: "input_text", text: p.pedido }];
  if (p.imagen) contenido.push({ type: "input_image", image_url: p.imagen, detail: "low" });
  const j = await responses({
    instructions: p.instrucciones,
    input: [{ role: "user", content: contenido }],
    reasoning: { effort: p.esfuerzo ?? "low" },
    max_output_tokens: p.max ?? 2500,
    text: { format: { type: "json_schema", name: "respuesta", schema: p.esquema, strict: true } },
  });
  const t = textoDe(j);
  try { return JSON.parse(t) as T; } catch { throw new Error("La IA no devolvió un formato claro."); }
}
