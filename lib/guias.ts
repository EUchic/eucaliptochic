import type { Seccion } from "./cerebro";

/**
 * Guías paso a paso: cuando el asistente le dice a Andrea «Te llevo», la acompaña en la sección
 * diciéndole qué tocar (y resaltándolo) hasta que termina lo que quería hacer.
 *
 * Cada paso resalta un elemento marcado con data-guia="…" y avanza solo cuando:
 *  - Andrea toca algo que calza con `clic`, o
 *  - el panel avisa que pasó algo (`evento`: una acción guardada «accion:tipo», «foto_subida», «rehecha», …).
 * Los pasos sin `clic` ni `evento` se pasan con «Listo, ya está».
 */

export const TAREAS = [
  "subir_foto", "rehacer_foto", "revisar_fotos_ia", "foto_de_la_pagina", "tallas", "esconder_pieza", "quitar_foto",
  "producto_nuevo", "ver_colecciones", "feria_nueva", "cambiar_feria", "borrar_feria", "anotar_plata", "analisis_del_mes", "promocionar", "publicar",
] as const;
export type Tarea = (typeof TAREAS)[number];
export type PedidoGuia = { tarea?: Tarea; slug?: string; feria?: string };

export type Paso = { texto: string; sel?: string; clic?: string; evento?: string[] };
export type Guia = { id: string; tarea: Tarea; seccion: Seccion; titulo: string; pasos: Paso[]; fin: string; slug?: string; feria?: string };

const SECCION: Record<Tarea, Seccion> = {
  subir_foto: "tienda", rehacer_foto: "tienda", revisar_fotos_ia: "tienda", foto_de_la_pagina: "tienda", tallas: "tienda",
  esconder_pieza: "tienda", quitar_foto: "tienda", producto_nuevo: "tienda", ver_colecciones: "tienda",
  feria_nueva: "ferias", cambiar_feria: "ferias", borrar_feria: "ferias",
  anotar_plata: "plata", analisis_del_mes: "plata", promocionar: "anuncios", publicar: "anuncios",
};
export const seccionDe = (t: Tarea) => SECCION[t];

type Contexto = { pieza?: { slug: string; nombre: string; propuesta?: unknown; conIA?: boolean }; feria?: { id: string; nombre: string } };

const elegirPieza: Paso = { texto: "Buscá la pieza arriba (o bajá en la lista) y tocala.", sel: '[data-guia="lista"]', clic: ".ti-fila" };
const elegirFeria: Paso = { texto: "Tocá la feria.", sel: '[data-guia="ferias"]', clic: ".fp-fila" };

export function armarGuia(tarea: Tarea, c: Contexto): Guia {
  const pz = c.pieza;
  const de = pz ? ` de ${pz.nombre}` : "";
  const conPieza = (...pasos: Paso[]) => (pz ? pasos : [elegirPieza, ...pasos]);
  const conFeria = (...pasos: Paso[]) => (c.feria ? pasos : [elegirFeria, ...pasos]);
  const revisar: Paso = {
    texto: "Compará la foto nueva con la de ahora. Si la prenda es igualita, tocá «Usarla de portada». Si algo salió mal, tocá «Tiene un error».",
    sel: '[data-guia="fotos-ia"]', evento: ["accion:foto_aprobar", "accion:foto_descartar", "rehecha"],
  };
  // Si ya hay una foto de IA esperando, primero hay que revisar esa.
  if (tarea === "rehacer_foto" && pz?.propuesta) tarea = "revisar_fotos_ia";

  const g = (titulo: string, pasos: Paso[], fin: string): Guia =>
    ({ id: crypto.randomUUID(), tarea, seccion: SECCION[tarea], titulo, pasos, fin, slug: pz?.slug, feria: c.feria?.id });

  switch (tarea) {
    case "subir_foto": return g(`Subir una foto${de}`, conPieza(
      { texto: "Tocá el cuadrito «Foto» con el + y tomá o escogé la foto.", sel: '[data-guia="subir-foto"]', evento: ["foto_subida"] },
    ), "¡Listo! La foto ya está en la tienda.");
    case "rehacer_foto": return g(`Arreglar la foto de IA${de}`, conPieza(
      { texto: "Tocá «La foto de IA tiene un error».", sel: '[data-guia="rehacer"]', clic: '[data-guia="rehacer"]' },
      { texto: "Tocá lo que salió mal o escribilo con tus palabras. Si podés, tomale una foto a la prenda real. Después tocá «Rehacer la foto» y esperá 1 a 2 minutos.", sel: '[data-guia="rehacer-caja"]', evento: ["rehecha"] },
      revisar,
    ), "¡Listo! Ya quedó la foto.");
    case "revisar_fotos_ia": return g("Revisar las fotos nuevas", [revisar], "¡Listo! Si hay más fotos nuevas, tocá «Ver la siguiente».");
    case "foto_de_la_pagina": return g("Cambiar la foto de la página", [
      { texto: "Tocá «Fotos de la página web».", sel: '[data-guia="sitio"]', clic: '[data-guia="sitio"]' },
      { texto: "Tocá «Subir otra foto», o «Usar la foto de una pieza» y escogé la que querés.", sel: '[data-guia="sitio-cuerpo"]', evento: ["sitio"] },
      { texto: "Mirá cómo queda en celular y en computadora. Si se corta la cara, tocá «Arriba». Cuando te guste, tocá «Listo, ya está».", sel: '[data-guia="sitio-pos"]' },
    ], "¡Listo! La página ya tiene la foto nueva.");
    case "tallas": return g(`Cambiar las tallas${de}`, conPieza(
      { texto: "Tocá las tallas que hay y con + y − poné cuántas te quedan. Después tocá «Guardar tallas».", sel: '[data-guia="tallas"]', evento: ["accion:tallas"] },
    ), "¡Listo! Las tallas ya están al día en la tienda.");
    case "esconder_pieza": return g(`Esconder o mostrar${de || " una pieza"}`, conPieza(
      { texto: "Tocá «Se ve en la tienda» para esconderla o volverla a mostrar.", sel: '[data-guia="visible"]', evento: ["accion:visible"] },
    ), "¡Listo!");
    case "quitar_foto": return g(`Quitar una foto${de}`, conPieza(
      { texto: "Tocá la X de la foto que querés quitar y después «Quitar».", sel: '[data-guia="fotos"]', evento: ["accion:quitar_foto"] },
    ), "¡Listo! Esa foto ya no sale en la tienda.");
    case "producto_nuevo": return g("Meter un producto nuevo", [
      { texto: "Tocá «Meter un producto nuevo».", sel: '[data-guia="nuevo"]', clic: '[data-guia="nuevo"]' },
      { texto: "Llená la ficha: la foto, el nombre, el tipo, el precio y las tallas. Al final tocá «Guardar producto».", sel: ".ti-ficha", evento: ["accion:pieza"] },
    ], "¡Listo! El producto ya está en la tienda.");
    case "ver_colecciones": return g("Las colecciones", [
      { texto: "Tocá «Colecciones» arriba.", sel: '[data-guia="vista-colecciones"]', clic: '[data-guia="vista-colecciones"]' },
      { texto: "Aquí está cada colección con sus prendas. Tocá una para verla, meterle prendas o sacarlas, o tocá «Crear una colección».", sel: '[data-guia="colecciones"]' },
    ], "¡Listo! Cuando una colección tiene prendas, sale en la página.");
    case "feria_nueva": return g("Anotar una feria", [
      { texto: "Tocá «Agregar una feria».", sel: '[data-guia="nueva-feria"]', clic: '[data-guia="nueva-feria"]' },
      { texto: "Poné el nombre, la fecha y buscá el lugar. Después tocá «Guardar feria».", sel: ".pn-ficha", evento: ["accion:feria"] },
    ], "¡Listo! La feria ya sale en la página. Si querés, agregale una foto.");
    case "cambiar_feria": return g(`Cambiar ${c.feria ? c.feria.nombre : "una feria"}`, conFeria(
      { texto: "Cambiá lo que ocupés: la foto, o el lugar con «Cambiar el lugar».", sel: '[data-guia="editar-feria"]', evento: ["accion:feria", "accion:feria_lugar", "accion:feria_sin_foto", "foto_feria"] },
    ), "¡Listo! La página ya está al día.");
    case "borrar_feria": return g(`Borrar ${c.feria ? c.feria.nombre : "una feria"}`, conFeria(
      { texto: "Tocá «Borrar feria» y después «Sí, borrarla». Lo que vendiste ahí queda anotado en Plata.", sel: '[data-guia="borrar-feria"]', evento: ["accion:borrar_feria"] },
    ), "¡Listo! La feria ya no sale en la página.");
    case "anotar_plata": return g("Anotar plata", [
      { texto: "Tocá «Entró plata» si te pagaron, o «Salió plata» si pagaste algo.", sel: '[data-guia="anotar"]', clic: '[data-guia="anotar"] button' },
      { texto: "Poné cuánto fue, cómo se pagó y qué fue. Después tocá «Guardar».", sel: ".pl-anotar", evento: ["accion:movimiento"] },
    ], "¡Listo! Ya quedó anotado.");
    case "analisis_del_mes": return g("Ver cómo vas este mes", [
      { texto: "Tocá «Analizar mi mes». En unos segundos te digo cómo vas y qué te recomiendo.", sel: '[data-guia="analisis"]', evento: ["analisis"] },
    ], "¡Listo! Leé las recomendaciones con calma.");
    case "promocionar": return g("Promocionar un post", [
      { texto: "Tocá «Promocionar».", sel: '[data-guia="promocionar"]', clic: '[data-guia="promocionar"]' },
      { texto: "Seguí los pasos: escogé el post, cuándo empieza, cuántos días y cuánto querés gastar. No se cobra nada sin que digás «Sí, autorizo».", evento: ["anuncio"] },
    ], "¡Listo! La promoción quedó creada.");
    case "publicar": return g("Publicar en Instagram", [
      { texto: "Tocá «Publicar en Instagram».", sel: '[data-guia="publicar"]', clic: '[data-guia="publicar"]' },
      { texto: "Escogé la foto, escribí el texto (o tocá «Escribir el texto con IA») y al final tocá «Publicar».", evento: ["anuncio"] },
    ], "¡Listo! Ya está en tu Instagram.");
  }
}

/** Avisa a la guía que pasó algo (una acción guardada, una foto subida…). */
export const avisarGuia = (evento: string) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("eu-guia", { detail: evento }));
};
