// Cerebro del panel de Andrea. Funciona en el navegador y en el servidor.
// - entender(): lee lo que Andrea dijo y propone acciones (sin guardar nada).
// - aplicar(): guarda una acción confirmada. Cada acción tiene un id único: si llega dos veces, la segunda se ignora.
// Cuando hay llave de OpenAI, el servidor propone las acciones con IA; si no, se usa entender() de aquí.

export type Sentido = "ingreso" | "gasto";
export const CATS: Record<Sentido, string[]> = {
  ingreso: ["Venta en feria", "Venta directa", "Venta web"],
  gasto: ["Tela", "Confección (Juanita)", "Feria", "Envíos", "Publicidad", "Comisiones", "Otro"],
};
export const METODOS = ["SINPE", "Efectivo", "Datáfono", "Transferencia", "ONVO", "Tarjeta"];

export type Accion =
  | { id: string; tipo: "movimiento"; sentido: Sentido; monto: number; moneda: "CRC" | "USD"; categoria: string; metodo: string; concepto: string; feria?: string; fecha: string; persona?: string }
  | { id: string; tipo: "precio"; slug: string; nombre: string; precio: number }
  | { id: string; tipo: "visible"; slug: string; nombre: string; visible: boolean }
  | { id: string; tipo: "coleccion"; nombre: string }
  | { id: string; tipo: "mover"; slug: string; nombre: string; coleccion: string }
  | { id: string; tipo: "pieza"; nombre: string; tipoPieza: string; precio: number; coleccion?: string; slug?: string; descripcion?: string; tallas?: Talla[] }
  | { id: string; tipo: "tallas"; slug: string; nombre: string; tallas: Talla[] }
  | { id: string; tipo: "descripcion"; slug: string; nombre: string; descripcion: string }
  | { id: string; tipo: "feria"; nombre: string; fecha: string; lugar?: string; direccion?: string; lat?: number; lng?: number }
  | { id: string; tipo: "persona"; nombre: string; rol?: "clienta" | "proveedor" | "otro"; categoria?: string; notas?: string }
  | { id: string; tipo: "recordar"; texto: string }
  | { id: string; tipo: "olvidar"; memoria: string; texto: string }
  | { id: string; tipo: "ajuste"; clave: string; valor: unknown }
  | { id: string; tipo: "foto_aprobar"; foto_id: string; slug: string; nombre: string }
  | { id: string; tipo: "foto_descartar"; foto_id: string; slug: string; nombre: string }
  | { id: string; tipo: "foto"; foto: string; slug: string; nombre: string }
  | { id: string; tipo: "anular"; mov: string; nombre: string }
  | { id: string; tipo: "quitar_foto"; foto_id: string; slug: string; nombre: string }
  | { id: string; tipo: "feria_lugar"; feria: string; nombre: string; lugar: string; direccion?: string; lat: number; lng: number }
  | { id: string; tipo: "feria_sin_foto"; feria: string; nombre: string }
  | { id: string; tipo: "borrar_feria"; feria: string; nombre: string }
  | { id: string; tipo: "aprender"; clave?: string; sentido: Sentido; categoria: string; nueva?: boolean };

export type Talla = { talla: string; existencias: number | null };
export type Pieza = {
  slug: string; nombre: string; precio: number; tipo: string; coleccion: string; foto: string; fotos: number; oculta?: boolean;
  lista?: { id: string; url: string; base?: string; ia?: boolean }[]; descripcion?: string | null; tallas?: Talla[]; propuesta?: { id: string; url: string; grande?: string } | null;
};
export type Persona = { nombre: string; rol?: string | null; categoria?: string | null; notas?: string | null; veces: number; ultimo?: string | null };
export type Mov = Extract<Accion, { tipo: "movimiento" }> & { crc: number; anulado?: boolean; creado: string };
export type Feria = { id: string; nombre: string; fecha: string; lugar?: string; direccion?: string; lat?: number; lng?: number; foto?: string };
export type Datos = {
  cambios: Record<string, Partial<Pieza>>;
  nuevas: Pieza[];
  colecciones: string[];
  movs: Mov[];
  ferias: Feria[];
  fotos: Record<string, string>; // foto -> slug
  hechas: string[]; // ids de acciones ya aplicadas (idempotencia)
  categorias: { nombre: string; sentido: Sentido }[]; // categorías que Andrea le enseñó al asistente
  aprendido: { clave: string; sentido: Sentido; categoria: string }[]; // palabras que ya sabe a qué categoría van
  personas: Persona[]; // gente con la que Andrea hace negocio (el asistente la recuerda)
  memoria: { id: string; texto: string }[]; // cosas que Andrea le pidió al asistente que recuerde
  ajustes: Record<string, unknown>;
};
export const VACIO: Datos = { cambios: {}, nuevas: [], colecciones: [], movs: [], ferias: [], fotos: {}, hechas: [], categorias: [], aprendido: [], personas: [], memoria: [], ajustes: {} };

/** Categorías de un sentido: las de siempre más las que Andrea agregó. */
export const categoriasDe = (d: Pick<Datos, "categorias">, s: Sentido) => [...CATS[s].filter((c) => c !== "Otro"), ...d.categorias.filter((c) => c.sentido === s).map((c) => c.nombre).filter((c) => !CATS[s].includes(c)), ...(CATS[s].includes("Otro") ? ["Otro"] : [])];
export type TipoCambio = { compra: number; venta: number; fecha: string } | null;

export const fmt = (n: number) => (n < 0 ? "−₡" : "₡") + Math.abs(Math.round(n)).toLocaleString("es-CR").replace(/[.,\s]/g, "\u00a0");
export const hoy = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10); // hora de Costa Rica
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!]/g, "").trim();
const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

/** Descripción corta y clara de una acción, para mostrársela a Andrea antes de guardar. */
export function describir(a: Accion): string {
  switch (a.tipo) {
    case "movimiento":
      return `${a.sentido === "ingreso" ? "Entró" : "Salió"} ${a.moneda === "USD" ? "$" + a.monto : fmt(a.monto)} · ${a.categoria} · ${a.metodo}${a.persona ? " · " + (a.sentido === "ingreso" ? "de " : "a ") + a.persona : ""}${a.feria ? " · " + a.feria : ""}`;
    case "precio": return `${a.nombre} pasa a costar ${fmt(a.precio)}`;
    case "visible": return a.visible ? `${a.nombre} vuelve a salir en la tienda` : `${a.nombre} se esconde de la tienda`;
    case "coleccion": return `Colección nueva: ${a.nombre}`;
    case "mover": return a.coleccion ? `${a.nombre} entra a la colección ${a.coleccion}` : `${a.nombre} sale de su colección`;
    case "pieza": return `Pieza nueva: ${a.nombre} (${a.tipoPieza}) a ${fmt(a.precio)}${a.coleccion ? ", colección " + a.coleccion : ""}${a.tallas?.length ? ", tallas " + a.tallas.map((t) => t.talla + (t.existencias != null ? ` (${t.existencias})` : "")).join(", ") : ""}`;
    case "tallas": return `${a.nombre}: ${a.tallas.map((t) => t.talla + (t.existencias != null ? ` (${t.existencias})` : "")).join(", ")}`;
    case "descripcion": return `Descripción nueva para ${a.nombre}`;
    case "persona": return `Recordar a ${a.nombre}${a.notas ? ": " + a.notas : ""}`;
    case "recordar": return `Recordar: ${a.texto}`;
    case "olvidar": return `Olvidar: ${a.texto}`;
    case "ajuste": return "Ajuste del panel";
    case "foto_aprobar": return `La foto nueva queda de portada en ${a.nombre}`;
    case "foto_descartar": return `Se descarta la foto propuesta de ${a.nombre}`;
    case "feria": return `Feria nueva: ${a.nombre}, ${fechaLinda(a.fecha)}${a.lugar ? ", en " + a.lugar : ""}`;
    case "foto": return `La foto queda en ${a.nombre}`;
    case "anular": return `Se anula: ${a.nombre}`;
    case "quitar_foto": return `Se quita una foto de ${a.nombre}`;
    case "feria_lugar": return `${a.nombre} queda en ${a.lugar}`;
    case "feria_sin_foto": return `Se quita la foto de ${a.nombre}`;
    case "borrar_feria": return `Se borra ${a.nombre}`;
    case "aprender": return a.clave ? `«${a.clave}» va en ${a.categoria}` : `Categoría nueva: ${a.categoria}`;
  }
}

export function fechaLinda(f: string) {
  const [y, m, d] = f.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long" });
}

// ───────── Números y fechas dichos en voz ─────────
const PALABRAS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15,
  veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
  doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
};

/** Primer monto de dinero en el texto: "45 mil", "45.000", "₡45000", "cuarenta mil", "20 dólares". */
export function monto(t: string): { monto: number; moneda: "CRC" | "USD" } | null {
  const n = norm(t);
  const usd = /(dolar|dolares|\$|usd)/.test(n);
  const m = n.match(/(\d[\d.,\s]*\d|\d)\s*(mil|k\b|millon)?/);
  if (m) {
    let v = Number(m[1].replace(/[\s.]/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, ""));
    if (m[2] === "mil" || m[2] === "k") v *= 1000;
    if (m[2] === "millon") v *= 1e6;
    if (v > 0) return { monto: v, moneda: usd ? "USD" : "CRC" };
  }
  const w = n.match(/((?:[a-z]+ )*?[a-z]+) mil\b/);
  if (w) {
    const v = w[1].split(" ").reduce((s, p) => s + (PALABRAS[p] ?? 0), 0);
    if (v > 0) return { monto: v * 1000, moneda: usd ? "USD" : "CRC" };
  }
  return null;
}

function fechaDicha(t: string): string {
  const n = norm(t);
  const base = new Date(hoy() + "T12:00:00");
  const sumar = (d: number) => new Date(base.getTime() + d * 864e5).toISOString().slice(0, 10);
  if (/pasado manana/.test(n)) return sumar(2);
  if (/manana/.test(n)) return sumar(1);
  if (/ayer/.test(n)) return sumar(-1);
  const dias = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const d = dias.findIndex((x) => new RegExp(`\\b${x}\\b`).test(n));
  if (d >= 0) {
    let diff = (d - base.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    if (/pasado|anterior/.test(n)) diff -= 7;
    return sumar(diff);
  }
  const m = n.match(/\b(?:el )?(\d{1,2})(?: de ([a-z]+))?\b/);
  if (m && Number(m[1]) <= 31 && /\b(el|dia)\s+\d/.test(n)) {
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const mes = m[2] ? meses.indexOf(m[2]) : base.getMonth();
    const f = new Date(base.getFullYear(), mes >= 0 ? mes : base.getMonth(), Number(m[1]), 12);
    return f.toISOString().slice(0, 10);
  }
  return hoy();
}

// ───────── Encontrar una pieza por lo que dijo ─────────
const GENERICAS = new Set(["blusa", "falda", "vestido", "pantalon", "palazo", "enterizo", "jogger", "croptop", "top", "sueter", "cardigan", "panuelo", "basica", "la", "el", "de", "short", "capri", "reversible", "multiformas"]);
const ALIAS: Record<string, string> = { lichi: "lychee", lichee: "lychee", litchi: "lychee", cocoe: "cocoe", coco: "cocoe", melon: "melon", mora: "mora" };

export function buscarPieza(t: string, piezas: Pieza[]): Pieza | null {
  const palabras = new Set(norm(t).split(/[^a-z0-9]+/).map((w) => ALIAS[w] ?? w));
  let mejor: Pieza | null = null, puntos = 0;
  for (const p of piezas) {
    const tokens = norm(p.nombre).split(/[^a-z0-9]+/).filter(Boolean);
    const unicos = tokens.filter((w) => !GENERICAS.has(w));
    let s = unicos.filter((w) => palabras.has(w)).length * 10;
    if (s === 0) continue;
    s += tokens.filter((w) => GENERICAS.has(w) && palabras.has(w)).length;
    if (s > puntos) { puntos = s; mejor = p; }
  }
  return mejor;
}

export function buscarFeria(t: string, ferias: Feria[]): string | undefined {
  const n = norm(t);
  const f = ferias.find((x) => norm(x.nombre).split(/\s+/).some((w) => w.length > 3 && !["feria", "de", "del"].includes(w) && n.includes(w)));
  if (f) return f.nombre;
  if (/\bferia\b/.test(n) && ferias.length) {
    const pasadas = ferias.filter((x) => x.fecha <= hoy()).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return (pasadas[0] ?? ferias[0]).nombre;
  }
  return undefined;
}

// ───────── Entender lo que dijo ─────────
export type Respuesta = { respuesta: string; acciones: Accion[] };

export function entender(texto: string, piezas: Pieza[], d: Datos, tc: TipoCambio): Respuesta {
  const n = norm(texto);
  if (!n) return { respuesta: "No te escuché. Tocá el botón y hablame.", acciones: [] };

  // Preguntas
  if (/^(cuanto|como voy|como vamos|que tal|cuantas|cuantos|dime|decime|resumen)/.test(n) || /\bcuanto (gaste|vendi|llevo|me queda|le pague|tengo|hice|entro|salio)/.test(n)) {
    return { respuesta: contestar(n, d, piezas), acciones: [] };
  }

  const pieza = buscarPieza(n, piezas);
  const dinero = monto(n);

  // Colección nueva
  const col = n.match(/(?:nueva coleccion|crea(?:r)? (?:la |una )?coleccion|abre (?:una )?coleccion)(?: nueva)?(?: que se llama| llamada)? ([a-z0-9 ]{2,40})/);
  if (col) {
    const nombre = titulo(col[1].replace(/\b(por favor|porfa)\b/g, "").trim());
    return { respuesta: `Creo la colección ${nombre}. ¿La guardo?`, acciones: [{ id: uid(), tipo: "coleccion", nombre }] };
  }

  // Mover pieza a colección
  const mov = n.match(/(?:pasa|pone|pon|mete|mueve|agrega)\w* .* a la coleccion ([a-z0-9 ]{2,40})/);
  if (mov && pieza) {
    const nombre = titulo(mov[1].trim());
    return { respuesta: `Paso ${pieza.nombre} a la colección ${nombre}. ¿Lo guardo?`, acciones: [{ id: uid(), tipo: "mover", slug: pieza.slug, nombre: pieza.nombre, coleccion: nombre }] };
  }

  // Esconder o volver a mostrar
  if (pieza && /(escond|ocult|quit|sac|agot|ya no (la|lo) vend|no (la|lo) muestr)/.test(n)) {
    return { respuesta: `Escondo ${pieza.nombre} de la tienda. ¿Lo hago?`, acciones: [{ id: uid(), tipo: "visible", slug: pieza.slug, nombre: pieza.nombre, visible: false }] };
  }
  if (pieza && /(mostr|volv\w* a (poner|subir|mostrar)|pon\w* de nuevo|activ|ya (la|lo) tengo|llego)/.test(n)) {
    return { respuesta: `Vuelvo a poner ${pieza.nombre} en la tienda. ¿Lo hago?`, acciones: [{ id: uid(), tipo: "visible", slug: pieza.slug, nombre: pieza.nombre, visible: true }] };
  }

  // Cambiar precio
  if (pieza && dinero && /(precio|cuesta|cobr|sub|baj|cambi|pon|deja|vale|a \d)/.test(n) && !/(vend|pague|compre|gaste|me pagaron)/.test(n)) {
    return { respuesta: `${pieza.nombre} pasa de ${fmt(pieza.precio)} a ${fmt(dinero.monto)}. ¿Lo cambio?`, acciones: [{ id: uid(), tipo: "precio", slug: pieza.slug, nombre: pieza.nombre, precio: dinero.monto }] };
  }

  // Pieza nueva
  const nueva = n.match(/(?:agrega|crea|sube|mete)\w* (?:una |un )?(blusa|falda|vestido|pantalon|palazo|enterizo|top|sueter|panuelo)(?: nueva| nuevo)?(?: que se llama| llamad[ao])? ([a-z ]{2,30}?)(?: a | en | de |,|$)/);
  if (nueva && !/(feria)/.test(n)) {
    const tipoPieza = { blusa: "Blusas", falda: "Faldas", vestido: "Vestidos", pantalon: "Pantalones", palazo: "Pantalones", enterizo: "Enterizos", top: "Tops", sueter: "Suéteres", panuelo: "Pañuelos" }[nueva[1]] ?? "Blusas";
    const nombre = titulo(`${nueva[1]} ${nueva[2].trim()}`);
    const precio = dinero?.monto ?? 0;
    return {
      respuesta: `Agrego ${nombre}${precio ? " a " + fmt(precio) : ", todavía sin precio"}. Después le subís las fotos. ¿La creo?`,
      acciones: [{ id: uid(), tipo: "pieza", nombre, tipoPieza, precio }],
    };
  }

  // Feria nueva
  if (/\bferia\b/.test(n) && !dinero && /(nueva|voy a (ir|estar)|tengo|agrega|apunta|anota|hay una|me inscrib)/.test(n)) {
    const lugar = n.match(/feria (?:de |del |en |la )?([a-z ]{3,30}?)(?: el | este | esta | para | manana| pasado|$)/)?.[1]?.trim();
    const nombre = lugar ? "Feria " + titulo(lugar) : "Feria";
    const fecha = fechaDicha(n);
    return { respuesta: `Anoto la ${nombre} para el ${fechaLinda(fecha)}. ¿La guardo?`, acciones: [{ id: uid(), tipo: "feria", nombre, fecha }] };
  }

  // Plata que entra o sale
  if (dinero) {
    const gasto = /(pague|compre|gaste|le di|cancele|costo|salio|le deposite|le pase|le hice un sinpe)/.test(n);
    const ingreso = /(vendi|me pagaron|me entro|entro|cobre|me hicieron|recibi|me cayo|me depositaron|me mandaron)/.test(n);
    const sentido: Sentido = gasto && !ingreso ? "gasto" : ingreso ? "ingreso" : /(juanita|tela|stand|envio|correos|pauta)/.test(n) ? "gasto" : "ingreso";
    const categoria =
      sentido === "gasto"
        ? /juanita|confecc|costur|maquila|hechura/.test(n) ? "Confección (Juanita)"
          : /tela|metros|rollo/.test(n) ? "Tela"
          : /feria|stand|espacio|inscripcion/.test(n) ? "Feria"
          : /envio|correos|mensajer|uber|moto/.test(n) ? "Envíos"
          : /pauta|anuncio|publicidad|instagram|facebook/.test(n) ? "Publicidad"
          : /comision|datafono|mipos/.test(n) ? "Comisiones" : "Otro"
        : /feria/.test(n) ? "Venta en feria" : /web|pagina|en linea/.test(n) ? "Venta web" : "Venta directa";
    const metodo = /sinpe/.test(n) ? "SINPE" : /efectivo|cash|en mano/.test(n) ? "Efectivo" : /tarjeta|datafono|mipos|pos\b/.test(n) ? "Datáfono" : /transfer/.test(n) ? "Transferencia" : "SINPE";
    const feria = buscarFeria(n, d.ferias);
    const fecha = /(ayer|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo) pasado|antier)/.test(n) ? fechaDicha(n.replace("antier", "ayer")) : hoy();
    const a: Accion = { id: uid(), tipo: "movimiento", sentido, monto: dinero.monto, moneda: dinero.moneda, categoria, metodo, concepto: texto.trim(), feria, fecha };
    const usd = dinero.moneda === "USD" && tc ? ` (unos ${fmt(dinero.monto * (sentido === "ingreso" ? tc.compra : tc.venta))} al tipo de cambio de hoy)` : "";
    return { respuesta: `Anoto que ${sentido === "ingreso" ? "entraron" : "salieron"} ${dinero.moneda === "USD" ? "$" + dinero.monto : fmt(dinero.monto)}${usd} en ${minus(categoria)}, por ${metodoDicho(metodo)}${feria ? ", en la " + feria : ""}. ¿Lo guardo?`, acciones: [a] };
  }

  if (pieza) return { respuesta: `Encontré ${pieza.nombre}, a ${fmt(pieza.precio)}. Decime qué querés hacer con ella: cambiarle el precio, esconderla o pasarla a una colección.`, acciones: [] };
  return {
    respuesta: "No entendí bien. Probá con algo como: «le pagué 45 mil a Juanita por SINPE», «vendí 60 mil en la feria en efectivo» o «subí la Blusa Jade a 25 mil».",
    acciones: [],
  };
}

const minus = (c: string) => c[0].toLowerCase() + c.slice(1);
const metodoDicho = (m: string) => (m === "SINPE" || m === "ONVO" ? m : m.toLowerCase());
const titulo = (s: string) => s.split(" ").filter(Boolean).map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

// ───────── Contestar preguntas con los números ─────────
export function resumenMes(d: Datos, mes = hoy().slice(0, 7)) {
  const l = d.movs.filter((m) => !m.anulado && m.fecha.startsWith(mes));
  const entro = l.filter((m) => m.sentido === "ingreso").reduce((s, m) => s + m.crc, 0);
  const salio = l.filter((m) => m.sentido === "gasto").reduce((s, m) => s + m.crc, 0);
  const porCat: Record<string, number> = {};
  for (const m of l.filter((x) => x.sentido === "gasto")) porCat[m.categoria] = (porCat[m.categoria] ?? 0) + m.crc;
  return { entro, salio, queda: entro - salio, porCat, iva: (entro * 13) / 113, n: l.length };
}

export function porFeria(d: Datos, nombre: string) {
  const l = d.movs.filter((m) => !m.anulado && m.feria === nombre);
  const vendio = l.filter((m) => m.sentido === "ingreso").reduce((s, m) => s + m.crc, 0);
  const gasto = l.filter((m) => m.sentido === "gasto").reduce((s, m) => s + m.crc, 0);
  return { vendio, gasto, dejo: vendio - gasto };
}

function contestar(n: string, d: Datos, piezas: Pieza[]): string {
  const r = resumenMes(d);
  const feria = d.ferias.find((f) => norm(f.nombre).split(" ").some((w) => w.length > 3 && w !== "feria" && n.includes(w)));
  if (feria) {
    const f = porFeria(d, feria.nombre);
    return `En la ${feria.nombre} vendiste ${fmt(f.vendio)} y gastaste ${fmt(f.gasto)}. Te dejó ${fmt(f.dejo)}.`;
  }
  const cat = Object.keys(r.porCat).find((c) => n.includes(norm(c.split(" ")[0])) || (c.includes("Juanita") && n.includes("juanita")));
  if (cat || /tela|juanita|envio|publicidad/.test(n)) {
    const c = cat ?? (/tela/.test(n) ? "Tela" : /juanita/.test(n) ? "Confección (Juanita)" : /envio/.test(n) ? "Envíos" : "Publicidad");
    return `Este mes llevás ${fmt(r.porCat[c] ?? 0)} en ${minus(c)}.`;
  }
  if (/vend|entro/.test(n)) return `Este mes entraron ${fmt(r.entro)}.`;
  if (/gast|salio/.test(n)) return `Este mes salieron ${fmt(r.salio)}.`;
  if (/piezas|tienda/.test(n)) {
    const vis = piezas.filter((p) => !p.oculta).length;
    return `En la tienda hay ${vis} piezas a la vista y ${piezas.length - vis} escondidas.`;
  }
  return `Este mes entraron ${fmt(r.entro)}, salieron ${fmt(r.salio)} y te quedan ${fmt(r.queda)}.`;
}

/** ¿Lo que dijo es un "sí" o un "no" a la pregunta de confirmación? */
export function respuestaCorta(t: string): "si" | "no" | null {
  const n = norm(t);
  if (/^(si|sii|dale|claro|ok|okay|guarda|guardalo|hacelo|correcto|perfecto|de una|exacto|eso|va)\b/.test(n)) return "si";
  if (/^(no|nel|cancela|borra|olvida|mejor no|espera)\b/.test(n)) return "no";
  return null;
}

// ───────── Aplicar (solo después de que Andrea confirma) ─────────
export function aplicar(d: Datos, a: Accion, tc: TipoCambio): Datos {
  if (d.hechas.includes(a.id)) return d; // idempotencia: la misma acción no se guarda dos veces
  const x: Datos = { ...d, hechas: [...d.hechas.slice(-500), a.id] };
  switch (a.tipo) {
    case "movimiento": {
      const crc = a.moneda === "USD" ? a.monto * (tc ? (a.sentido === "ingreso" ? tc.compra : tc.venta) : 0) : a.monto;
      return { ...x, movs: [{ ...a, crc, creado: new Date().toISOString() }, ...x.movs] };
    }
    case "precio": return { ...x, cambios: { ...x.cambios, [a.slug]: { ...x.cambios[a.slug], precio: a.precio } } };
    case "visible": return { ...x, cambios: { ...x.cambios, [a.slug]: { ...x.cambios[a.slug], oculta: !a.visible } } };
    case "mover": return {
      ...x,
      colecciones: !a.coleccion || x.colecciones.includes(a.coleccion) ? x.colecciones : [...x.colecciones, a.coleccion],
      cambios: { ...x.cambios, [a.slug]: { ...x.cambios[a.slug], coleccion: a.coleccion } },
    };
    case "coleccion": return { ...x, colecciones: x.colecciones.includes(a.nombre) ? x.colecciones : [...x.colecciones, a.nombre] };
    case "pieza": {
      const slug = a.slug || "nueva-" + norm(a.nombre).replace(/[^a-z0-9]+/g, "-") + "-" + a.id.slice(0, 4);
      return { ...x, nuevas: [{ slug, nombre: a.nombre, precio: a.precio, tipo: a.tipoPieza, coleccion: a.coleccion ?? "", foto: "", fotos: 0, tallas: a.tallas, descripcion: a.descripcion }, ...x.nuevas] };
    }
    case "feria": return { ...x, ferias: [{ id: a.id, nombre: a.nombre, fecha: a.fecha, lugar: a.lugar, direccion: a.direccion, lat: a.lat, lng: a.lng }, ...x.ferias] };
    case "foto": return { ...x, fotos: { ...x.fotos, [a.foto]: a.slug } };
    case "anular": return { ...x, movs: x.movs.map((m) => (m.id === a.mov ? { ...m, anulado: true } : m)) };
    case "quitar_foto": return x; // solo existe con la base conectada
    case "feria_lugar": return { ...x, ferias: x.ferias.map((f) => (f.id === a.feria ? { ...f, lugar: a.lugar, direccion: a.direccion, lat: a.lat, lng: a.lng } : f)) };
    case "feria_sin_foto": return { ...x, ferias: x.ferias.map((f) => (f.id === a.feria ? { ...f, foto: undefined } : f)) };
    case "borrar_feria": return { ...x, ferias: x.ferias.filter((f) => f.id !== a.feria) };
    case "aprender": return {
      ...x,
      categorias: a.nueva && !x.categorias.some((c) => c.nombre === a.categoria) ? [...x.categorias, { nombre: a.categoria, sentido: a.sentido }] : x.categorias,
      aprendido: a.clave ? [...x.aprendido.filter((l) => l.clave !== a.clave), { clave: a.clave, sentido: a.sentido, categoria: a.categoria }] : x.aprendido,
    };
    case "recordar": return { ...x, memoria: [...x.memoria, { id: a.id, texto: a.texto }] };
    case "olvidar": return { ...x, memoria: x.memoria.filter((m) => m.id !== a.memoria) };
    case "ajuste": return { ...x, ajustes: { ...x.ajustes, [a.clave]: a.valor } };
    case "persona": return { ...x, personas: [...x.personas.filter((p) => norm(p.nombre) !== norm(a.nombre)), { nombre: a.nombre, rol: a.rol, categoria: a.categoria, notas: a.notas, veces: 0 }] };
    case "tallas": return { ...x, cambios: { ...x.cambios, [a.slug]: { ...x.cambios[a.slug], tallas: a.tallas } } };
    case "descripcion": return { ...x, cambios: { ...x.cambios, [a.slug]: { ...x.cambios[a.slug], descripcion: a.descripcion } } };
    default: return x; // fotos de la IA: solo existen con la base conectada
  }
}
