import { NextResponse } from "next/server";
import { ErrorBase, estadoPanel, guardarAccion, subirFoto } from "@/lib/db";
import { no, permitido, refrescarTienda } from "@/lib/panel";

// Andrea sube una foto desde el teléfono. El navegador ya la achicó a dos tamaños (800 y 1600 px).
// Aquí se revisa que de verdad sea una imagen, se sube a Supabase Storage y queda de primera en la pieza.

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX = 4 * 1024 * 1024;

function tipoReal(b: Uint8Array): "webp" | "jpg" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  const txt = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (txt(0, 4) === "RIFF" && txt(8, 4) === "WEBP") return "webp";
  return null;
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  if (Number(req.headers.get("content-length") ?? 0) > 2 * MAX + 50_000) return no("La foto es muy pesada.", 413);

  let form: FormData;
  try { form = await req.formData(); } catch { return no("No llegó la foto.", 400); }
  const id = String(form.get("id") ?? "").toLowerCase();
  const slug = String(form.get("slug") ?? "");
  const grande = form.get("grande");
  const chica = form.get("chica");
  if (!UUID.test(id) || !SLUG.test(slug) || slug.length > 140) return no("No encontré esa pieza.", 400);
  if (!(grande instanceof Blob) || !(chica instanceof Blob)) return no("No llegó la foto.", 400);
  if (grande.size > MAX || chica.size > MAX || !grande.size || !chica.size) return no("La foto es muy pesada.", 413);

  const [g, c] = await Promise.all([grande.arrayBuffer(), chica.arrayBuffer()]);
  const ext = tipoReal(new Uint8Array(g, 0, 16));
  if (!ext || tipoReal(new Uint8Array(c, 0, 16)) !== ext) return no("Eso no parece una foto. Probá con otra.", 415);
  const mime = ext === "webp" ? "image/webp" : "image/jpeg";

  try {
    const url = await subirFoto(`${slug}/${id}-1600.${ext}`, g, mime);
    await subirFoto(`${slug}/${id}-800.${ext}`, c, mime);
    await guardarAccion({ id, tipo: "foto_nueva", slug, url });
  } catch (e) {
    console.error("[fotos]", (e as Error).message);
    return no(e instanceof ErrorBase && /No encontré/.test(e.message) ? "No encontré esa pieza." : "No se pudo subir la foto. Probá de nuevo.", 502);
  }
  refrescarTienda();
  try {
    return NextResponse.json({ ok: true, estado: await estadoPanel() });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
