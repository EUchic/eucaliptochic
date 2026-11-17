// Fotos propias de la marca (no vienen de Squarespace). Viven en /public/fotos en dos tamaños: -800 y -1600.
// `pieza` es el slug de la tienda al que se suman como fotos extra. Las que no tienen pieza quedan en el panel
// de Andrea, en "Fotos sin asignar", para que ella diga de cuál pieza son.

export type Foto = { id: string; alt: string; tipo: "andrea" | "prenda"; pieza?: string; vertical?: boolean };

export const FOTOS: Foto[] = [
  { id: "andrea-lichi-cocina", alt: "Andrea con el Vestido Lichi rosado y una taza de café", tipo: "andrea", pieza: "vestido-lychee", vertical: true },
  { id: "andrea-cafe-eucalipto", alt: "Andrea con blusa y capri café, pañuelo en la cintura, junto a un ramo de eucalipto", tipo: "andrea", pieza: "blusa-lima", vertical: true },
  { id: "andrea-negro-cocina", alt: "Andrea de negro con pañuelo amarrado en la cintura", tipo: "andrea", vertical: true },
  { id: "lichi-espalda", alt: "Vestido Lichi rosado, de espalda", tipo: "prenda", pieza: "vestido-lychee" },
  { id: "mostaza-v", alt: "Blusa mostaza cuello en V", tipo: "prenda", pieza: "basica-cocoe" },
  { id: "taupe-lazo", alt: "Blusa de un hombro con lazo, color arena", tipo: "prenda", pieza: "blusa-kiwi" },
  { id: "taupe-lazo-espalda", alt: "Blusa de un hombro con lazo, de espalda", tipo: "prenda", pieza: "blusa-kiwi" },
  { id: "set-cafe", alt: "Blusa café sin mangas con falda larga de vuelo", tipo: "prenda", pieza: "blusa-lima" },
  { id: "roja", alt: "Blusa roja holgada", tipo: "prenda", pieza: "blusa-reversible-oli" },
  { id: "roja-reversible", alt: "Blusa roja mostrando el lado blanco por dentro", tipo: "prenda", pieza: "blusa-reversible-oli" },
  { id: "celeste-sin-mangas", alt: "Blusa celeste sin mangas con pliegues en los hombros", tipo: "prenda" },
  { id: "celeste-sin-mangas-espalda", alt: "Blusa celeste sin mangas, de espalda", tipo: "prenda" },
  { id: "celeste-manga", alt: "Blusa celeste de manga corta", tipo: "prenda" },
  { id: "verde-halter", alt: "Vestido corto verde olivo con cuello halter", tipo: "prenda" },
  { id: "verde-halter-espalda", alt: "Vestido verde olivo, espalda con lazo", tipo: "prenda" },
  { id: "verde-hombro", alt: "Blusa verde botella de un hombro y manga larga", tipo: "prenda" },
  { id: "vino-largo", alt: "Vestido largo color vino con abertura", tipo: "prenda" },
  { id: "cardigan-rosa", alt: "Cárdigan rosado abierto sobre blusa negra", tipo: "prenda" },
  { id: "negra-eu", alt: "Blusa negra sin mangas con EU bordado", tipo: "prenda" },
  { id: "mostaza-larga", alt: "Blusa larga mostaza con aberturas", tipo: "prenda" },
  { id: "enterizo-negro-espalda", alt: "Enterizo negro, espalda con lazo", tipo: "prenda" },
];

export const fotoSrc = (id: string, w: 800 | 1600 = 1600) => `/fotos/${id}-${w}.webp`;
export const fotoSet = (id: string) => `/fotos/${id}-800.webp 800w, /fotos/${id}-1600.webp 1600w`;
/** Ruta base que entiende img()/srcSet() de catalog.ts */
export const fotoBase = (id: string) => `/fotos/${id}`;

export function fotosDePieza(slug: string) {
  return FOTOS.filter((f) => f.pieza === slug).map((f) => fotoBase(f.id));
}

/** Looks armados por la marca (imágenes de Instagram). Los nombres son los que aparecen en cada imagen. */
export const LOOKS = [
  { img: "/looks/lima-higo.webp", fondo: "#8aa898", piezas: [["Blusa Lima", "blusa-lima"], ["Falda Higo", "falda-higo"]] },
  { img: "/looks/lichi-taza.webp", fondo: "#e8ddd5", piezas: [["Vestido Lichi", "vestido-lychee"]] },
  { img: "/looks/cocoe-higo.webp", fondo: "#cfe5dc", piezas: [["Blusa Cocoé", "basica-cocoe"], ["Falda Higo", "falda-higo"]] },
  { img: "/looks/kiwi-capri.webp", fondo: "#e3c9a8", piezas: [["Blusa Kiwi", "blusa-kiwi"], ["Capri Melón", "palazo-capri-melon"]] },
  { img: "/looks/dulce-mora-lichi.webp", fondo: "#e8ddd5", piezas: [["Pañuelo Dulce Mora", "panuelo-dulce-mora"], ["Vestido Lichi", "vestido-lychee"]] },
  { img: "/looks/lima-capri.webp", fondo: "#d6a7a7", piezas: [["Blusa Lima", "blusa-lima"], ["Capri Melón", "palazo-capri-melon"]] },
] as const;
