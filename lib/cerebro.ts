// El cerebro del asistente cuando no hay IA conectada (y la red de seguridad cuando la IA falla).
// Entiende lo que Andrea dice, propone acciones y, cuando algo requiere más de un paso,
// devuelve una "tarjeta" que el chat dibuja: fotos para escoger, categorías, un botón para ir a una sección…
// Nunca guarda nada por su cuenta: todo pasa por un "Sí" de Andrea.

import type { Tarea } from "./guias";
import {
  buscarFeria, buscarPieza, categoriasDe, entender, fmt, monto, norm, resumenMes,
  type Accion, type Datos, type Pieza, type Sentido, type TipoCambio,
} from "./asistente";

export type Seccion = "inicio" | "plata" | "tienda" | "ferias" | "anuncios";
export type Movimiento = Extract<Accion, { tipo: "movimiento" }>;
export type BorradorPieza = { nombre?: string; tipoPieza?: string; precio?: number; coleccion?: string; descripcion?: string; tallas?: { talla: string; existencias: number | null }[] };
export type BorradorFeria = { nombre?: string; fecha?: string; lugar?: string };
export type Tarjeta =
  | { tipo: "confirmar"; acciones: Accion[]; aprendo?: string }
  | { tipo: "categoria"; mov: Movimiento; clave?: string }
  | { tipo: "posts"; que?: "post" | "story" }
  | { tipo: "publicar"; caption?: string; que?: "post" | "story" }
  | { tipo: "foto"; slug?: string }
  | { tipo: "rehacer"; slug: string; texto?: string }
  | { tipo: "producto"; borrador: BorradorPieza }
  | { tipo: "feria"; borrador: BorradorFeria }
  | { tipo: "ir"; seccion: Seccion; boton: string; tarea?: Tarea; slug?: string; feria?: string }
  | { tipo: "resumen" }
  | { tipo: "reporte" }
  | { tipo: "opciones"; ops: string[] };
export type Pendiente = { tipo: "monto"; sentido: Sentido } | null;
export type Pensado = { respuesta: string; acciones: Accion[]; tarjeta?: Tarjeta; pendiente?: Pendiente; motor?: string };

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export const SUGERENCIAS = ["Anotar una venta", "Anotar un gasto", "Meter un producto nuevo", "Promocionar un post", "Agregar una feria", "¿Cómo voy este mes?"];

const NOMBRE_SECCION: Record<Seccion, string> = { inicio: "Inicio", plata: "Plata", tienda: "Tienda", ferias: "Ferias", anuncios: "Anuncios" };

// Palabras que no sirven para recordar un gasto: verbos de pagar, montos, métodos, relleno.
const RELLENO = new Set(("le la el los las lo un una unos unas de del al a en con por para que mi mis me te se su sus y o es fue ya hoy ayer " +
  "pague pago pagar pagado compre compra comprar gaste gasto gastar di dio deposite pase hice sinpe efectivo tarjeta datafono transferencia mipos " +
  "mil colones colon dolares dolar plata monto como cuanto unos ahi eso esto esta este muy mas menos otra otro vez semana mes dia lunes martes " +
  "miercoles jueves viernes sabado domingo vendi vendimos me pagaron entro cobre recibi senora senor don dona").split(" "));

/** Las palabras que identifican un gasto o ingreso, para recordarlo la próxima vez. */
export function claveDe(texto: string): string {
  const palabras = norm(texto).replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !RELLENO.has(w));
  return palabras.slice(0, 3).join(" ");
}

/** ¿Ya le enseñó a qué categoría va algo así? Gana la clave más larga que calce completa. */
export function recordar(texto: string, d: Datos): Datos["aprendido"][number] | null {
  const n = " " + norm(texto) + " ";
  return [...d.aprendido]
    .filter((l) => l.clave.split(" ").every((w) => n.includes(" " + w + " ") || n.includes(" " + w)))
    .sort((a, b) => b.clave.length - a.clave.length)[0] ?? null;
}

const AYUDA = "Puedo anotar ventas y gastos, cambiar precios, esconder o mostrar piezas, anotar ferias, promocionar posts de Instagram y ayudarte con las fotos. Decímelo como se lo dirías a una persona.";

export function pensarLocal(texto: string, piezas: Pieza[], d: Datos, tc: TipoCambio, pendiente: Pendiente = null): Pensado {
  let n = norm(texto);
  if (!n) return { respuesta: "No te escuché. Tocá el micrófono y hablame, o escribime abajo.", acciones: [] };
  const dinero = monto(n);

  // Venía de preguntarle el monto ("¿Cuánto vendiste?") y contestó solo con el número.
  if (pendiente?.tipo === "monto" && dinero && !/(vend|pag|compr|gast|entr|sal)/.test(n)) {
    n = (pendiente.sentido === "ingreso" ? "vendi " : "pague ") + n;
    texto = (pendiente.sentido === "ingreso" ? "Vendí " : "Pagué ") + texto;
  }

  // Saludos, gracias y ayuda
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal)\b/.test(n) && n.split(" ").length <= 4) {
    return { respuesta: "¡Hola, Andrea! ¿En qué te ayudo hoy?", acciones: [], tarjeta: { tipo: "opciones", ops: SUGERENCIAS.slice(0, 4) } };
  }
  if (/^(gracias|muchas gracias|mil gracias|que bueno|perfecto|genial|excelente)\b/.test(n) && !dinero) {
    return { respuesta: "¡Con mucho gusto! Aquí estoy para lo que ocupés.", acciones: [] };
  }
  if (/(que (podes|puedes|sabes) hacer|ayuda|como funciona|como te uso|que hago aqui)/.test(n)) {
    return { respuesta: AYUDA, acciones: [], tarjeta: { tipo: "opciones", ops: SUGERENCIAS } };
  }

  // Producto nuevo: abre la ficha (foto, tallas, cuántas hay, precio…)
  if (/(meter|agregar|subir|crear|anotar|registrar|poner|nuev)\w* (un |una |el |la )?(producto|pieza|prenda|blusa|vestido|falda|pantalon|enterizo|top|sueter)/.test(n) || /(producto|pieza|prenda) nuev/.test(n)) {
    const nombre = texto.match(/(?:llama|se llama|nombre)\s+(.+)$/i)?.[1]?.trim();
    const m = dinero;
    return { respuesta: "¡Qué bueno! Llenemos la ficha juntas. Empezá por la foto y yo te voy preguntando lo demás.", acciones: [],
      tarjeta: { tipo: "producto", borrador: { nombre, precio: m?.moneda === "CRC" ? m.monto : undefined } } };
  }
  // Feria nueva: ficha con buscador de lugares
  if (/(agregar|anotar|meter|crear|poner|registrar|nueva)\w* (una |la )?feria/.test(n) || /feria nueva/.test(n)) {
    return { respuesta: "Dale. Contame el nombre, la fecha y dónde es; el lugar lo buscamos en el mapa.", acciones: [], tarjeta: { tipo: "feria", borrador: {} } };
  }
  // Publicar en Instagram
  if (/(publicar|subir|postear|montar)\w* (un |una |el |la )?(post|story|historia|foto) (en|a|al) (instagram|ig)/.test(n) || /(publicar|postear) en (instagram|ig)/.test(n)) {
    return { respuesta: "Hagámoslo. Escogé la foto, te ayudo con el texto y lo revisás antes de publicar.", acciones: [], tarjeta: { tipo: "publicar", que: /story|historia/.test(n) ? "story" : "post" } };
  }

  // Promocionar un post
  if (/(promocion|promocionar|promociona|pautar|pauta|impulsar|boost|anunciar|que lo vea mas gente|que la vea mas gente|anuncio)/.test(n)
      && !(dinero && /(pague|gaste|me cobraron|salio)/.test(n))) {
    if (/(como va|como van|cuanto (me )?(llevo|he) gastado|resultado|cuantas personas|me escribieron)/.test(n)) {
      return { respuesta: "Tus promociones y sus resultados están en Anuncios.", acciones: [], tarjeta: { tipo: "ir", seccion: "anuncios", boton: "Ver mis promociones" } };
    }
    return { respuesta: "¡Dale! ¿Cuál post querés que vea más gente? Tocá la foto.", acciones: [], tarjeta: { tipo: "posts" } };
  }

  // Mejorar o subir fotos
  if (/(mejor|arregl|edit|retoc|bonit|ilumin|fondo|profesional|aclar).*(foto|imagen)|(foto|imagen).*(mejor|bonit|profesional|arregl|retoc|ilumin|fondo)/.test(n)) {
    const p = buscarPieza(n, piezas);
    return {
      respuesta: p ? `Vamos a mejorar una foto de ${p.nombre}. Tomala o escogela aquí abajo.` : "¡Claro! ¿De cuál pieza es la foto? Escogela y después la subís aquí mismo.",
      acciones: [], tarjeta: { tipo: "foto", slug: p?.slug },
    };
  }
  if (/(subir|poner|agregar|cambiar|meter).*(foto|fotos)/.test(n)) {
    const p = buscarPieza(n, piezas);
    return { respuesta: p ? `Subile la foto a ${p.nombre} aquí mismo.` : "¿A cuál pieza le querés poner fotos?", acciones: [], tarjeta: { tipo: "foto", slug: p?.slug } };
  }

  // Borrar una feria
  if (/(borr|quit|elimin|cancel)\w* (la |esa |una )?feria/.test(n)) {
    const nombre = buscarFeria(n, d.ferias.filter((f) => !/^\s*$/.test(f.nombre)));
    const f = nombre ? d.ferias.find((x) => x.nombre === nombre) : null;
    if (f && !/^\s*(la|esa|una)?\s*feria\s*$/.test(n)) {
      return { respuesta: `¿Borro ${f.nombre}? Se quita de la página; lo que vendiste ahí queda anotado.`, acciones: [{ id: uid(), tipo: "borrar_feria", feria: f.id, nombre: f.nombre }] };
    }
    return { respuesta: "Las ferias se borran en la pestaña Ferias: tocás la feria y abajo dice «Borrar feria».", acciones: [], tarjeta: { tipo: "ir", seccion: "ferias", boton: "Llevame a borrarla", tarea: "borrar_feria" } };
  }

  // ¿Dónde está…? / llevame a…
  const pide = /(donde|como) (veo|pongo|agrego|cambio|subo|borro|quito|encuentro|hago|anoto|esta|estan|meto)|llevame|abri|abrime|mostrame|ensename|quiero ver|ir a /.test(n);
  if (pide && !dinero) {
    const destino: [RegExp, Seccion, string][] = [
      [/feria/, "ferias", "Las ferias están en la pestaña Ferias. Ahí les ponés foto y lugar, y las borrás."],
      [/(anuncio|promocion|pauta|instagram)/, "anuncios", "Las promociones están en Anuncios."],
      [/(pieza|precio|producto|tienda|coleccion|ropa|catalogo|foto)/, "tienda", "Las piezas, precios, colecciones y fotos están en Tienda."],
      [/(plata|venta|gasto|movimiento|cuenta|ingreso|ganancia|iva|sinpe)/, "plata", "Todo lo de plata está en Plata: lo que entró, lo que salió y en qué se fue."],
    ];
    const m = destino.find(([r]) => r.test(n));
    if (m) return { respuesta: m[2], acciones: [], tarjeta: { tipo: "ir", seccion: m[1], boton: `Ir a ${NOMBRE_SECCION[m[1]]}` } };
  }

  // "Anotar una venta / un gasto" sin monto: preguntar
  if (!dinero && /^(anotar|anota|apunta|registra|registrar|quiero anotar)?\s*(una |un )?(venta|vendi|ingreso)\b/.test(n)) {
    return { respuesta: "¿Cuánto vendiste y cómo te pagaron? Por ejemplo: «45 mil por SINPE».", acciones: [], pendiente: { tipo: "monto", sentido: "ingreso" } };
  }
  if (!dinero && /^(anotar|anota|apunta|registra|registrar|quiero anotar)?\s*(una |un )?(gasto|pago|compra)\b/.test(n)) {
    return { respuesta: "¿Cuánto fue, en qué y cómo lo pagaste? Por ejemplo: «32 mil de tela con tarjeta».", acciones: [], pendiente: { tipo: "monto", sentido: "gasto" } };
  }

  // ¿Cómo voy?
  if (/^(como voy|como vamos|como va el mes|como estoy|resumen|dame un resumen)/.test(n)) {
    const r = resumenMes(d);
    return { respuesta: `Este mes entraron ${fmt(r.entro)}, salieron ${fmt(r.salio)} y te quedan ${fmt(r.queda)}.`, acciones: [], tarjeta: { tipo: "resumen" } };
  }

  // Todo lo demás: lo de siempre (ventas, gastos, precios, piezas, ferias, preguntas de plata)
  const r = entender(texto, piezas, d, tc);
  const mov = r.acciones.find((a): a is Movimiento => a.tipo === "movimiento");
  if (mov) {
    // ¿Ya me enseñó qué es esto?
    const sabido = recordar(texto, d);
    if (sabido && sabido.sentido === mov.sentido) {
      mov.categoria = sabido.categoria;
      return { respuesta: r.respuesta.replace(/en [^,]+, por/, `en ${sabido.categoria.toLowerCase()}, por`), acciones: r.acciones };
    }
    // Un gasto que no conozco: le pregunto y aprendo.
    if (mov.sentido === "gasto" && mov.categoria === "Otro") {
      const clave = claveDe(texto);
      return {
        respuesta: `Anoto ${mov.moneda === "USD" ? "$" + mov.monto : fmt(mov.monto)}${clave ? ` de «${clave}»` : ""}. No sé todavía qué tipo de gasto es: ¿en cuál va? Así lo aprendo para la próxima.`,
        acciones: [], tarjeta: { tipo: "categoria", mov, clave: clave || undefined },
      };
    }
  }
  if (r.acciones.length) return r;
  if (/^no entendi/i.test(r.respuesta)) {
    return { respuesta: "No te entendí bien. ¿Me lo decís de otra forma? Estas son algunas cosas que puedo hacer:", acciones: [], tarjeta: { tipo: "opciones", ops: SUGERENCIAS } };
  }
  return r;
}

/** Las categorías de un sentido, en el orden en que conviene mostrárselas. */
export const categoriasPara = (d: Datos, s: Sentido) => categoriasDe(d, s);
