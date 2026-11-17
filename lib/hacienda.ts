/** Tipo de cambio oficial del dólar (API pública del Ministerio de Hacienda). Se guarda en caché una hora. */
export async function tipoCambioHacienda(): Promise<{ compra: number; venta: number; fecha: string } | null> {
  try {
    const r = await fetch("https://api.hacienda.go.cr/indicadores/tc/dolar", { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { venta?: { fecha: string; valor: number }; compra?: { fecha: string; valor: number } };
    if (!j.venta?.valor || !j.compra?.valor) return null;
    return { compra: j.compra.valor, venta: j.venta.valor, fecha: j.venta.fecha };
  } catch {
    return null;
  }
}
