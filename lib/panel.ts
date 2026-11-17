import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { hayBase } from "./db";
import { COOKIE, protegido, valida } from "./sesion";

export const no = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Candado de las rutas que guardan: clave puesta, base conectada, sesión válida y mismo sitio. */
export async function permitido(req: Request) {
  if (!protegido()) return no("Falta ponerle clave al panel (ADMIN_PASSWORD en Vercel).", 403);
  if (!hayBase()) return no("Falta conectar la base de datos (SUPABASE_SECRET_KEY en Vercel).", 503);
  if (!(await valida((await cookies()).get(COOKIE)?.value))) return no("Entrá de nuevo al panel.", 401);
  const origen = req.headers.get("origin");
  if (origen && new URL(origen).host !== req.headers.get("host")) return no("Origen no permitido.", 403);
  return null;
}

/** La tienda vuelve a leer la base en la próxima visita. */
export function refrescarTienda() {
  revalidateTag("catalogo");
  revalidatePath("/", "layout");
}
