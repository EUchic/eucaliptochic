import { NextResponse } from "next/server";
import { no, permitido } from "@/lib/panel";

// Convierte en texto lo que Andrea le dice al micrófono del panel (OpenAI, modelo de transcripción).
// GET dice si está listo (hay llave); POST recibe el audio y devuelve { texto }.
// Sin OPENAI_API_KEY responde 501 y el panel usa el dictado del teléfono.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX = 4 * 1024 * 1024; // Vercel recibe hasta 4,5 MB; un minuto de voz pesa mucho menos.
const BASE = () => process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const CONTEXTO =
  "Andrea, dueña de Eucalipto Chic (marca de ropa de mujer en Costa Rica), le habla a su asistente en español de Costa Rica " +
  "sobre ventas, gastos en colones (mil, rojos, tejas), SINPE, efectivo, tarjeta, telas, la costurera Juanita, ferias, piezas de ropa, colecciones y anuncios de Instagram.";
const FIJAS = ["Eucalipto Chic", "SINPE", "colones", "Juanita", "Instagram", "ONVO"];

function formato(b: Uint8Array): { ext: string; mime: string } | null {
  const txt = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: "webm", mime: "audio/webm" };
  if (txt(4, 4) === "ftyp") return { ext: "mp4", mime: "audio/mp4" };
  if (txt(0, 4) === "OggS") return { ext: "ogg", mime: "audio/ogg" };
  if (txt(0, 4) === "RIFF" && txt(8, 4) === "WAVE") return { ext: "wav", mime: "audio/wav" };
  if (txt(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg" };
  return null;
}

const limpias = (x: unknown, n: number) =>
  (Array.isArray(x) ? x : [])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.replace(/\s+/g, " ").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, n);

export async function GET(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  return NextResponse.json({ listo: !!process.env.OPENAI_API_KEY }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return no("Para entender audios falta conectar OpenAI.", 501);

  let form: FormData;
  try { form = await req.formData(); } catch { return no("No llegó el audio.", 400); }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size < 800) return no("No llegó el audio.", 400);
  if (audio.size > MAX) return no("El audio quedó muy largo. Probá en partes.", 413);
  const datos = new Uint8Array(await audio.arrayBuffer());
  const tipo = formato(datos.subarray(0, 16));
  if (!tipo) return no("Ese audio no se pudo leer.", 415);

  let pistas: { nombres?: unknown; piezas?: unknown } = {};
  try { pistas = JSON.parse(String(form.get("pistas") ?? "{}")); } catch {}
  const nombres = limpias(pistas.nombres, 20);
  const piezas = limpias(pistas.piezas, 40);
  const prompt = CONTEXTO + (piezas.length ? ` Algunas piezas: ${piezas.join(", ")}.` : "");
  const keywords = [...new Set([...FIJAS, ...nombres])].slice(0, 24);

  const pedir = (model: string, completo: boolean) => {
    const f = new FormData();
    f.append("file", new File([datos], `voz.${tipo.ext}`, { type: tipo.mime }));
    f.append("model", model);
    f.append("prompt", prompt.slice(0, 1200));
    f.append("response_format", "json");
    if (completo) {
      f.append("languages[]", "es");
      for (const k of keywords) f.append("keywords[]", k);
    } else {
      f.append("language", "es");
    }
    return fetch(`${BASE()}/audio/transcriptions`, {
      method: "POST", headers: { authorization: `Bearer ${key}` }, body: f, signal: AbortSignal.timeout(45_000),
    });
  };

  // Primero el modelo nuevo con pistas; si no acepta algo, sin pistas; si el modelo no existe, el anterior.
  const modelos = [...new Set([process.env.OPENAI_STT_MODEL || "gpt-transcribe", "gpt-4o-mini-transcribe"])];
  let ultimo = "";
  for (const modelo of modelos) {
    for (const completo of [true, false]) {
      try {
        const r = await pedir(modelo, completo);
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          const texto = typeof j?.text === "string" ? j.text.replace(/\s+/g, " ").trim() : "";
          return NextResponse.json({ texto });
        }
        ultimo = `${r.status} ${(await r.text().catch(() => "")).slice(0, 300)}`;
        if (r.status === 401 || r.status === 429) return no(r.status === 401 ? "La llave de OpenAI no sirve." : "OpenAI está ocupado o sin saldo. Probá en un rato.", 502);
        if (r.status !== 400 && r.status !== 404 && r.status !== 422) break;
      } catch (e) {
        ultimo = String(e);
        break;
      }
    }
  }
  console.error("voz: OpenAI no transcribió", ultimo);
  return no("No pude entender el audio. Probá de nuevo.", 502);
}
