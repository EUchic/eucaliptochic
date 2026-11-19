import { no, permitido } from "@/lib/panel";

// La voz del asistente: convierte la respuesta en audio con una voz natural de OpenAI.
// Sin OPENAI_API_KEY responde 501 y el panel se queda en silencio (o usa la voz del teléfono si es buena).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const INSTRUCCIONES =
  "Sos una mujer costarricense cálida y de confianza que le ayuda a Andrea con su negocio. " +
  "Hablá en español latinoamericano con acento suave y cercano de Costa Rica, con voseo natural. " +
  "Tono tranquilo, amable y seguro, como una amiga profesional que le quita las preocupaciones; sonreí al hablar. " +
  "Ritmo pausado y natural, con pausas cortas entre ideas. Nada robótico ni de locutora.";

/** Montos y abreviaturas como se dicen en voz alta. */
function paraDecir(t: string) {
  return t
    .replace(/−?₡\s?(\d{1,3}(?:[\s., ]\d{3})+|\d+)/g, (m, n: string) => {
      const v = Number(n.replace(/\D/g, ""));
      const signo = m.startsWith("−") ? "menos " : "";
      if (v >= 1_000_000 && v % 1000 === 0) return `${signo}${(v / 1_000_000).toLocaleString("es-CR")} ${v === 1_000_000 ? "millón" : "millones"} de colones`;
      if (v >= 1000 && v % 1000 === 0) return `${signo}${v / 1000} mil colones`;
      return `${signo}${v} colones`;
    })
    .replace(/\bIVA\b/g, "i va")
    .replace(/\bSINPE\b/gi, "simpe")
    .slice(0, 1200);
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return no("La voz se activa con OpenAI.", 501);
  const b = (await req.json().catch(() => null)) as { texto?: string } | null;
  const texto = paraDecir(String(b?.texto ?? "").trim());
  if (!texto) return no("No hay nada que decir.", 400);

  const voces = [...new Set([process.env.OPENAI_VOICE || "marin", "coral"])];
  for (const voice of voces) {
    const r = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/audio/speech`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice, input: texto, instructions: INSTRUCCIONES, response_format: "mp3" }),
      signal: AbortSignal.timeout(25_000),
    }).catch(() => null);
    if (r?.ok && r.body) return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
    if (r && r.status !== 400 && r.status !== 404) break;
  }
  return no("No pude generar la voz.", 502);
}
