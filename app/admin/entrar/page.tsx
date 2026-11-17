"use client";

import { useState } from "react";
import { Lockup } from "@/components/Logo";

export default function Entrar() {
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  return (
    <main className="ad-entrar">
      <Lockup className="ad-entrar-logo" />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setCargando(true); setError("");
          const r = await fetch("/api/entrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave }) });
          if (r.ok) location.href = "/admin";
          else { setError((await r.json().catch(() => ({}))).error ?? "No se pudo entrar."); setCargando(false); }
        }}
      >
        <h1>Hola, Andrea</h1>
        <label>Tu clave<input type="password" autoComplete="current-password" autoFocus value={clave} onChange={(e) => setClave(e.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <button className="btn btn-full" disabled={cargando || !clave}>{cargando ? "Entrando…" : "Entrar"}</button>
        <small>Este teléfono queda con la sesión abierta por 3 meses.</small>
      </form>
    </main>
  );
}
