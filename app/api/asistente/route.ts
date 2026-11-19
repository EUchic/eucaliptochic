import { NextResponse } from "next/server";
import { TAREAS, seccionDe, type Tarea } from "@/lib/guias";
import { CATS, METODOS, buscarPieza, describir, fmt, hoy, norm, type Accion, type Pieza, type Talla } from "@/lib/asistente";
import type { Movimiento, Seccion, Tarjeta } from "@/lib/cerebro";
import { responses, textoDe } from "@/lib/ia";
import { permitido } from "@/lib/panel";
import { TIPOS_PIEZA } from "@/lib/validar";

// El asistente con IA (OpenAI, Responses API). Entiende lo que Andrea dice, pregunta cuando le falta algo
// y propone acciones o abre pasos en el chat; nunca guarda nada por su cuenta (todo pasa por un "Sí" de ella).
// Sin OPENAI_API_KEY responde 501 y el panel usa el cerebro local (lib/cerebro.ts).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PiezaCtx = { slug: string; nombre: string; precio: number; tipo: string; coleccion: string; oculta?: boolean; tallas?: Talla[]; sinFoto?: boolean };
type Contexto = {
  piezas: PiezaCtx[]; colecciones: string[]; ferias: { id: string; nombre: string; fecha: string; lugar?: string }[]; resumen: string;
  movs?: { id: string; fecha: string; sentido: string; crc: number; categoria: string; metodo: string; persona?: string; concepto: string; feria?: string }[];
  personas?: { nombre: string; rol?: string | null; categoria?: string | null; notas?: string | null; veces: number }[];
  memoria?: { id: string; texto: string }[];
  categorias?: { nombre: string; sentido: "ingreso" | "gasto" }[]; aprendido?: { clave: string; sentido: string; categoria: string }[];
  tipoCambio?: { compra: number; venta: number } | null; pendientes?: string[]; seccion?: string;
};
type Turno = { de: "ella" | "asis"; texto: string };

const SECCIONES: Seccion[] = ["inicio", "plata", "tienda", "ferias", "anuncios"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function herramientas(cats: string[]) {
  const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) =>
    ({ type: "function", name, description, parameters: { type: "object", properties, required, additionalProperties: false }, strict: false });
  const talla = { type: "object", properties: { talla: { type: "string" }, existencias: { type: ["number", "null"], description: "Cuántas hay de esa talla; null si no lo dijo" } }, required: ["talla", "existencias"] };
  return [
    fn("registrar_movimientos", "Anota plata que entró (ventas, pagos de clientas) o salió (gastos). Uno o varios a la vez. Siempre incluí el nombre de la persona si se sabe.", {
      movimientos: { type: "array", items: { type: "object", properties: {
        sentido: { type: "string", enum: ["ingreso", "gasto"] },
        monto: { type: "number", description: "Mayor que 0, en la moneda indicada" },
        moneda: { type: "string", enum: ["CRC", "USD"] },
        categoria: { type: "string", enum: [...cats, "desconocida"], description: "Si no estás segura en cuál va un gasto, 'desconocida' (el panel le pregunta y aprende)" },
        metodo: { type: "string", enum: METODOS },
        concepto: { type: "string", description: "Nota corta en palabras de Andrea (qué se vendió o pagó)" },
        persona: { type: "string", description: "A quién le pagó o quién le pagó/compró. Vacío si no aplica" },
        feria: { type: "string", description: "Nombre exacto de una feria de la lista, si fue en una feria" },
        fecha: { type: "string", description: "AAAA-MM-DD" },
      }, required: ["sentido", "monto", "moneda", "categoria", "metodo", "concepto", "persona", "feria", "fecha"] } },
    }, ["movimientos"]),
    fn("preguntar", "Hacele UNA pregunta a Andrea cuando falta algo importante o no estás segura de lo que quiso decir. Dale opciones cortas para tocar.", {
      pregunta: { type: "string" }, opciones: { type: "array", items: { type: "string" }, description: "2 a 6 respuestas cortas posibles" },
    }, ["pregunta", "opciones"]),
    fn("anular_movimiento", "Anula un movimiento anotado por error (queda tachado y no cuenta).", { id: { type: "string", description: "id exacto de la lista de movimientos" } }, ["id"]),
    fn("guardar_persona", "Recuerda a una persona con la que Andrea hace negocio (clienta, proveedora, costurera…) y lo que hay que saber de ella.", {
      nombre: { type: "string" }, rol: { type: "string", enum: ["clienta", "proveedor", "otro"] }, categoria: { type: "string", description: "Categoría de gasto de siempre, si es proveedora" }, notas: { type: "string" },
    }, ["nombre", "rol"]),
    fn("recordar", "Guarda un dato útil del negocio que Andrea quiere que recuerdes (precios de proveedores, costumbres, fechas fijas).", { texto: { type: "string" } }, ["texto"]),
    fn("olvidar", "Borra algo que tenías anotado en tu memoria.", { id: { type: "string" } }, ["id"]),
    fn("cambiar_precio", "Cambia el precio de una pieza.", { slug: { type: "string" }, precio: { type: "number" } }, ["slug", "precio"]),
    fn("mostrar_u_ocultar", "Esconde una pieza de la tienda (agotada) o la vuelve a mostrar.", { slug: { type: "string" }, visible: { type: "boolean" } }, ["slug", "visible"]),
    fn("cambiar_tallas", "Actualiza las tallas de una pieza y cuántas quedan de cada una.", { slug: { type: "string" }, tallas: { type: "array", items: talla } }, ["slug", "tallas"]),
    fn("crear_coleccion", "Crea una colección nueva. Si ya dijo qué piezas van en ella, pasalas en 'piezas' y quedan metidas de una.", {
      nombre: { type: "string" }, piezas: { type: "array", items: { type: "string" }, description: "slugs de piezas que YA EXISTEN y van en la colección" },
    }, ["nombre"]),
    fn("mover_a_coleccion", "Mete una o varias piezas que YA EXISTEN en la lista a una colección (meter, poner, pasar, agregar a la colección). Si la colección no existe, se crea sola. Para sacarla de toda colección, coleccion vacía.", {
      piezas: { type: "array", items: { type: "string" }, description: "slugs de las piezas" }, coleccion: { type: "string" },
    }, ["piezas", "coleccion"]),
    fn("crear_producto", "Abre la ficha para meter una prenda NUEVA que todavía no está en la lista de piezas: foto (y la foto de estudio con IA), nombre, tipo, precio, tallas con cuántas hay, colección y descripción. Pasá todo lo que Andrea ya dijo; la ficha le pide lo que falte. Si la prenda ya está en la lista, NO uses esto.", {
      nombre: { type: "string" }, tipo: { type: "string", enum: TIPOS_PIEZA.slice(0, -1) }, precio: { type: "number" }, coleccion: { type: "string" },
      descripcion: { type: "string" }, tallas: { type: "array", items: talla },
    }),
    fn("crear_feria", "Abre la ficha para anotar una feria (con buscador del lugar en el mapa).", {
      nombre: { type: "string" }, fecha: { type: "string", description: "AAAA-MM-DD" }, lugar: { type: "string", description: "Lugar como lo dijo, para buscarlo en el mapa" },
    }),
    fn("borrar_feria", "Borra una feria de la lista.", { id: { type: "string", description: "id exacto de la feria" } }, ["id"]),
    fn("promocionar", "Empieza a promocionar en Instagram un post o una historia: ella escoge cuál, desde cuándo, cuántos días (1 a 30), cuánto por día (cualquier monto desde el mínimo de Meta) y si lleva música; la IA propone a quién mostrarlo. Nunca cobra sin su autorización. Si ya dijo días, monto o música, pasalos.", {
      que: { type: "string", enum: ["post", "story"] }, dias: { type: "number", description: "Cuántos días, si lo dijo" },
      por_dia: { type: "number", description: "Colones por día, si lo dijo" }, musica: { type: "boolean", description: "Si quiere música (o no), si lo dijo" },
    }, ["que"]),
    fn("publicar_en_instagram", "Abre el paso para subir un post o una historia nueva a Instagram desde el panel (foto + texto).", {
      que: { type: "string", enum: ["post", "story"] }, idea: { type: "string", description: "De qué quiere que hable el texto, si lo dijo" },
      etiquetas: { type: "array", items: { type: "string" }, description: "Usuarios de Instagram que quiere etiquetar (sin @), si los dijo" },
    }, ["que"]),
    fn("disenar_post", "Abre el diseñador de posts con IA (como Canva): Andrea escoge la foto, la IA escribe los textos y lo arma con su logo (y el de la organizadora si es una feria); después lo guarda o lo publica en Instagram. Usalo cuando quiere hacer un post, un arte, un flyer o una historia para una feria, una colección nueva, una prenda, una oferta u otra cosa.", {
      tipo: { type: "string", enum: ["feria", "coleccion", "prenda", "oferta", "otro"] },
      feria: { type: "string", description: "id o nombre de la feria, si es de una feria" },
      coleccion: { type: "string", description: "nombre de la colección, si es de una colección" },
      pieza: { type: "string", description: "slug de la prenda, si es de una prenda" },
      texto: { type: "string", description: "lo que Andrea quiere que diga el post, con sus palabras" },
    }),
    fn("mejorar_foto", "Abre el paso para subir o escoger una foto de una pieza y mejorarla con IA.", { slug: { type: "string" } }),
    fn("rehacer_foto_ia", "Cuando Andrea dice que la foto de producto hecha con IA de una pieza tiene un error (color, largo, mangas, detalles…). Muestra el cuadro para decir qué está mal y hacerla otra vez.", { slug: { type: "string" }, que_esta_mal: { type: "string", description: "Lo que está mal, con las palabras de Andrea, si ya lo dijo" } }, ["slug"]),
    fn("ir_a", "Lleva a Andrea a una sección del panel. Si va a hacer algo allá, poné la tarea: el panel la guía paso a paso (le dice qué tocar y se lo resalta) hasta que termina. Usalo para lo que no se puede hacer aquí en el chat.", {
      seccion: { type: "string", enum: SECCIONES }, boton: { type: "string", description: "Texto corto del botón, ej.: «Llevame»" },
      tarea: { type: "string", enum: [...TAREAS], description: "Lo que va a hacer allá" },
      pieza: { type: "string", description: "slug de la pieza, si la tarea es de una pieza" },
      feria: { type: "string", description: "nombre de la feria, si la tarea es de una feria" },
    }, ["seccion", "boton"]),
    fn("mostrar_resumen", "Muestra la etiqueta con lo que entró, salió y le queda este mes."),
    fn("mostrar_reporte", "Muestra el reporte del mes con el análisis y recomendaciones."),
  ];
}

export async function POST(req: Request) {
  const bloqueo = await permitido(req);
  if (bloqueo) return bloqueo;
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ motor: "local" }, { status: 501 });

  const body = (await req.json().catch(() => null)) as { texto?: string; contexto?: Contexto; historial?: Turno[]; porVoz?: boolean } | null;
  const texto = body?.texto?.slice(0, 1500).trim();
  const ctx = body?.contexto;
  if (!texto || !ctx) return NextResponse.json({ error: "Falta el texto." }, { status: 400 });

  const piezas = (ctx.piezas ?? []).slice(0, 300);
  const propias = (ctx.categorias ?? []).slice(0, 60);
  const cats = [...new Set([...CATS.ingreso, ...CATS.gasto, ...propias.map((c) => c.nombre)])];
  const h = hoy();
  const diaSemana = DIAS_SEMANA[new Date(h + "T12:00:00Z").getUTCDay()];

  const sistema = [
    "Sos la asistente personal de Andrea Bermúdez, dueña de Eucalipto Chic, una marca de ropa de mujer en Costa Rica. Le ayudás con la plata, la tienda en línea, las ferias e Instagram.",
    "Personalidad: cálida, tranquila, profesional y muy resolutiva, como una mano derecha de confianza. Hablás en español de Costa Rica con voseo, natural y con cariño, sin exagerar. Andrea casi siempre te habla por voz desde el celular y tus respuestas se leen en voz alta: respondé en 1 o 2 frases cortas, sin listas, sin emojis, sin símbolos raros, sin tecnicismos. Nunca digás que sos una IA ni hablés de herramientas.",
    "Tu trabajo es quitarle problemas, no dárselos: hacé las cosas vos con las herramientas, anticipá lo que va a ocupar y proponé el siguiente paso. Si algo sale raro, explicalo simple y ofrecé la solución.",
    "Nunca inventés montos, precios, nombres, fechas ni piezas. Si falta algo esencial o lo que dijo se puede entender de dos formas, usá 'preguntar' con UNA pregunta corta. Preguntá una sola cosa por vez y lo más importante primero (el monto antes que el nombre). Si estás segura, no preguntés de más.",
    "Las opciones de 'preguntar' son respuestas reales que ella puede tocar: nombres que ya conocés, montos o fechas probables, categorías, 'No me acuerdo', 'Prefiero no decir'. Nunca pongás instrucciones como 'Decir el monto' o 'Decime el nombre': si la respuesta es libre (un nombre nuevo, un monto), ponés solo las opciones útiles y ella contesta hablando.",
    "Si dice que vendió una pieza y no dice cuánto, usá el precio de la pieza; si la pieza no tiene precio, preguntá cuánto fue. En la nota (concepto) poné qué se vendió o pagó con sus palabras.",
    "Plata: usá registrar_movimientos (puede ser varios a la vez). Incluí siempre el nombre de la persona cuando lo diga. Si le pagó a una persona (costurera, planchado, mensajero, ayudante…) y no dijo a quién, preguntale el nombre ofreciendo las personas que ya conocés y 'Prefiero no decir'. Si una venta fue por SINPE o transferencia y no dijo de quién, preguntale de quién fue (con la opción 'No me acuerdo'); en ventas de feria no hace falta. Si la persona ya la conocés y tiene categoría de siempre, usala.",
    "Categorías: si un gasto no calza claramente en una categoría, usá 'desconocida' y el panel le pregunta y lo aprende. Respetá lo aprendido. Si no dice cómo pagó: SINPE. 'Datáfono' es el MiPos de BAC.",
    "Fechas: hoy es " + `${diaSemana} ${h}` + ". Entendé 'ayer', 'el sábado', 'el 15'. Montos en colones salvo que diga dólares; '45 mil' = 45000; 'un rojo' = 1000; 'una teja' = 100000.",
    "Productos: si quiere meter una prenda NUEVA, llamá crear_producto con todo lo que ya dijo (en la descripción poné tela, color y detalles que mencionó); la ficha le pide la foto, las tallas, cuántas hay de cada una y el precio, y ahí mismo le hace la foto de estudio con IA. Si dice cuántas le quedan de algo, usá cambiar_tallas.",
    "Reconocé las piezas aunque las diga distinto o sin tildes ('el top perú', 'la lima', 'el vestido verde de ginebra'): buscalas en la lista de piezas. Antes de abrir una ficha de producto nuevo, revisá que esa prenda no esté ya en la lista.",
    "Colecciones: 'meter/poner/pasar/agregar [una pieza que ya está en la lista] a la colección X' es mover_a_coleccion, NUNCA crear_producto. Si la colección no existe, se crea sola al meterle la pieza; decíselo en la frase. Si quiere hacer una colección nueva, usá crear_coleccion y, si ya dijo qué piezas van, metelas de una en 'piezas'; si no lo dijo, preguntale con 'preguntar' cuáles piezas van, ofreciendo como opciones las piezas más nuevas o sin colección y 'Ninguna por ahora'. Si no queda claro si quiere crear una colección o meter una prenda a una colección que ya existe, preguntale eso mismo con opciones reales (por ejemplo «Crear la colección Viajando por el mundo» y «Meter el Top Perú a esa colección»). Usá el nombre de la colección tal como está en la lista si ya existe. Si quiere ver sus colecciones o arreglarlas con calma, llevala con ir_a y la tarea ver_colecciones (en Tienda → Colecciones ve cada colección con sus prendas).",
    "Ferias: crear_feria abre la ficha con el buscador de lugares; pasá el lugar tal como lo dijo. Instagram: 'promocionar' para dar alcance a un post o historia, 'publicar_en_instagram' para subir una foto tal cual, y 'disenar_post' cuando quiere hacer un post, arte, flyer o historia diseñada (para una feria, una colección nueva, una prenda, una oferta…): el diseñador le pide la foto, el logo de la organizadora si es una feria y lo que quiere que diga, y lo arma con su logo.",
    "Memoria: si te cuenta algo estable que conviene recordar (quién es alguien, cuánto cobra un proveedor, costumbres), guardalo con guardar_persona o recordar. Usá tu memoria para responder mejor.",
    "Preguntas sobre plata o el negocio: respondé con los números de los movimientos y resúmenes de abajo, exactos y en colones. Si no tenés el dato, decilo y ofrecé anotarlo.",
    "Si Andrea solo saluda y hay preguntas pendientes, saludala y mencioná con suavidad solo la primera pendiente.",
    "Todo lo que se guarda pasa por un botón de confirmación que ve Andrea; cuando propongás guardar, decí en una frase qué entendiste.",
    "Andrea te habla por voz y el audio se pasa a texto: si una palabra suena rara, interpretá lo más probable con las piezas, personas, colecciones y ferias que conocés ('la blusa lima' aunque llegue 'la blusa Lina'). Si no estás segura entre dos cosas, preguntá con esas dos como opciones.",
    "Si corrige tu propuesta anterior ('no, eran 18 mil', 'era la kiwi, no la lima'), volvé a proponer todo con la corrección. Si dice 'borrá lo último' o 'me equivoqué en eso', anulá ese movimiento (anular_movimiento con su id).",
    "Si en un mismo mensaje pide varias cosas, hacelas todas a la vez (varias herramientas). Si algo no se puede hacer aquí en el chat, llevala con ir_a y la tarea, así el panel la guía paso a paso.",
    "Ejemplos de qué hacer: «vendí dos lima en efectivo» → registrar_movimientos (2 × el precio de Blusa Lima, efectivo). «le pagué 15 a Juanita» → gasto de 15000 a Juanita con su categoría de siempre. «mete el top perú a viajando por el mundo» → mover_a_coleccion. «quiero hacer la colección Navidad con la roja y la verde» → crear_coleccion con esas piezas. «quiero hacer una colección» → preguntar el nombre. «quiero meter una blusa nueva» → crear_producto. «quedan 3 S-M de la kiwi» → cambiar_tallas. «se agotó la lima» → cambiar_tallas con 0 en todas sus tallas. «hacé un post para la feria del sábado» → disenar_post tipo feria con esa feria. «la foto de la lau salió con otro color» → rehacer_foto_ia. «quiero cambiar la foto grande de la página» → ir_a con tarea foto_de_la_pagina. «promocioná el último post» → promocionar. «¿cuánto vendí en la feria?» → respondé con los números.",
    "",
    `Sección donde está Andrea: ${ctx.seccion ?? "inicio"}.`,
    `Piezas (slug | nombre | precio | tipo | colección | tallas(cantidad) | estado): ${piezas.map((p) => `${p.slug}|${p.nombre}|${p.precio}|${p.tipo}|${p.coleccion || "-"}|${(p.tallas ?? []).map((t) => t.talla + (t.existencias != null ? `(${t.existencias})` : "")).join(" ") || "-"}|${p.oculta ? "escondida" : "visible"}${p.sinFoto ? ", sin foto" : ""}`).join("; ")}`,
    `Colecciones: ${(ctx.colecciones ?? []).join(", ") || "ninguna"}.`,
    `Ferias (id | nombre | fecha | lugar): ${(ctx.ferias ?? []).map((f) => `${f.id}|${f.nombre}|${f.fecha}|${f.lugar ?? "-"}`).join("; ") || "ninguna"}.`,
    `Personas que conocés: ${(ctx.personas ?? []).slice(0, 60).map((p) => `${p.nombre} (${p.rol ?? "-"}${p.categoria ? ", " + p.categoria : ""}${p.notas ? ", " + p.notas : ""}, ${p.veces} veces)`).join("; ") || "nadie todavía"}.`,
    `Tu memoria (id | dato): ${(ctx.memoria ?? []).slice(-60).map((m) => `${m.id}|${m.texto}`).join("; ") || "vacía"}.`,
    `Categorías propias: ${propias.map((c) => `${c.nombre} (${c.sentido})`).join(", ") || "ninguna"}. Aprendido: ${(ctx.aprendido ?? []).slice(-80).map((l) => `«${l.clave}» → ${l.categoria}`).join("; ") || "nada"}.`,
    `Resumen: ${ctx.resumen}`,
    `Últimos movimientos (id | fecha | entró/salió | colones | categoría | método | persona | detalle | feria): ${(ctx.movs ?? []).slice(0, 40).map((m) => `${m.id}|${m.fecha}|${m.sentido === "ingreso" ? "entró" : "salió"}|${Math.round(m.crc)}|${m.categoria}|${m.metodo}|${m.persona ?? "-"}|${m.concepto}|${m.feria ?? "-"}`).join("; ") || "ninguno"}.`,
    `Preguntas pendientes de la revisión: ${(ctx.pendientes ?? []).join(" / ") || "ninguna"}.`,
    ctx.tipoCambio ? `Dólar hoy (Hacienda): compra ${ctx.tipoCambio.compra}, venta ${ctx.tipoCambio.venta}.` : "",
  ].join("\n");

  const historial = (body?.historial ?? []).slice(-16).filter((t) => t?.texto)
    .map((t) => ({ role: t.de === "ella" ? "user" : "assistant", content: String(t.texto).slice(0, 900) }));

  try {
    const j = await responses({
      instructions: sistema,
      input: [...historial, { role: "user", content: texto }],
      tools: herramientas(cats),
      tool_choice: "auto",
      parallel_tool_calls: true,
      reasoning: { effort: process.env.OPENAI_EFFORT || "medium" },
      max_output_tokens: 5000,
    }, 50_000);

    const acciones: Accion[] = [];
    const tarjetas: { t: Tarjeta; texto: string; p: number }[] = [];
    for (const item of j.output ?? []) {
      if (item.type !== "function_call") continue;
      let a: Record<string, unknown> = {};
      try { a = JSON.parse(item.arguments ?? "{}"); } catch { continue; }
      for (const res of convertir(item.name, a, piezas, ctx)) {
        if ("tarjeta" in res) tarjetas.push({ t: res.tarjeta, texto: res.texto, p: res.p }); else acciones.push(res);
      }
    }
    // Lo más importante primero: una pregunta, después pasos con ficha, después lo que hay que confirmar.
    tarjetas.sort((x, y) => x.p - y.p);
    const principal = tarjetas[0];
    let tarjeta: Tarjeta | undefined;
    let porDefecto = "";
    if (principal && (principal.p <= 2 || !acciones.length)) { tarjeta = principal.t; porDefecto = principal.texto; }
    else if (acciones.length) tarjeta = { tipo: "confirmar", acciones };
    const dicho = textoDe(j).trim();
    const respuesta = (principal?.t.tipo === "opciones" ? principal.texto : dicho) || porDefecto
      || (acciones.length ? resumir(acciones) : "Perdón, no te entendí bien. ¿Me lo decís de otra forma?");
    return NextResponse.json({ motor: "openai", respuesta, acciones: tarjeta?.tipo === "confirmar" ? acciones : [], tarjeta });
  } catch (e) {
    console.error("[asistente]", e instanceof Error ? e.message : e);
    return NextResponse.json({ motor: "local", error: "La IA no respondió; usé el asistente básico." }, { status: 502 });
  }
}

type Res = Accion | { tarjeta: Tarjeta; texto: string; p: number };

const FORMA: Record<string, string> = { SINPE: "por SINPE", Efectivo: "en efectivo", "Datáfono": "por datáfono", Transferencia: "por transferencia", Tarjeta: "con tarjeta", ONVO: "por la web" };

/** Lo que entendió, dicho como lo diría una persona (se lee en voz alta). */
function resumir(acciones: Accion[]) {
  const movs = acciones.filter((a): a is Movimiento => a.tipo === "movimiento");
  const partes: string[] = [];
  if (movs.length) {
    const plata = (m: Movimiento) => (m.moneda === "USD" ? `$${m.monto}` : fmt(m.monto));
    const frases = movs.map((m) => `${plata(m)} ${FORMA[m.metodo] ?? ""}${m.persona ? (m.sentido === "ingreso" ? " de " : " a ") + m.persona : ""}`.trim());
    const lista = frases.length > 1 ? frases.slice(0, -1).join(", ") + " y " + frases.at(-1) : frases[0];
    const cats = [...new Set(movs.map((m) => m.categoria))];
    const verbo = movs.every((m) => m.sentido === "ingreso") ? "entraron" : movs.every((m) => m.sentido === "gasto") ? "salieron" : "se movieron";
    partes.push(`Anoto que ${verbo} ${lista}${cats.length === 1 ? `, en ${cats[0]}` : ""}`);
  }
  for (const a of acciones.filter((a) => a.tipo !== "movimiento")) partes.push(describir(a));
  return partes.join(". ") + ". ¿Lo guardo?";
}

/** Valida lo que propuso la IA: solo pasa lo que tiene sentido para la tienda. */
function convertir(nombre: string | undefined, a: Record<string, unknown>, piezas: PiezaCtx[], ctx: Contexto): Res[] {
  const id = () => crypto.randomUUID();
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);
  const txt = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  /** La pieza por slug; si la IA mandó el nombre (o algo parecido), la busca por nombre. */
  const pieza = (v: unknown): PiezaCtx | null => {
    if (typeof v !== "string" || !v.trim()) return null;
    const exacta = piezas.find((p) => p.slug === v);
    if (exacta) return exacta;
    const q = norm(v.replace(/-/g, " "));
    return piezas.find((p) => norm(p.nombre) === q) ?? (buscarPieza(q, piezas as unknown as Pieza[]) as unknown as PiezaCtx | null);
  };
  /** La colección como está escrita si ya existe (sin importar mayúsculas ni tildes). */
  const coleccion = (v: unknown) => {
    const t = txt(v, 40);
    return t ? (ctx.colecciones ?? []).find((c) => norm(c) === norm(t)) ?? t : null;
  };
  const lista = (v: unknown, extra?: unknown) => [...new Map([...(Array.isArray(v) ? v : []), extra].map(pieza).filter((p): p is PiezaCtx => !!p).map((p) => [p.slug, p])).values()].slice(0, 40);
  const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : hoy());
  const tallas = (v: unknown): Talla[] => (Array.isArray(v) ? v : []).slice(0, 12).flatMap((t) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const talla = txt(o.talla, 30);
    const ex = typeof o.existencias === "number" && o.existencias >= 0 ? Math.round(o.existencias) : null;
    return talla ? [{ talla, existencias: ex }] : [];
  });

  switch (nombre) {
    case "registrar_movimientos": {
      const lista = Array.isArray(a.movimientos) ? a.movimientos.slice(0, 10) : [];
      const out: Res[] = [];
      for (const x of lista as Record<string, unknown>[]) {
        const sentido = x.sentido === "ingreso" || x.sentido === "gasto" ? x.sentido : null;
        const monto = num(x.monto);
        if (!sentido || !monto) continue;
        const validas = [...CATS[sentido], ...(ctx.categorias ?? []).filter((c) => c.sentido === sentido).map((c) => c.nombre)];
        const desconocida = !validas.includes(String(x.categoria));
        const mov: Movimiento = {
          id: id(), tipo: "movimiento", sentido, monto, moneda: x.moneda === "USD" ? "USD" : "CRC",
          categoria: desconocida ? (sentido === "gasto" ? "Otro" : "Venta directa") : String(x.categoria),
          metodo: METODOS.includes(String(x.metodo)) ? String(x.metodo) : "SINPE",
          concepto: txt(x.concepto, 200) ?? String(x.categoria),
          feria: ctx.ferias.find((f) => f.nombre === x.feria)?.nombre, fecha: fecha(x.fecha),
          persona: txt(x.persona, 80) ?? undefined,
        };
        if (sentido === "gasto" && desconocida && lista.length === 1) {
          out.push({ tarjeta: { tipo: "categoria", mov }, texto: "Ese gasto no lo conozco todavía. ¿En cuál categoría va? Así lo aprendo.", p: 1 });
        } else out.push(mov);
      }
      return out;
    }
    case "preguntar": {
      const pregunta = txt(a.pregunta, 200);
      const ops = (Array.isArray(a.opciones) ? a.opciones : []).map((o) => txt(o, 40)).filter((o): o is string => !!o).slice(0, 6);
      return pregunta ? [{ tarjeta: { tipo: "opciones", ops }, texto: pregunta, p: 0 }] : [];
    }
    case "anular_movimiento": {
      const m = (ctx.movs ?? []).find((x) => x.id === a.id);
      return m ? [{ id: id(), tipo: "anular", mov: m.id, nombre: `${m.concepto} (₡${Math.round(m.crc).toLocaleString("es-CR")})` }] : [];
    }
    case "guardar_persona": {
      const n = txt(a.nombre, 80);
      const rol = a.rol === "clienta" || a.rol === "proveedor" || a.rol === "otro" ? a.rol : undefined;
      return n ? [{ id: id(), tipo: "persona", nombre: n, rol, categoria: txt(a.categoria, 40) ?? undefined, notas: txt(a.notas, 300) ?? undefined }] : [];
    }
    case "recordar": {
      const t = txt(a.texto, 300);
      return t ? [{ id: id(), tipo: "recordar", texto: t }] : [];
    }
    case "olvidar": {
      const m = (ctx.memoria ?? []).find((x) => x.id === a.id);
      return m ? [{ id: id(), tipo: "olvidar", memoria: m.id, texto: m.texto }] : [];
    }
    case "cambiar_precio": {
      const p = pieza(a.slug), precio = num(a.precio);
      return p && precio ? [{ id: id(), tipo: "precio", slug: p.slug, nombre: p.nombre, precio }] : [];
    }
    case "mostrar_u_ocultar": {
      const p = pieza(a.slug);
      return p && typeof a.visible === "boolean" ? [{ id: id(), tipo: "visible", slug: p.slug, nombre: p.nombre, visible: a.visible }] : [];
    }
    case "cambiar_tallas": {
      const p = pieza(a.slug), t = tallas(a.tallas);
      return p && t.length ? [{ id: id(), tipo: "tallas", slug: p.slug, nombre: p.nombre, tallas: t }] : [];
    }
    case "crear_coleccion": {
      const n = coleccion(a.nombre);
      if (!n) return [];
      const nueva = !(ctx.colecciones ?? []).includes(n);
      const mover: Res[] = lista(a.piezas).map((p) => ({ id: id(), tipo: "mover", slug: p.slug, nombre: p.nombre, coleccion: n }));
      return [...(nueva ? [{ id: id(), tipo: "coleccion" as const, nombre: n }] : []), ...mover];
    }
    case "mover_a_coleccion": {
      const c = a.coleccion === "" ? "" : coleccion(a.coleccion);
      if (c === null) return [];
      return lista(a.piezas, a.slug).map((p) => ({ id: id(), tipo: "mover", slug: p.slug, nombre: p.nombre, coleccion: c }));
    }
    case "crear_producto": {
      const t = tallas(a.tallas);
      const tipo = TIPOS_PIEZA.includes(String(a.tipo)) ? String(a.tipo) : undefined;
      return [{ tarjeta: { tipo: "producto", borrador: {
        nombre: txt(a.nombre, 60) ?? undefined, tipoPieza: tipo, precio: num(a.precio) ?? undefined,
        coleccion: txt(a.coleccion, 40) ?? undefined, descripcion: txt(a.descripcion, 600) ?? undefined, tallas: t.length ? t : undefined,
      } }, texto: "¡Qué bueno! Llenemos la ficha. Empezá por la foto.", p: 2 }];
    }
    case "crear_feria": return [{ tarjeta: { tipo: "feria", borrador: {
      nombre: txt(a.nombre, 60) ?? undefined, fecha: typeof a.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha) ? a.fecha : undefined, lugar: txt(a.lugar, 120) ?? undefined,
    } }, texto: "Dale, anotemos la feria. Confirmá el lugar en el mapa.", p: 2 }];
    case "borrar_feria": {
      const f = ctx.ferias.find((x) => x.id === a.id);
      return f ? [{ id: id(), tipo: "borrar_feria", feria: f.id, nombre: f.nombre }] : [];
    }
    case "promocionar": {
      const que = a.que === "story" ? "story" : "post";
      const dias = typeof a.dias === "number" && a.dias >= 1 && a.dias <= 30 ? Math.round(a.dias) : undefined;
      const porDia = typeof a.por_dia === "number" && a.por_dia >= 300 && a.por_dia <= 50_000 ? Math.round(a.por_dia) : undefined;
      return [{ tarjeta: { tipo: "posts", que, dias, porDia, musica: typeof a.musica === "boolean" ? a.musica : undefined }, texto: que === "story" ? "¡Dale! Escogé la historia que querés que vea más gente." : "¡Dale! Escogé el post que querés que vea más gente.", p: 2 }];
    }
    case "publicar_en_instagram": {
      const que = a.que === "story" ? "story" : "post";
      const etiquetas = (Array.isArray(a.etiquetas) ? a.etiquetas : []).map((u) => String(u).replace(/^@/, "").toLowerCase()).filter((u) => /^[a-z0-9._]{1,30}$/.test(u)).slice(0, 20);
      return [{ tarjeta: { tipo: "publicar", que, caption: txt(a.idea, 300) ?? undefined, etiquetas: etiquetas.length ? etiquetas : undefined }, texto: "Hagámoslo. Escogé la foto y te ayudo con el texto.", p: 2 }];
    }
    case "mejorar_foto": {
      const p = pieza(a.slug);
      return [{ tarjeta: { tipo: "foto", slug: p?.slug }, texto: p ? `Subí la foto de ${p.nombre} y la mejoramos.` : "¿De cuál pieza es la foto?", p: 2 }];
    }
    case "disenar_post": {
      const tipo = ["feria", "coleccion", "prenda", "oferta", "otro"].includes(String(a.tipo)) ? (a.tipo as "feria") : undefined;
      const fe = txt(a.feria, 80);
      const f = fe ? ctx.ferias.find((x) => x.id === fe || norm(x.nombre).includes(norm(fe))) : undefined;
      return [{ tarjeta: { tipo: "disenar", pre: { tipo, feria: f?.id ?? fe ?? undefined, coleccion: coleccion(a.coleccion) ?? undefined, slug: pieza(a.pieza)?.slug, texto: txt(a.texto, 400) ?? undefined } },
        texto: "¡Hagámoslo! Escogé la foto y yo escribo los textos y lo armo con tu logo.", p: 2 }];
    }
    case "rehacer_foto_ia": {
      const p = pieza(a.slug);
      return p
        ? [{ tarjeta: { tipo: "rehacer", slug: p.slug, texto: txt(a.que_esta_mal, 400) ?? undefined }, texto: `Contame qué está mal en la foto de ${p.nombre} y la hago otra vez.`, p: 2 }]
        : [{ tarjeta: { tipo: "ir", seccion: "tienda", boton: "Escoger la pieza en Tienda", tarea: "rehacer_foto" }, texto: "¿De cuál pieza es la foto que salió mal? También la podés buscar en Tienda.", p: 5 }];
    }
    case "ir_a": {
      const tarea = (TAREAS as readonly string[]).includes(String(a.tarea)) ? (a.tarea as Tarea) : undefined;
      const s = tarea ? seccionDe(tarea) : SECCIONES.includes(a.seccion as Seccion) ? (a.seccion as Seccion) : null;
      const pz = tarea ? pieza(a.pieza) : undefined;
      const fe = tarea && a.feria ? txt(a.feria, 80) ?? undefined : undefined;
      return s ? [{ tarjeta: { tipo: "ir", seccion: s, boton: txt(a.boton, 30) ?? "Llevame", tarea, slug: pz?.slug, feria: fe }, texto: tarea ? "Te llevo y te voy diciendo qué tocar." : "Te llevo.", p: 4 }] : [];
    }
    case "mostrar_resumen": return [{ tarjeta: { tipo: "resumen" }, texto: "Así vas este mes.", p: 4 }];
    case "mostrar_reporte": return [{ tarjeta: { tipo: "reporte" }, texto: "Aquí está tu reporte del mes.", p: 4 }];
  }
  return [];
}
