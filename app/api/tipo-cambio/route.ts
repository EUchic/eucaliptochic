import { NextResponse } from "next/server";
import { tipoCambioHacienda } from "@/lib/hacienda";

export const revalidate = 3600;

export async function GET() {
  const tc = await tipoCambioHacienda();
  return tc ? NextResponse.json(tc) : NextResponse.json({ error: "Hacienda no respondió." }, { status: 503 });
}
