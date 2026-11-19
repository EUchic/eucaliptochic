"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { Mark } from "@/components/Logo";

export default function Entrar() {
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  return (
    <main className="pn-entrar">
      <div className="pn-entrar-caja">
        <span className="pn-entrar-logo"><Mark part="full" /></span>
        <h1>Hola, Andrea</h1>
        <p>Escribí tu clave para entrar a tu panel.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setCargando(true); setError("");
            try {
              const r = await fetch("/api/entrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave }) });
              if (r.ok) { location.href = "/admin"; return; }
              setError((await r.json().catch(() => ({}))).error ?? "No se pudo entrar.");
            } catch { setError("No hay internet. Probá de nuevo."); }
            setCargando(false);
          }}
        >
          <label className="pn-clave">
            <span className="pn-oculto">Clave</span>
            <input type={ver ? "text" : "password"} autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Tu clave" autoCapitalize="none" autoCorrect="off" />
            <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Esconder la clave" : "Ver la clave"}><Icon n="ojo" s={24} /></button>
          </label>
          {error && <p className="pn-alerta" role="alert">{error}</p>}
          <button className="pn-btn is-grande" disabled={cargando || !clave}>{cargando ? "Entrando…" : "Entrar"}</button>
        </form>
        <small>Este teléfono queda con la sesión abierta por 3 meses.</small>
      </div>
    </main>
  );
}
