"use client";
import { useEffect, useState } from "react";

// Pasa las fotos viejas de Squarespace al almacenamiento de Andrea. Se puede cerrar y volver a abrir: sigue donde quedó.
export default function Mudanza() {
  const [faltan, setFaltan] = useState<number | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    fetch("/api/fotos/migrar").then(async (r) => {
      if (r.status === 401) { location.href = "/admin/entrar"; return; }
      const j = await r.json();
      if (!r.ok) setAviso(j.error ?? "No se pudo revisar.");
      else setFaltan(j.faltan);
    }).catch(() => setAviso("No hay internet."));
  }, []);

  async function mudar() {
    setCorriendo(true); setAviso("");
    try {
      for (;;) {
        const r = await fetch("/api/fotos/migrar", { method: "POST" });
        if (r.status === 401) { location.href = "/admin/entrar"; return; }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Algo falló.");
        setFaltan(j.faltan);
        if (j.faltan === 0) { setAviso("Listo: todas las fotos ya están en el almacenamiento de Andrea."); break; }
        if (j.hechas === 0) { setAviso(`Quedaron ${j.faltan} fotos que Squarespace no entregó. Avisale a Claude.`); break; }
      }
    } catch (e) {
      setAviso((e as Error).message === "Failed to fetch" ? "Se cortó el internet. Tocá el botón otra vez: sigue donde quedó." : (e as Error).message);
    } finally {
      setCorriendo(false);
    }
  }

  return (
    <section>
      <h2>Fotos de Squarespace</h2>
      <p className="ad-mant-num">{faltan === null ? "Revisando…" : faltan === 0 ? "Ninguna pendiente" : `Faltan ${faltan}`}</p>
      {faltan !== 0 && <button className="btn" disabled={corriendo || faltan === null} onClick={mudar}>{corriendo ? "Pasando fotos…" : "Pasar fotos"}</button>}
      {aviso && <p role="status">{aviso}</p>}
    </section>
  );
}
