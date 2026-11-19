import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, protegido, valida } from "./lib/sesion";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin/entrar") || pathname.startsWith("/api/entrar")) return NextResponse.next();
  if (!protegido()) {
    // Sin contraseña configurada, la IA no se puede usar: así nadie gasta los créditos de OpenAI desde afuera.
    if ((pathname.startsWith("/api/asistente") || pathname.startsWith("/api/voz") || pathname.startsWith("/api/plata")) && process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Falta ADMIN_PASSWORD en Vercel." }, { status: 403 });
    }
    return NextResponse.next();
  }
  if (await valida(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Entrá de nuevo al panel." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/admin/entrar";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*", "/api/asistente/:path*", "/api/acciones/:path*", "/api/fotos/:path*", "/api/anuncios/:path*", "/api/lugares/:path*", "/api/voz/:path*", "/api/plata/:path*"] };
