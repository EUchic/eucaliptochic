import { NextResponse } from "next/server";
import { CATS, METODOS, hoy, type Accion, type Pieza } from "@/lib/asistente";
import type { Movimiento, Seccion, Tarjeta } from "@/lib/cerebro";

// El asistente con IA (OpenAI, Responses API). Entiende lo que Andrea dice y propone acciones o abre pasos en el chat;
// nunca guarda nada por su cuenta. Sin OPENAI_API_KEY responde 501 y el panel usa el cerebro local (lib/cerebro.ts).

export const dynamic = "force-dynamic";

type Contexto = {
  piezas: Pieza[]; colecciones: string[]; ferias: { id: string; nombre: string; fecha: string; lugar?: string }[]; resumen: string;
  categorias?: { nombre: string; sentido: "ingreso" | "gasto" }[]; aprendido?: { clave: string; sentido: string; categoria: string }[];
  tipoCambio?: { compra: number; venta: number } | null;
};
type Turno = { de: "ella" | "asis"; texto: string };

const SECCIONES: Seccion[] = ["inicio", "plata", "tienda", "ferias", "anuncios"];

function herramientas(cats: string[]) {
  const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) =>
    ({ type: "function", name, description, parameters: { type: "object", properties, required, additionalProperties: false }, strict: false });
  return [
    fn("registrar_movimiento", "Anota plata que entró (venta, pago de una clienta) o salió (gasto). Si no sabés con certeza en qué categoría va un gasto, usá categoria 'desconocida' y el panel le pregunta a Andrea.", {
      sentido: { type: "string", enum: ["ingreso", "gasto"] },
      monto: { type: "number", description: "Monto en la moneda indicada, mayor que 0" },
      moneda: { type: "string", enum: ["CRC", "USD"] },
      categoria: { type: "string", enum: [...cats, "desconocida"] },
      metodo: { type: "string", enum: METODOS },
      concepto: { type: "string", description: "Nota corta con las palabras de Andrea" },
      feria: { type: "string", description: "Nombre exacto de una feria de la lista, si aplica" },
      fecha: { type: "string", description: "AAAA-MM-DD" },
    }, ["sentido", "monto", "moneda", "categoria", "metodo", "concepto", "fecha"]),
    fn("cambiar_precio", "Cambia el precio de una pieza de la tienda.", { slug: { type: "string" }, precio: { type: "number" } }, ["slug", "precio"]),
    fn("mostrar_u_ocultar", "Esconde una pieza de la tienda (agotada) o la vuelve a mostrar.", { slug: { type: "string" }, visible: { type: "boolean" } }, ["slug", "visible"]),
    fn("crear_coleccion", "Crea una colección nueva.", { nombre: { type: "string" } }, ["nombre"]),
    fn("mover_a_coleccion", "Pasa una pieza a una colección.", { slug: { type: "string" }, coleccion: { type: "string" } }, ["slug", "coleccion"]),
    fn("crear_pieza", "Agrega una pieza nueva a la tienda (sin fotos todavía).", {
      nombre: { type: "string" }, tipo: { type: "string", enum: ["Blusas", "Tops", "Suéteres", "Pañuelos", "Pantalones", "Faldas", "Vestidos", "Enterizos"] },
      precio: { type: "number" }, coleccion: { type: "string" },
    }, ["nombre", "tipo", "precio"]),
    fn("crear_feria", "Anota una feria a la que Andrea va a ir o fue.", { nombre: { type: "string" }, fecha: { type: "string", description: "AAAA-MM-DD" } }, ["nombre", "fecha"]),
    fn("borrar_feria", "Borra una feria de la lista (por ejemplo si se canceló o se anotó por error).", { id: { type: "string", description: "id exacto de la feria" } }, ["id"]),
    fn("promocionar_post", "Empieza a promocionar un post de Instagram: el panel le muestra sus posts para que escoja, y después días y monto. Nunca cobra sin su autorización."),
    fn("mejorar_foto", "Abre el paso para subir o escoger una foto de una pieza y mejorarla con IA.", { slug: { type: "string", description: "slug de la pieza, si se sabe" } }),
    fn("ir_a", "Lleva a Andrea a una sección del panel cuando pregunta dónde está algo o quiere verlo.", {
      seccion: { type: "string", enum: SECCIONES }, boton: { type: "string", description: "Texto corto del botón, ej. 'Ir a Ferias'" },
    }, ["seccion", "boton"]),
    fn("mostrar_resumen", "Muestra la tarjeta con lo que entró, salió y le queda este mes."),
  ];
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ motor: "local" }, { status: 501 });

  const body = (await req.json().catch(() => null)) as { texto?: string; contexto?: Contexto; historial?: Turno[] } | null;
  const texto = body?.texto?.slice(0, 1500).trim();
  const ctx = body?.contexto;
  if (!texto || !ctx) return NextResponse.json({ error: "Falta el texto." }, { status: 400 });

  const piezas = (ctx.piezas ?? []).slice(0, 300);
  const propias = (ctx.categorias ?? []).slice(0, 60);
  const cats = [...new Set([...CATS.ingreso, ...CATS.gasto, ...propias.map((c) => c.nombre)])];
  const sistema = [
    "Sos el asistente de Eucalipto Chic, la marca de ropa de Andrea Bermúdez en Costa Rica. Sos cálida, profesional y muy servicial: resolvés, no solo explicás. Hablás en español de Costa Rica, con voseo, frases cortas y claras. Andrea no es técnica y casi siempre te habla por voz desde el celular.",
    "Usá las herramientas para hacer las cosas. Nunca inventes montos, piezas ni ferias: si falta algo esencial (por ejemplo el monto), preguntalo en una sola frase y no llames herramientas.",
    "Gastos que no conocés: si no estás segura de la categoría, usá categoria 'desconocida' para que el panel le pregunte y aprenda. Respetá lo que ya aprendiste (lista de abajo).",
    "Si pregunta dónde está algo o cómo se hace, explicalo en una frase y llamá ir_a para llevarla. Si quiere promocionar un post, llamá promocionar_post. Si quiere mejorar o subir una foto, llamá mejorar_foto.",
    "El panel tiene: Inicio (este chat), Plata (ventas, gastos, resumen del mes, IVA), Tienda (piezas, precios, colecciones, fotos), Ferias (próximas con foto y lugar; se borran ahí) y Anuncios (promociones de Instagram con tope mensual).",
    "Contexto del negocio: la ropa la confecciona Juanita ('Confección (Juanita)'); la tela se compra aparte ('Tela'); vende en ferias, por WhatsApp y en la web; recibe muchos SINPE Móvil y tiene un datáfono MiPos de BAC ('Datáfono'). Si no dice el método, usá SINPE. Los pagos con ONVO se anotan solos.",
    `Hoy es ${hoy()}. Montos en colones salvo que diga dólares. "45 mil" = 45000.`,
    "Para preguntas sobre plata, contestá con los números del resumen. Siempre que propongas guardar algo, terminá preguntando si lo guardás.",
    `Piezas (slug | nombre | precio | colección | oculta): ${piezas.map((p) => `${p.slug}|${p.nombre}|${p.precio}|${p.coleccion || "-"}|${p.oculta ? "sí" : "no"}`).join("; ")}`,
    `Colecciones: ${(ctx.colecciones ?? []).join(", ") || "ninguna"}.`,
    `Ferias (id | nombre | fecha | lugar): ${(ctx.ferias ?? []).map((f) => `${f.id}|${f.nombre}|${f.fecha}|${f.lugar ?? "-"}`).join("; ") || "ninguna"}.`,
    `Categorías propias de Andrea: ${propias.map((c) => `${c.nombre} (${c.sentido})`).join(", ") || "ninguna todavía"}.`,
    `Lo que ya aprendiste (palabras → categoría): ${(ctx.aprendido ?? []).slice(-80).map((l) => `«${l.clave}» → ${l.categoria}`).join("; ") || "nada todavía"}.`,
    `Resumen de plata: ${ctx.resumen}`,
  ].join("\n");

  const historial = (body?.historial ?? []).slice(-10).filter((t) => t?.texto).map((t) => ({ role: t.de === "ella" ? "user" : "assistant", content: String(t.texto).slice(0, 600) }));

  try {
    const r = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6-luna",
        instructions: sistema,
        input: [...historial, { role: "user", content: texto }],
        tools: herramientas(cats),
        tool_choice: "auto",
        reasoning: { effort: "low" },
        max_output_tokens: 900,
        store: false,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { output?: { type: string; name?: string; arguments?: string; content?: { type: string; text?: string }[] }[] };

    let dicho = "";
    const acciones: Accion[] = [];
    let tarjeta: Tarjeta | undefined;
    let porDefecto = "";
    for (const item of j.output ?? []) {
      if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text" && c.text) dicho += c.text;
      if (item.type !== "function_call") continue;
      let a: Record<string, unknown> = {};
      try { a = JSON.parse(item.arguments ?? "{}"); } catch { continue; }
      const res = convertir(item.name, a, piezas, ctx, cats);
      if (!res) continue;
      if ("tarjeta" in res) { tarjeta ??= res.tarjeta; porDefecto ||= res.texto; } else acciones.push(res);
    }
    if (acciones.length && !tarjeta) tarjeta = { tipo: "confirmar", acciones };
    const respuesta = dicho.trim() || porDefecto || (acciones.length ? "Esto es lo que entendí. ¿Lo guardo?" : "No te entendí bien, ¿me lo decís de otra forma?");
    return NextResponse.json({ motor: "openai", respuesta, acciones: tarjeta?.tipo === "confirmar" ? acciones : [], tarjeta });
  } catch (e) {
    console.error("[asistente]", e instanceof Error ? e.message : e);
    return NextResponse.json({ motor: "local", error: "La IA no respondió; usé el asistente básico." }, { status: 502 });
  }
}

/** Valida lo que propuso la IA: solo pasa lo que tiene sentido para la tienda. */
function convertir(nombre: string | undefined, a: Record<string, unknown>, piezas: Pieza[], ctx: Contexto, cats: string[]): Accion | { tarjeta: Tarjeta; texto: string } | null {
  const id = crypto.randomUUID();
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);
  const txt = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const pieza = (slug: unknown) => piezas.find((p) => p.slug === slug) ?? null;
  const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : hoy());

  switch (nombre) {
    case "registrar_movimiento": {
      const sentido = a.sentido === "ingreso" || a.sentido === "gasto" ? a.sentido : null;
      const monto = num(a.monto);
      if (!sentido || !monto) return null;
      const propias = (ctx.categorias ?? []).filter((c) => c.sentido === sentido).map((c) => c.nombre);
      const validas = [...CATS[sentido], ...propias];
      const feria = ctx.ferias.find((f) => f.nombre === a.feria)?.nombre;
      const mov: Movimiento = {
        id, tipo: "movimiento", sentido, monto, moneda: a.moneda === "USD" ? "USD" : "CRC",
        categoria: validas.includes(String(a.categoria)) ? String(a.categoria) : sentido === "gasto" ? "Otro" : "Venta directa",
        metodo: METODOS.includes(String(a.metodo)) ? String(a.metodo) : "SINPE", concepto: txt(a.concepto, 200) ?? String(a.categoria), feria, fecha: fecha(a.fecha),
      };
      if (sentido === "gasto" && (a.categoria === "desconocida" || !validas.includes(String(a.categoria)))) {
        return { tarjeta: { tipo: "categoria", mov: { ...mov, categoria: "Otro" } }, texto: "No sé todavía qué tipo de gasto es. ¿En cuál va? Así lo aprendo." };
      }
      void cats;
      return mov;
    }
    case "cambiar_precio": {
      const p = pieza(a.slug), precio = num(a.precio);
      return p && precio ? { id, tipo: "precio", slug: p.slug, nombre: p.nombre, precio } : null;
    }
    case "mostrar_u_ocultar": {
      const p = pieza(a.slug);
      return p && typeof a.visible === "boolean" ? { id, tipo: "visible", slug: p.slug, nombre: p.nombre, visible: a.visible } : null;
    }
    case "crear_coleccion": {
      const n = txt(a.nombre, 40);
      return n ? { id, tipo: "coleccion", nombre: n } : null;
    }
    case "mover_a_coleccion": {
      const p = pieza(a.slug), c = txt(a.coleccion, 40);
      return p && c ? { id, tipo: "mover", slug: p.slug, nombre: p.nombre, coleccion: c } : null;
    }
    case "crear_pieza": {
      const n = txt(a.nombre, 60), t = txt(a.tipo, 20);
      return n && t ? { id, tipo: "pieza", nombre: n, tipoPieza: t, precio: num(a.precio) ?? 0, coleccion: txt(a.coleccion, 40) ?? undefined } : null;
    }
    case "crear_feria": {
      const n = txt(a.nombre, 60);
      return n ? { id, tipo: "feria", nombre: n, fecha: fecha(a.fecha) } : null;
    }
    case "borrar_feria": {
      const f = ctx.ferias.find((x) => x.id === a.id);
      return f ? { id, tipo: "borrar_feria", feria: f.id, nombre: f.nombre } : null;
    }
    case "promocionar_post": return { tarjeta: { tipo: "posts" }, texto: "¡Dale! ¿Cuál post querés que vea más gente? Tocá la foto." };
    case "mejorar_foto": {
      const p = pieza(a.slug);
      return { tarjeta: { tipo: "foto", slug: p?.slug }, texto: p ? `Subí la foto de ${p.nombre} aquí y la mejoramos.` : "¿De cuál pieza es la foto? Escogela aquí." };
    }
    case "ir_a": {
      const s = SECCIONES.includes(a.seccion as Seccion) ? (a.seccion as Seccion) : null;
      return s ? { tarjeta: { tipo: "ir", seccion: s, boton: txt(a.boton, 30) ?? "Ir" }, texto: "Te llevo." } : null;
    }
    case "mostrar_resumen": return { tarjeta: { tipo: "resumen" }, texto: "Así vas este mes:" };
  }
  return null;
}
