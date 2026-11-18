// Ayudas para mostrar una feria en la página: fecha bonita y links para llegar con Waze o Google Maps.

export type FeriaVista = { nombre: string; fecha: string; lugar: string | null; direccion: string | null; lat: number | null; lng: number | null; foto: string | null };

/** Links de "cómo llegar". Con coordenadas son exactos; si solo hay nombre del lugar, la app lo busca. */
export function comoLlegar(f: FeriaVista): { waze: string; google: string } | null {
  if (f.lat != null && f.lng != null) {
    const ll = `${f.lat},${f.lng}`;
    return {
      waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
      google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    };
  }
  const q = [f.lugar, f.direccion].filter(Boolean).join(", ");
  if (!q) return null;
  return {
    waze: `https://waze.com/ul?q=${encodeURIComponent(q + ", Costa Rica")}&navigate=yes`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q + ", Costa Rica")}`,
  };
}

const hoyCR = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);

/** "Sábado 22 de noviembre" */
export function fechaFeria(f: string) {
  const [y, m, d] = f.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(",", "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Hoy", "Mañana", "En 5 días" o "" si falta más de una semana. */
export function cuandoFeria(f: string) {
  const dias = Math.round((Date.parse(f + "T12:00:00Z") - Date.parse(hoyCR() + "T12:00:00Z")) / 864e5);
  return dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : dias > 1 && dias <= 7 ? `En ${dias} días` : "";
}
