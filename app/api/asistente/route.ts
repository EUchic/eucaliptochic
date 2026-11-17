import { NextResponse } from "next/server";
import { CATS, METODOS, hoy, type Accion, type Pieza } from "@/lib/asistente";

// El asistente con IA. Recibe lo que Andrea dijo y propone acciones; nunca guarda nada por su cuenta.
// Sin OPENAI_API_KEY responde 501 y el panel usa el asistente local (lib/asistente.ts).

type Contexto = { piezas: Pieza[]; colecciones: string[]; ferias: { nombre: string; fecha: string }[]; resumen: string; tipoCambio?: { compra: number; venta: number } | null };

const tools = [
  fn("registrar_movimiento", "Anota plata que entró (venta) o salió (gasto).", {
    sentido: { type: "string", enum: ["ingreso", "gasto"] },
    monto: { type: "number", description: "Monto en la moneda indicada, mayor que 0" },
    moneda: { type: "string", enum: ["CRC", "USD"] },
    categoria: { type: "string", enum: [...CATS.ingreso, ...CATS.gasto] },
    metodo: { type: "string", enum: METODOS },
    concepto: { type: "string", description: "Nota corta en palabras de Andrea" },
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
  fn("crear_feria", "Anota una feria a la que Andrea va a ir o fue.", { nombre: { type: "string" }, fecha: { type: "string", description: "AAAA-MM-DD" }, lugar: { type: "string" } }, ["nombre", "fecha"]),
];

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[]) {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } };
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ motor: "local" }, { status: 501 });

  const body = (await req.json().catch(() => null)) as { texto?: string; contexto?: Contexto } | null;
  const texto = body?.texto?.slice(0, 1500).trim();
  const ctx = body?.contexto;
  if (!texto || !ctx) return NextResponse.json({ error: "Falta el texto." }, { status: 400 });

  const piezas = (ctx.piezas ?? []).slice(0, 300);
  const sistema = [
    "Sos el asistente del panel de Eucalipto Chic, la marca de ropa de Andrea Bermúdez en Costa Rica. Andrea no es técnica: te habla por voz, en español de Costa Rica.",
    "Tu trabajo: entender lo que dice y proponer acciones con las herramientas. Nunca inventes montos, piezas ni ferias: si falta algo esencial (por ejemplo el monto), preguntalo en una frase corta y no llames herramientas.",
    "Contexto del negocio: la ropa la confecciona Juanita (gasto 'Confección (Juanita)'); la tela se compra aparte ('Tela'); vende en ferias, por WhatsApp y en la web; recibe muchos SINPE Móvil y tiene un datáfono MiPos de BAC ('Datáfono'). Si no dice el método, usá SINPE.",
    `Hoy es ${hoy()}. Montos en colones salvo que diga dólares. "45 mil" = 45000.`,
    "Para piezas usá el slug exacto de la lista. Para preguntas sobre plata, contestá con los números del resumen, sin herramientas.",
    "Respondé siempre con una sola frase corta y cálida, en voseo, que diga lo que vas a hacer y termine preguntando si lo guardás (si hay acciones).",
    `Piezas (slug | nombre | precio | colección | oculta): ${piezas.map((p) => `${p.slug}|${p.nombre}|${p.precio}|${p.coleccion || "-"}|${p.oculta ? "sí" : "no"}`).join("; ")}`,
    `Colecciones: ${(ctx.colecciones ?? []).join(", ") || "ninguna"}. Ferias: ${(ctx.ferias ?? []).map((f) => `${f.nombre} (${f.fecha})`).join(", ") || "ninguna"}.`,
    `Resumen de plata: ${ctx.resumen}`,
  ].join("\n");

  try {
    const r = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6-luna",
        messages: [{ role: "system", content: sistema }, { role: "user", content: texto }],
        tools,
        tool_choice: "auto",
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const msg = j.choices?.[0]?.message ?? {};
    const acciones: Accion[] = [];
    for (const c of msg.tool_calls ?? []) {
      let a: Record<string, unknown> = {};
      try { a = JSON.parse(c.function?.arguments ?? "{}"); } catch { continue; }
      const accion = convertir(c.function?.name, a, piezas, ctx);
      if (accion) acciones.push(accion);
    }
    const respuesta = String(msg.content ?? "").trim() || (acciones.length ? "Esto es lo que entendí. ¿Lo guardo?" : "No entendí bien, ¿me lo repetís?");
    return NextResponse.json({ motor: "openai", respuesta, acciones });
  } catch (e) {
    console.error("asistente", e);
    return NextResponse.json({ motor: "local", error: "La IA no respondió; usé el asistente básico." }, { status: 502 });
  }
}

/** Valida lo que propuso la IA: solo pasa lo que tiene sentido para la tienda. */
function convertir(nombre: string | undefined, a: Record<string, unknown>, piezas: Pieza[], ctx: Contexto): Accion | null {
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
      const categoria = CATS[sentido].includes(String(a.categoria)) ? String(a.categoria) : sentido === "gasto" ? "Otro" : "Venta directa";
      const feria = ctx.ferias.find((f) => f.nombre === a.feria)?.nombre;
      return { id, tipo: "movimiento", sentido, monto, moneda: a.moneda === "USD" ? "USD" : "CRC", categoria, metodo: METODOS.includes(String(a.metodo)) ? String(a.metodo) : "SINPE", concepto: txt(a.concepto, 200) ?? categoria, feria, fecha: fecha(a.fecha) };
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
      return n ? { id, tipo: "feria", nombre: n, fecha: fecha(a.fecha), lugar: txt(a.lugar, 60) ?? undefined } : null;
    }
  }
  return null;
}
