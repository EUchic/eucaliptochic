import { NextResponse } from "next/server";
import { img } from "@/lib/catalog";
import { borrarPropuestasViejas, guardarAccion, marcarBase, piezaConFotos, subirFoto } from "@/lib/db";
import { no, permitido, refrescarTienda } from "@/lib/panel";
import { idSeguro } from "@/lib/validar";

// Foto de producto hecha con IA a partir de las fotos que ya tiene la pieza. Queda como "propuesta":
// no sale en la tienda hasta que Andrea la aprueba en el panel.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ESTILO = process.env.ESTILO_FOTOS ||
  "Background: seamless very pale sage-green studio backdrop (#E7EEE9) with a soft floor shadow. " +
  "Model: an elegant Latina woman in her late 30s with a natural, warm look, light makeup, hair neatly styled, relaxed confident pose, standing, full outfit visible from head to knees or feet. " +
  "Neutral, minimal styling: plain shoes and no extra accessories unless they appear in the reference photos.";

const pedidoDe = (p: { nombre: string; tipo: string; descripcion: string | null }) => [
  "Create a professional e-commerce studio product photo for the online boutique Eucalipto Chic (women's clothing, designed in Costa Rica).",
  `The product is "${p.nombre}" (${p.tipo}).${p.descripcion ? " Description: " + p.descripcion.slice(0, 300) : ""}`,
  "The reference photo shows the real garment. Reproduce it EXACTLY: same color and shade, cut, silhouette, length, neckline, sleeves, print, fabric texture and drape, buttons, ties and every detail. Do not redesign it and do not change its color.",
  "Recreate the same outfit styling as in the reference photo (the same top and bottom pieces and the same belt if there is one), so a customer sees exactly what she would buy.",
  "Show it worn by a model. " + ESTILO,
  "Lighting: soft, even, diffused studio light; true-to-life colors; sharp focus on the fabric. Vertical 2:3 framing with the garment centered and fully visible.",
  "Photorealistic. No text, no logos, no watermarks, no borders.",
].join(" ");

/**
 * Para corregir una foto que salió con un error. Las imágenes van en este orden:
 * 1) la foto original de la prenda, 2) el intento anterior de la IA (si hay), 3+) las fotos que subió Andrea.
 */
const correccionDe = (p: { nombre: string; tipo: string; descripcion: string | null }, texto: string, conIntento: boolean, suyas: number) => {
  let n = 1;
  const orden = [`Image ${n++} is the ORIGINAL photo of the real garment.`];
  if (conIntento) orden.push(`Image ${n++} is a previous AI product photo of it that has a mistake.`);
  if (suyas) orden.push(`${suyas > 1 ? `Images ${n} to ${n + suyas - 1} are` : `Image ${n} is an`} extra photo${suyas > 1 ? "s" : ""} taken by the shop owner showing how the real garment ACTUALLY looks (often a close-up of the part that came out wrong). Treat them as the ground truth for color, shape and details.`);
  return [
    `Professional e-commerce studio product photo for the boutique Eucalipto Chic. The product is "${p.nombre}" (${p.tipo}).${p.descripcion ? " Description: " + p.descripcion.slice(0, 300) : ""}`,
    ...orden,
    conIntento
      ? `Create a corrected version of image 2: keep the same model, pose, framing, background and lighting, but make the garment match the real one exactly${suyas ? " as shown in the owner's photos and the original photo" : " as shown in the original photo"}.`
      : "Show the garment worn by a model. " + ESTILO,
    texto ? `The shop owner says what is wrong (in Spanish): «${texto}». Fix exactly that.` : "Fix every difference between the garment and the owner's photos.",
    "Reproduce the real garment EXACTLY: same color and shade, cut, length, neckline, sleeves, print, fabric texture, buttons, ties and every detail. Do not invent details.",
    "Soft, even studio light; true-to-life colors. Vertical 2:3 framing. Photorealistic. No text, no logos, no watermarks, no borders.",
  ].join(" ");
};

const MAX_REF = 4 * 1024 * 1024;
function tipoFoto(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const t = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  return t(0, 4) === "RIFF" && t(8, 4) === "WEBP" ? "image/webp" : null;
}

async function bajar(url: string, origen: string) {
  const u = url.startsWith("/") ? origen + img(url, 1600) : img(url, 1600);
  const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`No pude bajar la foto ${u} (${r.status})`);
  const b = new Uint8Array(await r.arrayBuffer());
  const tipo = r.headers.get("content-type")?.split(";")[0] || "image/webp";
  return new Blob([b], { type: tipo });
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return no("Las fotos con IA se activan con OpenAI.", 501);
  // JSON (foto nueva) o multipart (rehacer con las fotos de referencia de Andrea).
  let b: { slug?: string; calidad?: string; correccion?: string } | null = null;
  const suyas: Blob[] = [];
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const f = await req.formData().catch(() => null);
    if (!f) return no("No llegó la información.", 400);
    b = { slug: String(f.get("slug") ?? ""), correccion: String(f.get("correccion") ?? "") };
    for (const x of f.getAll("referencia").slice(0, 3)) {
      if (!(x instanceof Blob) || x.size > MAX_REF) return no("Una de las fotos es muy pesada.", 413);
      const bytes = new Uint8Array(await x.arrayBuffer());
      const tipo = tipoFoto(bytes.slice(0, 16));
      if (!tipo) return no("Eso no parece una foto.", 415);
      suyas.push(new Blob([bytes], { type: tipo }));
    }
  } else b = (await req.json().catch(() => null)) as typeof b;
  const correccion = String(b?.correccion ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 400);
  const corrigiendo = !!correccion || suyas.length > 0;
  const slug = String(b?.slug ?? "");
  if (!/^[a-z0-9-]{1,140}$/.test(slug)) return no("No encontré esa pieza.", 400);
  const p = await piezaConFotos(slug);
  if (!p) return no("No encontré esa pieza.", 404);
  if (!p.fotos.length) return no(`${p.nombre} no tiene fotos para tomar de referencia.`, 409);

  try {
    const origen = new URL(req.url).origin;
    // Solo la portada original: con varias fotos la IA mezclaba colores de prendas distintas.
    const refs = [await bajar(p.fotos[0], origen)];
    const intento = corrigiendo && p.intento ? await bajar(p.intento, origen).catch(() => null) : null;
    if (intento) refs.push(intento);
    refs.push(...suyas);
    const fd = new FormData();
    fd.set("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst");
    fd.set("prompt", corrigiendo ? correccionDe(p, correccion, !!intento, suyas.length) : pedidoDe(p));
    refs.forEach((r, i) => fd.append("image[]", r, `ref${i}.${r.type.split("/")[1] || "webp"}`));
    fd.set("size", "1024x1536");
    fd.set("quality", b?.calidad === "medium" ? "medium" : "high");
    fd.set("output_format", "webp");
    fd.set("output_compression", "88");
    const r = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/images/edits`, {
      method: "POST", headers: { authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(240_000),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { data?: { b64_json?: string }[] };
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI no devolvió imagen");
    const grande = Buffer.from(b64, "base64");
    let chica: Buffer = grande;
    try {
      const sharp = (await import("sharp")).default;
      chica = await sharp(grande).resize({ width: 534 }).webp({ quality: 84 }).toBuffer();
    } catch {}
    const id = idSeguro(`estudio-${slug}-${Date.now()}`);
    const url = await subirFoto(`ia/${slug}/${id}-1600.webp`, new Uint8Array(grande).buffer as ArrayBuffer, "image/webp");
    await subirFoto(`ia/${slug}/${id}-800.webp`, new Uint8Array(chica).buffer as ArrayBuffer, "image/webp");
    await guardarAccion({ id, tipo: "foto_propuesta", slug, url });
    if (p.base) await marcarBase(id, p.base).catch(() => {});
    await borrarPropuestasViejas(p.id, id).catch(() => {});
    try { refrescarTienda(); } catch {}
    return NextResponse.json({ ok: true, slug, url, id });
  } catch (e) {
    console.error("[estudio]", slug, (e as Error).message);
    return no("No se pudo hacer la foto de esta pieza. " + (e as Error).message.slice(0, 160), 502);
  }
}
