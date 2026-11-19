import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bodoni-moda";
import "@fontsource-variable/bodoni-moda/wght-italic.css";
import "@fontsource-variable/jost";
import "../globals.css";
import { CartProvider } from "@/components/Cart";
import Footer from "@/components/Footer";
import Fx from "@/components/Fx";
import Intro from "@/components/Intro";
import Nav from "@/components/Nav";
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
        <Intro />
        <Fx />
        <a className="skip" href="#contenido">Ir al contenido</a>
        <CartProvider whatsapp={WHATSAPP}>
          <Nav />
          <main id="contenido">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
