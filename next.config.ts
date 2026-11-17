import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const config: NextConfig = {
  poweredByHeader: false,
  // Páginas de la web vieja en Squarespace → su equivalente nuevo.
  async redirects() {
    return [
      { source: "/acerca", destination: "/andrea", permanent: true },
      { source: "/contacto", destination: "/encontranos", permanent: true },
      { source: "/cart", destination: "/tienda", permanent: false },
      { source: "/checkout", destination: "/tienda", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
export default config;
