// Sesión del panel: una cookie firmada con HMAC. Funciona en el middleware (edge) y en rutas de Node.
export const COOKIE = "eu_panel";
const DIAS = 90;
const enc = new TextEncoder();

async function llave() {
  const secreto = process.env.SESSION_SECRET || `eu:${process.env.ADMIN_PASSWORD ?? ""}`;
  return crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function firmar(): Promise<{ valor: string; maxAge: number }> {
  const exp = Date.now() + DIAS * 864e5;
  const sig = hex(await crypto.subtle.sign("HMAC", await llave(), enc.encode(String(exp))));
  return { valor: `${exp}.${sig}`, maxAge: DIAS * 86400 };
}

export async function valida(valor: string | undefined): Promise<boolean> {
  if (!valor) return false;
  const [exp, sig] = valor.split(".");
  if (!exp || !sig || Number(exp) < Date.now() || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const bytes = new Uint8Array(sig.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", await llave(), bytes, enc.encode(exp));
}

/** El panel queda protegido apenas existe ADMIN_PASSWORD en Vercel. Sin ella, corre en modo de prueba. */
export const protegido = () => Boolean(process.env.ADMIN_PASSWORD);
