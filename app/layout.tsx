import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bodoni-moda";
import "@fontsource-variable/bodoni-moda/wght-italic.css";
import "@fontsource-variable/jost";
import "./globals.css";
import { BagButton, CartProvider } from "@/components/Cart";
import { WHATSAPP } from "@/lib/catalog";
import Link from "next/link";
import Fx from "@/components/Fx";
import Intro from "@/components/Intro";
import { Lockup, Mark } from "@/components/Logo";

export const metadata: Metadata = {
  title: { default: "Eucalipto Chic — By Andrea Bermúdez", template: "%s — Eucalipto Chic" },
  description: "Ropa de Eucalipto Chic, by Andrea Bermúdez. Blusas, vestidos, faldas, palazos y enterizos.",
};
export const viewport: Viewport = { themeColor: "#A9C6B8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CR">
      <body>
        <Intro />
        <Fx />
        <a className="skip" href="#contenido">Ir al contenido</a>
        <CartProvider whatsapp={WHATSAPP}>
          <header className="nav">
            <Link className="nav-logo" href="/" aria-label="Eucalipto Chic, inicio">
              <Mark part="full" />
            </Link>
            <nav aria-label="Principal">
              <Link href="/tienda">Tienda</Link>
              <Link href="/#colecciones">Colecciones</Link>
              <Link href="/#andrea">Andrea</Link>
            </nav>
            <BagButton />
          </header>
          <main id="contenido">{children}</main>
          <footer className="pie">
            <div className="wrap pie-grid">
              <Lockup className="pie-marca" />
              <ul>
                <li><Link href="/tienda">Toda la tienda</Link></li>
                <li><a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">WhatsApp 7017 1232</a></li>
                <li><a href="https://www.instagram.com/eucaliptochicr/" target="_blank" rel="noopener noreferrer">Instagram @eucaliptochicr</a></li>
              </ul>
              <p className="pie-nota">Eucalipto Chic, by Andrea Bermúdez. Costa Rica, desde 2020.</p>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
