import { NextResponse } from "next/server";
import { no, permitido } from "@/lib/panel";

// Mejora una foto de una pieza con OpenAI (edición de imagen). Devuelve la foto mejorada para que Andrea
// la compare con la original; no guarda nada: si le gusta, el panel la sube como cualquier otra foto.
// Sin OPENAI_API_KEY responde 501 y el panel le ofrece subir la original.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX = 4 * 1024 * 1024;
const INSTRUCCION = [
  "Retouch this clothing product photo for an online boutique, like a professional product photographer would.",
  "Keep the garment EXACTLY the same: same cut, length, color, print, fabric texture, buttons and details. Keep the person (if any) and their pose the same.",
  "Improve only: even, soft natural light; true-to-life colors and white balance; sharpness; remove small distractions; a clean, tidy, softly blurred or neutral background.",
  "No text, no logos, no watermarks, no added accessories. Photorealistic.",
].join(" ");

function tipoReal(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const txt = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (txt(0, 4) === "RIFF" && txt(8, 4) === "WEBP") return "image/webp";
  return null;
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return no("La mejora con IA se activa al conectar OpenAI.", 501);

  let form: FormData;
  try { form = await req.formData(); } catch { return no("No llegó la foto.", 400); }
  const imagen = form.get("imagen");
  if (!(imagen instanceof Blob) || !imagen.size) return no("No llegó la foto.", 400);
  if (imagen.size > MAX) return no("La foto es muy pesada.", 413);
  const datos = new Uint8Array(await imagen.arrayBuffer());
  const mime = tipoReal(datos.subarray(0, 16));
  if (!mime) return no("Eso no parece una foto. Probá con otra.", 415);

  const pedir = async (extras: boolean) => {
    const fd = new FormData();
    fd.set("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst");
    fd.set("prompt", INSTRUCCION);
    fd.append("image[]", new Blob([datos], { type: mime }), "foto." + mime.split("/")[1]);
    if (extras) { fd.set("output_format", "webp"); fd.set("output_compression", "86"); fd.set("quality", "high"); }
    return fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/images/edits`, {
      method: "POST", headers: { authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(110_000),
    });
  };

  try {
    let r = await pedir(true);
    // Si el modelo no acepta algún ajuste opcional, se intenta una vez con lo básico.
    if (r.status === 400) r = await pedir(false);
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { data?: { b64_json?: string }[]; output_format?: string };
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI no devolvió imagen");
    const formato = j.output_format || (b64.startsWith("UklGR") ? "webp" : b64.startsWith("/9j/") ? "jpeg" : "png");
    return NextResponse.json({ imagen: `data:image/${formato};base64,${b64}` });
  } catch (e) {
    console.error("[mejorar]", e instanceof Error ? e.message : e);
    return no("No se pudo mejorar la foto ahora. Probá de nuevo en un rato, o usá la original.", 502);
  }
}
