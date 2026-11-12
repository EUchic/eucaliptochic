const P: Record<string, string> = {
  percha: "M12 7.5a2 2 0 1 0-2-2M12 7.5v2.2l8.3 5.6c1 .7.5 2.2-.7 2.2H4.4c-1.2 0-1.7-1.5-.7-2.200L12 9.7",
  capas: "M12 3.5 3.5 8l8.5 4.500L20.5 8 12 3.500ZM3.5 12l8.5 4.5 8.5-4.500M3.5 16l8.5 4.5 8.5-4.5",
  hoja: "M5 19c0-8 5-13 14-14 0 9-5 14-14 14Zm0 0 8-8",
  bolsa: "M5.5 8.500h13l1 11.500h-15l1-11.500ZM9 8.500V7a3 3 0 0 1 6 0v1.5",
  chat: "M4 5h16v11H9l-5 4V5Z",
  flecha: "M5 12h14m-5-5 5 5-5 5",
  atras: "M19 12H5m5-5-5 5 5 5",
  mas: "M12 5v14M5 12h14",
  menos: "M5 12h14",
  cerrar: "m6 6 12 12M18 6 6 18",
  buscar: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4.5 4.5",
  filtro: "M4 6h16M7 12h10M10 18h4",
  rejilla: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  rejilla3: "M4 4h4v16H4V4Zm6 0h4v16h-4V4Zm6 0h4v16h-4V4Z",
  mic: "M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Zm-6 8a6 6 0 0 0 12 0m-6 6v3",
  casa: "M4 11 12 4l8 7v9h-5.500v-5.500h-5V20H4v-9Z",
  moneda: "M12 20.500a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Zm3-11.500c-.5-1-1.5-1.5-3-1.5-2 0-3 1-3 2.2 0 3 6 1.3 6 4.3 0 1.2-1 2.2-3 2.2-1.5 0-2.7-.6-3.2-1.700M12 6v1.500m0 9V18",
  carpa: "M3 19 12 5l9 14H3Zm9-14v14m-4 0 4-6 4 6",
  ojo: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  basura: "M5 7h14M9 7V4.500h6V7m-8 0 1 13h8l1-13",
  lapiz: "m4 20 1-4L16.5 4.500l3 3L8 19l-4 1Z",
  check: "m5 12.5 4.5 4.500L19 7.5",
  insta: "M7.5 3.500h9a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4Zm4.5 12.500a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm5-9.200v.1",
  foto: "M4 6h16v13H4V6Zm0 10 4.5-4.5 3.5 3.5 3-3 5 5M15.5 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
};

export default function Icon({ n, s = 26, className = "" }: { n: keyof typeof P | string; s?: number; className?: string }) {
  return (
    <svg className={"ico " + className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[n] ?? ""} />
    </svg>
  );
}

/** Rama de eucalipto dibujada a mano: tallo curvo con hojas redondas en pares. Se dibuja sola al aparecer. */
export function Rama({ className = "", hojas = 7 }: { className?: string; hojas?: number }) {
  const pts = Array.from({ length: hojas }, (_, i) => {
    const t = (i + 0.6) / (hojas + 0.4);
    const x = 20 + t * 250, y = 150 - Math.sin(t * 2.1) * 105;
    const r = 21 - t * 11, a = -0.9 - t * 0.5;
    return { x, y, r, a, i };
  });
  return (
    <svg className={"rama " + className} viewBox="0 0 300 180" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path className="rama-tallo" pathLength={1} d="M12 160 C 80 150, 170 120, 285 40" />
      {pts.map(({ x, y, r, a, i }) => (
        <g key={i} style={{ "--i": i } as React.CSSProperties} className="rama-hoja">
          <ellipse cx={x + Math.cos(a) * r} cy={y + Math.sin(a) * r} rx={r} ry={r * 0.82} transform={`rotate(${(a * 180) / Math.PI + 90} ${x + Math.cos(a) * r} ${y + Math.sin(a) * r})`} pathLength={1} />
          <ellipse cx={x - Math.cos(a) * r * 0.9 + 8} cy={y - Math.sin(a) * r * 0.9 + 4} rx={r * 0.85} ry={r * 0.7} transform={`rotate(${(a * 180) / Math.PI + 80} ${x - Math.cos(a) * r * 0.9 + 8} ${y - Math.sin(a) * r * 0.9 + 4})`} pathLength={1} />
        </g>
      ))}
    </svg>
  );
}
