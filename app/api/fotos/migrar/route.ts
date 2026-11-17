import { NextResponse } from "next/server";
import { fotoMudada, fotosEnSquarespace, fotosPorMudar, subirFoto } from "@/lib/db";
import { permitido, refrescarTienda } from "@/lib/panel";

// Copia las fotos viejas (CDN de Squarespace) al bucket "fotos" de Andrea, de a pocas por llamada.
// Cada foto se baja en dos tamaños, se revisa que sea imagen de verdad y recién ahí se cambia en la base.
// Repetirlo es seguro: lo que ya se mudó no se vuelve a tocar.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOST = process.env.FOTOS_VIEJAS_HOST || "images.squarespace-cdn.com";
const MAX = 4 * 1024 * 1024;
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
type Ext = keyof typeof MIME;

function tipo(b: Uint8Array): Ext | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  const t = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (t(0, 4) === "RIFF" && t(8, 4) === "WEBP") return "webp";
  return null;
}

async function bajar(url: string, ancho: number) {
  const r = await fetch(`${url}?format=${ancho}w`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Squarespace respondió ${r.status}`);
  const datos = await r.arrayBuffer();
  if (!datos.byteLength || datos.byteLength > MAX) throw new Error("tamaño raro");
  const ext = tipo(new Uint8Array(datos, 0, Math.min(16, datos.byteLength)));
  if (!ext) throw new Error("no es una imagen");
  return { datos, ext };
}

export async function GET(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  return NextResponse.json({ faltan: await fotosPorMudar() });
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;

  const inicio = Date.now();
  const fallaron = new Set<string>();
  let hechas = 0;
  while (Date.now() - inicio < 40_000) {
    const lote = (await fotosEnSquarespace(Math.min(20, fallaron.size + 4))).filter((f) => !fallaron.has(f.id)).slice(0, 4);
    if (!lote.length) break;
    await Promise.all(lote.map(async (f) => {
      try {
        if (new URL(f.url).host !== HOST) throw new Error("no viene de Squarespace");
        const grande = await bajar(f.url, 1500);
        let chica = await bajar(f.url, 750);
        if (chica.ext !== grande.ext) chica = grande; // las dos tienen que tener la misma extensión
        const base = `sq/${f.slug}/${f.id}`;
        const url = await subirFoto(`${base}-1600.${grande.ext}`, grande.datos, MIME[grande.ext]);
        await subirFoto(`${base}-800.${grande.ext}`, chica.datos, MIME[grande.ext]);
        if (await fotoMudada(f.id, url)) hechas++;
      } catch (e) {
        console.error("[mudanza]", f.id, (e as Error).message);
        fallaron.add(f.id);
      }
    }));
  }
  if (hechas) refrescarTienda();
  return NextResponse.json({ hechas, fallaron: fallaron.size, faltan: await fotosPorMudar() });
}
