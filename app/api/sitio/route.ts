import { NextResponse } from "next/server";
import { URL_BASE, ajustes, subirFoto, type Sitio } from "@/lib/db";
import { no, permitido, refrescarTienda } from "@/lib/panel";

// Fotos de la página que Andrea cambia desde el panel (por ahora: la foto grande del inicio, "Ropa cómoda…").
// Puede subir una foto nueva o escoger una foto de una pieza; también el encuadre (arriba, centro, abajo).

export const dynamic = "force-dynamic";

const LUGARES = ["ventana"] as const;
const POS = ["arriba", "centro", "abajo"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DE_LA_TIENDA = `${URL_BASE}/storage/v1/object/public/fotos/`;
const nuestra = (u: string) =>
  (u.startsWith(DE_LA_TIENDA) && /^[A-Za-z0-9/_.-]+\.(webp|jpg|jpeg|png)$/.test(u.slice(DE_LA_TIENDA.length)))
  || /^https:\/\/images\.squarespace-cdn\.com\/[A-Za-z0-9/_.%+-]+$/.test(u)
  || /^\/fotos\/[a-z0-9-]+$/.test(u);
const MAX = 4 * 1024 * 1024;

function tipoReal(b: Uint8Array): "webp" | "jpg" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  const txt = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  return txt(0, 4) === "RIFF" && txt(8, 4) === "WEBP" ? "webp" : null;
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  const multipart = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  let lugar = "", pos = "centro", url = "", quitar = false;

  try {
    if (multipart) {
      const f = await req.formData();
      lugar = String(f.get("lugar") ?? ""); pos = String(f.get("pos") ?? "centro");
      const id = String(f.get("id") ?? "").toLowerCase();
      const grande = f.get("grande"), chica = f.get("chica");
      if (!UUID.test(id) || !(grande instanceof Blob) || !(chica instanceof Blob)) return no("No llegó la foto.", 400);
      if (grande.size > MAX || chica.size > MAX) return no("La foto es muy pesada.", 413);
      const [g, c] = await Promise.all([grande.arrayBuffer(), chica.arrayBuffer()]);
      const ext = tipoReal(new Uint8Array(g, 0, 16));
      if (!ext || tipoReal(new Uint8Array(c, 0, 16)) !== ext) return no("Eso no parece una foto.", 415);
      const mime = ext === "webp" ? "image/webp" : "image/jpeg";
      url = await subirFoto(`sitio/${lugar}/${id}-1600.${ext}`, g, mime);
      await subirFoto(`sitio/${lugar}/${id}-800.${ext}`, c, mime);
    } else {
      const b = (await req.json().catch(() => ({}))) as { lugar?: string; base?: string; pos?: string; quitar?: boolean };
      lugar = String(b.lugar ?? ""); pos = String(b.pos ?? "centro"); quitar = b.quitar === true;
      url = String(b.base ?? "");
    }
    if (!LUGARES.includes(lugar as never)) return no("Ese lugar de la página no existe.", 400);
    if (!POS.includes(pos as never)) pos = "centro";

    const actual = ((await ajustes.leer<Sitio>("panel_sitio")) ?? {}) as Record<string, unknown>;
    if (quitar) delete actual[lugar];
    else if (url) {
      if (!nuestra(url)) return no("Esa foto no es de la tienda.", 400);
      actual[lugar] = { url, pos };
    } else if (actual[lugar]) {
      actual[lugar] = { ...(actual[lugar] as object), pos }; // solo cambia el encuadre
    } else return no("Falta la foto.", 400);

    await ajustes.guardar("panel_sitio", actual);
    refrescarTienda();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sitio]", (e as Error).message);
    return no("No se pudo cambiar la foto. Probá de nuevo.", 502);
  }
}
