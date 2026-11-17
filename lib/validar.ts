import { createHash } from "node:crypto";
import { CATS, METODOS, type Accion, type Sentido } from "./asistente";
import { FOTOS } from "./fotos";

// Revisa en el servidor cada acción que llega del panel. Nada del navegador se guarda sin pasar por aquí:
// solo campos conocidos, textos cortos, montos razonables y valores de las listas permitidas.

export const TIPOS_PIEZA = ["Blusas", "Tops", "Suéteres", "Pañuelos", "Pantalones", "Faldas", "Vestidos", "Enterizos", "Otros"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class Invalida extends Error {}

/** Un id que no sea UUID se convierte siempre en el mismo UUID, así la idempotencia se mantiene. */
const idSeguro = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s || s.length > 100) throw new Invalida("Acción sin identificador.");
  if (UUID.test(s)) return s.toLowerCase();
  const h = createHash("sha256").update("eu-accion:" + s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const texto = (v: unknown, max: number, nombre: string, opcional = false) => {
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s && !opcional) throw new Invalida(`Falta ${nombre}.`);
  return s.slice(0, max);
};
const numero = (v: unknown, min: number, max: number, nombre: string) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < min || n > max) throw new Invalida(`El ${nombre} no se ve bien.`);
  return Math.round(n * 100) / 100;
};
const slug = (v: unknown) => {
  const s = String(v ?? "");
  if (!SLUG.test(s) || s.length > 140) throw new Invalida("No encontré esa pieza.");
  return s;
};
const fecha = (v: unknown) => {
  const s = String(v ?? "");
  const d = new Date(s + "T12:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(+d) || d.toISOString().slice(0, 10) !== s) throw new Invalida("La fecha no se ve bien.");
  if (d.getUTCFullYear() < 2020 || +d > Date.now() + 400 * 864e5) throw new Invalida("La fecha no se ve bien.");
  return s;
};
const de = <T extends string>(v: unknown, lista: readonly T[], nombre: string) => {
  if (!lista.includes(v as T)) throw new Invalida(`No reconozco ${nombre}.`);
  return v as T;
};

export function validar(x: unknown): Accion {
  if (!x || typeof x !== "object") throw new Invalida("Acción vacía.");
  const a = x as Record<string, unknown>;
  const id = idSeguro(a.id);
  switch (a.tipo) {
    case "movimiento": {
      const sentido = de(a.sentido, ["ingreso", "gasto"] as Sentido[], "si entró o salió plata");
      const moneda = de(a.moneda ?? "CRC", ["CRC", "USD"] as const, "la moneda");
      return {
        id, tipo: "movimiento", sentido, moneda,
        monto: numero(a.monto, 1, moneda === "USD" ? 100_000 : 50_000_000, "monto"),
        categoria: de(a.categoria, CATS[sentido], "la categoría"),
        metodo: de(a.metodo, METODOS, "el método de pago"),
        concepto: texto(a.concepto, 300, "el detalle", true) || String(a.categoria),
        feria: texto(a.feria, 80, "la feria", true) || undefined,
        fecha: fecha(a.fecha),
      };
    }
    case "precio": return { id, tipo: "precio", slug: slug(a.slug), nombre: texto(a.nombre, 80, "el nombre"), precio: Math.round(numero(a.precio, 0, 5_000_000, "precio")) };
    case "visible": return { id, tipo: "visible", slug: slug(a.slug), nombre: texto(a.nombre, 80, "el nombre"), visible: a.visible === true };
    case "coleccion": return { id, tipo: "coleccion", nombre: texto(a.nombre, 60, "el nombre de la colección") };
    case "mover": return { id, tipo: "mover", slug: slug(a.slug), nombre: texto(a.nombre, 80, "el nombre"), coleccion: texto(a.coleccion, 60, "la colección", true) };
    case "pieza": return {
      id, tipo: "pieza", nombre: texto(a.nombre, 80, "el nombre de la pieza"),
      tipoPieza: de(a.tipoPieza ?? "Blusas", TIPOS_PIEZA, "el tipo de pieza"),
      precio: Math.round(numero(a.precio ?? 0, 0, 5_000_000, "precio")),
      coleccion: texto(a.coleccion, 60, "la colección", true) || undefined,
    };
    case "feria": return { id, tipo: "feria", nombre: texto(a.nombre, 80, "el nombre de la feria"), fecha: fecha(a.fecha), lugar: texto(a.lugar, 120, "el lugar", true) || undefined };
    case "foto": {
      const foto = String(a.foto ?? "");
      if (!FOTOS.some((f) => f.id === foto)) throw new Invalida("No encontré esa foto.");
      return { id, tipo: "foto", foto, slug: slug(a.slug), nombre: texto(a.nombre, 80, "el nombre") };
    }
    case "anular": {
      const mov = String(a.mov ?? "");
      if (!UUID.test(mov)) throw new Invalida("No encontré ese movimiento.");
      return { id, tipo: "anular", mov, nombre: texto(a.nombre, 300, "el detalle", true) || "movimiento" };
    }
    case "quitar_foto": {
      const foto_id = String(a.foto_id ?? "");
      if (!UUID.test(foto_id)) throw new Invalida("No encontré esa foto.");
      return { id, tipo: "quitar_foto", foto_id, slug: slug(a.slug), nombre: texto(a.nombre, 80, "el nombre") };
    }
    default: throw new Invalida("No reconozco esa acción.");
  }
}

/** Acciones que cambian lo que se ve en la tienda (para refrescar la página). */
export const tocaTienda = (a: Accion) => ["precio", "visible", "mover", "pieza", "foto", "coleccion", "quitar_foto"].includes(a.tipo);
