import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { COOKIE, firmar } from "@/lib/sesion";

const h = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  const real = process.env.ADMIN_PASSWORD;
  const { clave } = (await req.json().catch(() => ({}))) as { clave?: string };
  await new Promise((r) => setTimeout(r, 600)); // frena a quien intente adivinar
  if (!real || typeof clave !== "string" || !timingSafeEqual(h(clave.trim()), h(real))) {
    return NextResponse.json({ error: "Esa no es la clave. Probá de nuevo." }, { status: 401 });
  }
  const { valor, maxAge } = await firmar();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, valor, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
