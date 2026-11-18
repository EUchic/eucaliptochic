import type { Metadata, Viewport } from "next";
import "./panel.css";

// El panel se puede instalar en el teléfono como una app ("Agregar a pantalla de inicio").
export const metadata: Metadata = {
  title: "Panel de Andrea",
  robots: { index: false, follow: false },
  manifest: "/panel.webmanifest",
  appleWebApp: { capable: true, title: "EU Chic", statusBarStyle: "default" },
  icons: { icon: "/panel/icono-192.png", apple: "/panel/apple-180.png" },
};
export const viewport: Viewport = { themeColor: "#A9C6B8", viewportFit: "cover", width: "device-width", initialScale: 1 };

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
