import type { Metadata } from "next";
import Mudanza from "@/components/Mudanza";

export const metadata: Metadata = { title: "Mantenimiento", robots: { index: false, follow: false } };

// Página para Mateo (no está en el menú de Andrea). Protegida por la misma sesión del panel.
export default function Page() {
  return (
    <main className="ad-entrar">
      <div className="ad-mant">
        <h1>Mantenimiento</h1>
        <Mudanza />
      </div>
    </main>
  );
}
