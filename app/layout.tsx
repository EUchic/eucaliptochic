import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bodoni-moda";
import "@fontsource-variable/bodoni-moda/wght-italic.css";
import "@fontsource-variable/jost";
import "./globals.css";
import { BagButton, CartProvider } from "@/components/Cart";
import { WHATSAPP } from "@/lib/catalog";

export const metadata: Metadata = {
  title: { default: "Eucalipto Chic — By Andrea Bermúdez", template: "%s — Eucalipto Chic" },
  description: "Ropa de Eucalipto Chic, by Andrea Bermúdez. Blusas, vestidos, faldas, palazos y enterizos.",
};
export const viewport: Viewport = { themeColor: "#A9C6B8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CR">
      <body>
        <a className="skip" href="#contenido">Ir al contenido</a>
        <CartProvider whatsapp={WHATSAPP}>
          <header className="nav">
            <a className="nav-logo" href="/" aria-label="Eucalipto Chic, inicio">
              <b>EU</b><i>chic</i>
            </a>
            <nav aria-label="Principal">
              <a href="/tienda">Tienda</a>
              <a href="/#colecciones">Colecciones</a>
              <a href="/#andrea">Andrea</a>
            </nav>
            <BagButton />
          </header>
          <main id="contenido">{children}</main>
          <footer className="pie">
            <div className="wrap pie-grid">
              <p className="pie-marca"><b>EU</b><i>chic</i></p>
              <ul>
                <li><a href="/tienda">Toda la tienda</a></li>
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
