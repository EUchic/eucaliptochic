import { NextResponse } from "next/server";
import { ErrorBase, subirFoto } from "@/lib/db";
import { ErrorMeta, hayMeta, publicar } from "@/lib/meta";
import { no, permitido } from "@/lib/panel";

// Publica una foto en el Instagram de la marca (feed o historia). Solo con confirmo=si, que manda el botón
// "Sí, publicar" de Andrea. La foto llega en JPEG (Instagram solo acepta JPEG), se guarda en Storage y se publica.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hechas = new Map<string, { id: string; permalink?: string }>();

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  if (!hayMeta()) return no("Falta conectar Instagram.", 503);
  let f: FormData;
  try { f = await req.formData(); } catch { return no("No llegó la foto.", 400); }
  if (f.get("confirmo") !== "si") return no("Falta tu confirmación. No se publicó nada.", 400);
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) return no("No entendí.", 400);
  if (hechas.has(id)) return NextResponse.json({ ok: true, ...hechas.get(id) });
  const que = f.get("que") === "story" ? "story" : "post";
  const caption = String(f.get("caption") ?? "").replace(/\u0000/g, "").slice(0, 2200);
  const foto = f.get("foto");
  if (!(foto instanceof Blob) || foto.size < 2000 || foto.size > 8 * 1024 * 1024) return no("La foto no se ve bien.", 400);
  const datos = new Uint8Array(await foto.arrayBuffer());
  if (!(datos[0] === 0xff && datos[1] === 0xd8)) return no("La foto tiene que ser JPEG.", 415);

  try {
    const url = await subirFoto(`instagram/${id}.jpg`, datos.buffer as ArrayBuffer, "image/jpeg");
    const r = await publicar({ imagen: url, caption, que });
    hechas.set(id, r);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const m = e instanceof ErrorMeta || e instanceof ErrorBase ? e.message : "No pude publicar.";
    const permiso = /permission|permiso|(#10)|(#200)/i.test(m);
    return no(permiso ? "La conexión con Instagram todavía no tiene permiso para publicar. Hay que darle el permiso «instagram_content_publish» al token en Meta." : `Instagram no aceptó la publicación: ${m}`, 502);
  }
}
