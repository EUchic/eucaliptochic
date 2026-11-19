import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bodoni-moda";
import "./panel.css";

// El panel de Andrea vive aparte de la tienda: sin animaciones de entrada, carrito ni menú de la tienda.
// Se puede instalar en el teléfono como una app ("Agregar a pantalla de inicio").
export const metadata: Metadata = {
  title: "Panel de Andrea",
  robots: { index: false, follow: false },
  manifest: "/panel.webmanifest",
  appleWebApp: { capable: true, title: "EU Chic", statusBarStyle: "default" },
  icons: { icon: "/panel/icono-192.png", apple: "/panel/apple-180.png" },
  formatDetection: { telephone: false, address: false, email: false },
};
export const viewport: Viewport = {
  themeColor: "#F4F5F1", viewportFit: "cover", width: "device-width", initialScale: 1, interactiveWidget: "resizes-content",
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CR">
      <body className="pn-cuerpo">{children}</body>
    </html>
  );
}
