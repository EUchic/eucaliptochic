const P: Record<string, string> = {
  percha: "M12 7.5a2 2 0 1 0-2-2M12 7.5v2.2M12 9.7 3.4 15.6c-.9.6-.5 1.9.6 1.9h16c1.100 0 1.500-1.300.6-1.900L12 9.700Z",
  hoja: "M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19c2-5 5-8 9-10",
  persona: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.500 20c.8-3.500 3.800-5.500 7.500-5.500s6.700 2 7.500 5.500",
  bolsa: "M5.500 8.500h13l1 11.500h-15l1-11.500ZM9 8.500V7a3 3 0 0 1 6 0v1.500",
  pin: "M12 21s6.500-5.600 6.500-11A6.500 6.500 0 0 0 5.500 10c0 5.400 6.500 11 6.500 11ZM12 12.300a2.300 2.300 0 1 0 0-4.600 2.300 2.300 0 0 0 0 4.600Z",
  lupa: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  flecha: "M5 12h14M13 6l6 6-6 6",
  atras: "M19 12H5M11 6l-6 6 6 6",
  mas: "M12 5v14M5 12h14",
  menos: "M5 12h14",
  cerrar: "M6 6l12 12M18 6 6 18",
  cuadros: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  filas: "M4 4h16v7H4zM4 13h16v7H4z",
  chat: "M4 19.500 5.300 15A8 8 0 1 1 9 18.700l-5 .8Z",
  camara: "M4 8h3l1.500-2h7L17 8h3v11H4V8ZM12 16.500a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  micro: "M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3ZM6 11.500a6 6 0 0 0 12 0M12 17.500V21",
  check: "M5 12.500 10 17l9-10",
  moneda: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15 9.500c-.5-1-1.600-1.500-3-1.500-1.700 0-3 .8-3 2s1.300 1.800 3 2 3 .800 3 2-1.300 2-3 2c-1.400 0-2.500-.5-3-1.500M12 6.500V8M12 16v1.500",
};

export default function Icon({ n, size = 24, className = "" }: { n: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg className={"ic " + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[n] ?? ""} />
    </svg>
  );
}
