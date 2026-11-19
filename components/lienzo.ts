// Dibuja los posts del diseñador en un <canvas>: la foto, el logo de Eucalipto Chic, el de la organizadora
// (si hay) y los textos con la tipografía de la marca. Se dibuja en el teléfono, así los logos y las letras
// salen exactos (la IA escribe los textos y escoge el encuadre; el dibujo es siempre fiel).

export type Plantilla = "ventana" | "marco" | "etiqueta";
export type Formato = "post" | "story";
export type Textos = { etiqueta: string; titular: string; bajada: string; detalles: string[]; llamado: string };
export type Diseno = Textos & { plantilla: Plantilla; formato: Formato; foco: { x: number; y: number } };
export type Imagenes = { foto: HTMLImageElement; logo: HTMLImageElement; org?: HTMLImageElement | null };

export const MEDIDAS: Record<Formato, [number, number]> = { post: [1080, 1350], story: [1080, 1920] };
export const PLANTILLAS: { id: Plantilla; nombre: string }[] = [
  { id: "ventana", nombre: "Foto completa" },
  { id: "etiqueta", nombre: "Etiqueta" },
  { id: "marco", nombre: "Con marco" },
];

const C = { bosque: "#2E4A3D", salvia: "#A9C4B5", salviaClaro: "#E2ECE6", crema: "#F4F5F1", tinta: "#1F2A25", tinta2: "#56625B" };
const SERIF = '"Bodoni Moda Variable", "Bodoni Moda", "Bodoni 72", Didot, Georgia, serif';
const SANS = '"Jost Variable", Jost, "Avenir Next", system-ui, sans-serif';

export async function cargarFuentes() {
  try {
    await Promise.all([
      document.fonts.load(`600 100px ${SERIF}`), document.fonts.load(`italic 500 60px ${SERIF}`),
      document.fonts.load(`500 40px ${SANS}`), document.fonts.load(`600 30px ${SANS}`),
    ]);
  } catch {}
}

export function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const i = new Image();
    i.decoding = "async";
    if (/^https?:/.test(src)) i.crossOrigin = "anonymous";
    i.onload = () => ok(i);
    i.onerror = () => mal(new Error("No pude abrir esa foto."));
    i.src = src;
  });
}

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** La foto llenando el espacio, centrada en lo importante (foco 0–1). */
function cubrir(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, foco: { x: number; y: number }) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const r = w / h;
  let sw = iw, sh = ih;
  if (iw / ih > r) sw = ih * r; else sh = iw / r;
  const sx = limitar(foco.x * iw - sw / 2, 0, iw - sw);
  const sy = limitar(foco.y * ih - sh / 2, 0, ih - sh);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function partir(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let linea = "";
    for (const p of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? linea + " " + p : p;
      if (ctx.measureText(prueba).width <= ancho || !linea) linea = prueba;
      else { lineas.push(linea); linea = p; }
    }
    if (linea) lineas.push(linea);
  }
  return lineas;
}

/** Achica la letra hasta que el texto quepa en `max` líneas. */
function encajar(ctx: CanvasRenderingContext2D, texto: string, ancho: number, fuente: (px: number) => string, grande: number, chico: number, max: number) {
  for (let px = grande; px >= chico; px -= 2) {
    ctx.font = fuente(px);
    const lineas = partir(ctx, texto, ancho);
    if (lineas.length <= max) return { px, lineas };
  }
  ctx.font = fuente(chico);
  const lineas = partir(ctx, texto, ancho);
  if (lineas.length > max) { lineas.length = max; lineas[max - 1] = lineas[max - 1].replace(/\s*\S*$/, "…"); }
  return { px: chico, lineas };
}

function redondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  // A mano (y no con roundRect) para que funcione también en iPhones con iOS viejito.
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** El logo (blanco, con transparencia) pintado del color que se ocupe. */
function logoDe(logo: HTMLImageElement, color: string, ancho: number) {
  const alto = (ancho * logo.naturalHeight) / logo.naturalWidth;
  const c = document.createElement("canvas");
  c.width = Math.ceil(ancho); c.height = Math.ceil(alto);
  const x = c.getContext("2d")!;
  x.drawImage(logo, 0, 0, ancho, alto);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** El logo de la organizadora en una tarjetita blanca, sin deformarlo. */
function tarjetaOrg(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, caja: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#fff";
  redondeado(ctx, x, y, caja, caja, caja * 0.2); ctx.fill();
  ctx.restore();
  const p = caja * 0.12, w = caja - p * 2;
  const r = Math.min(w / img.naturalWidth, w / img.naturalHeight);
  const iw = img.naturalWidth * r, ih = img.naturalHeight * r;
  ctx.drawImage(img, x + (caja - iw) / 2, y + (caja - ih) / 2, iw, ih);
}

type Bloque = { alto: number; dibujar: (y: number) => void };

/** Arma el texto (de arriba hacia abajo) y devuelve cuánto mide, para poder ubicarlo antes de dibujarlo. */
function bloqueTexto(ctx: CanvasRenderingContext2D, d: Diseno, x: number, ancho: number, col: { titular: string; texto: string; suave: string; pildora: string; pildoraTexto: string }, escala: number, maxTitular: number): Bloque {
  const piezas: { alto: number; dibujar: (y: number) => void }[] = [];
  const s = escala;
  if (d.etiqueta.trim()) {
    const px = 30 * s;
    piezas.push({ alto: px * 1.2 + 18 * s, dibujar: (y) => { ctx.font = `600 ${px}px ${SANS}`; ctx.fillStyle = col.suave; ctx.textBaseline = "top"; ctx.fillText(d.etiqueta.trim(), x, y); } });
  }
  if (d.titular.trim()) {
    const t = encajar(ctx, d.titular.trim(), ancho, (px) => `600 ${px}px ${SERIF}`, 116 * s, 64 * s, maxTitular);
    const lh = t.px * 1.04;
    piezas.push({ alto: lh * t.lineas.length + 20 * s, dibujar: (y) => { ctx.font = `600 ${t.px}px ${SERIF}`; ctx.fillStyle = col.titular; ctx.textBaseline = "top"; t.lineas.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); } });
  }
  if (d.bajada.trim()) {
    const t = encajar(ctx, d.bajada.trim(), ancho, (px) => `400 ${px}px ${SANS}`, 42 * s, 32 * s, 3);
    const lh = t.px * 1.3;
    piezas.push({ alto: lh * t.lineas.length + 22 * s, dibujar: (y) => { ctx.font = `400 ${t.px}px ${SANS}`; ctx.fillStyle = col.texto; ctx.textBaseline = "top"; t.lineas.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); } });
  }
  const detalles = d.detalles.map((t) => t.trim()).filter(Boolean).slice(0, 3);
  if (detalles.length) {
    const px = 34 * s, lh = px * 1.45;
    piezas.push({ alto: lh * detalles.length + 14 * s, dibujar: (y) => {
      ctx.font = `500 ${px}px ${SANS}`; ctx.textBaseline = "top";
      detalles.forEach((t, i) => {
        ctx.fillStyle = col.suave; ctx.fillRect(x, y + i * lh + px * 0.52, 22 * s, 3 * s);
        ctx.fillStyle = col.texto; ctx.fillText(partir(ctx, t, ancho - 40 * s)[0] ?? t, x + 40 * s, y + i * lh);
      });
    } });
  }
  if (d.llamado.trim()) {
    const px = 32 * s, padX = 34 * s, alto = px + 34 * s;
    piezas.push({ alto: alto + 6 * s, dibujar: (y) => {
      ctx.font = `600 ${px}px ${SANS}`;
      const w = Math.min(ancho, ctx.measureText(d.llamado.trim()).width + padX * 2);
      ctx.fillStyle = col.pildora; redondeado(ctx, x, y + 6 * s, w, alto, alto / 2); ctx.fill();
      ctx.fillStyle = col.pildoraTexto; ctx.textBaseline = "middle"; ctx.fillText(d.llamado.trim(), x + padX, y + 6 * s + alto / 2, w - padX * 2);
    } });
  }
  const alto = piezas.reduce((a, p) => a + p.alto, 0);
  return { alto, dibujar: (y) => { let yy = y; for (const p of piezas) { p.dibujar(yy); yy += p.alto; } } };
}

/** Dibuja el diseño completo. `escala` sirve para las miniaturas (1 = tamaño real de Instagram). */
export function dibujar(lienzo: HTMLCanvasElement, d: Diseno, im: Imagenes, escala = 1) {
  const [W0, H0] = MEDIDAS[d.formato];
  const W = W0 * escala, H = H0 * escala, s = escala;
  lienzo.width = Math.round(W); lienzo.height = Math.round(H);
  const ctx = lienzo.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  const historia = d.formato === "story";
  const m = 72 * s;
  // Zonas que tapa Instagram en las historias (arriba el perfil, abajo el «Enviar mensaje»).
  const arriba = historia ? 230 * s : m, abajo = historia ? 330 * s : 84 * s;

  if (d.plantilla === "marco") {
    // Fondo crema, la foto enmarcada arriba y el texto abajo; la foto ocupa lo que el texto deja libre.
    ctx.fillStyle = C.crema; ctx.fillRect(0, 0, W, H);
    const fx = 56 * s, fy = historia ? arriba : 56 * s, fw = W - fx * 2;
    const colores = { titular: C.bosque, texto: C.tinta, suave: "#5F8572", pildora: C.bosque, pildoraTexto: "#fff" };
    const ancho = W - m * 2;
    let b = bloqueTexto(ctx, d, m, ancho, colores, s, 2);
    const minFoto = H * (historia ? 0.42 : 0.46);
    for (let f = 0.94; H - abajo - fy - 50 * s - b.alto < minFoto && f > 0.7; f -= 0.06) b = bloqueTexto(ctx, d, m, ancho, colores, s * f, 2);
    const fh = Math.max(minFoto, Math.min(H * 0.66, H - abajo - fy - 50 * s - b.alto));
    ctx.save(); redondeado(ctx, fx, fy, fw, fh, 30 * s); ctx.clip();
    cubrir(ctx, im.foto, fx, fy, fw, fh, d.foco);
    const sombra = ctx.createLinearGradient(0, fy, 0, fy + 260 * s);
    sombra.addColorStop(0, "rgba(20,28,24,0.38)"); sombra.addColorStop(1, "rgba(20,28,24,0)");
    ctx.fillStyle = sombra; ctx.fillRect(fx, fy, fw, 260 * s);
    ctx.restore();
    const logo = logoDe(im.logo, "#fff", 160 * s);
    ctx.drawImage(logo, fx + 40 * s, fy + 36 * s);
    if (im.org) tarjetaOrg(ctx, im.org, fx + fw - 176 * s, fy + 36 * s, 140 * s);
    b.dibujar(fy + fh + 50 * s);
    return;
  }

  // Foto completa (ventana y etiqueta)
  cubrir(ctx, im.foto, 0, 0, W, H, d.foco);
  const sombraArriba = ctx.createLinearGradient(0, 0, 0, arriba + 220 * s);
  sombraArriba.addColorStop(0, "rgba(20,28,24,0.42)"); sombraArriba.addColorStop(1, "rgba(20,28,24,0)");
  ctx.fillStyle = sombraArriba; ctx.fillRect(0, 0, W, arriba + 220 * s);

  if (d.plantilla === "ventana") {
    const ancho = W - m * 2;
    const colores = { titular: "#fff", texto: "rgba(255,255,255,0.94)", suave: C.salviaClaro, pildora: "#fff", pildoraTexto: C.bosque };
    let b = bloqueTexto(ctx, d, m, ancho, colores, s, 3);
    for (let f = 0.92; b.alto > H * 0.5 && f > 0.6; f -= 0.08) b = bloqueTexto(ctx, d, m, ancho, colores, s * f, 3);
    const y = H - abajo - b.alto;
    const sombra = ctx.createLinearGradient(0, Math.max(0, y - 280 * s), 0, H);
    sombra.addColorStop(0, "rgba(24,36,30,0)"); sombra.addColorStop(0.45, "rgba(24,36,30,0.62)"); sombra.addColorStop(1, "rgba(24,36,30,0.9)");
    ctx.fillStyle = sombra; ctx.fillRect(0, Math.max(0, y - 280 * s), W, H);
    b.dibujar(y);
    const logo = logoDe(im.logo, "#fff", 200 * s);
    ctx.drawImage(logo, m, arriba - (historia ? 0 : 6 * s));
    if (im.org) tarjetaOrg(ctx, im.org, W - m - 150 * s, arriba - 6 * s, 150 * s);
    return;
  }

  // Etiqueta: la etiqueta colgante de Eucalipto, con el texto adentro.
  ctx.fillStyle = "rgba(20,28,24,0.08)"; ctx.fillRect(0, 0, W, H);
  const logo = logoDe(im.logo, "#fff", 230 * s);
  ctx.drawImage(logo, (W - logo.width) / 2, arriba - 10 * s);
  if (im.org) tarjetaOrg(ctx, im.org, W - m - 140 * s, arriba - 10 * s, 140 * s);
  const tw = W * (historia ? 0.84 : 0.78), pad = 58 * s;
  const colores = { titular: C.bosque, texto: C.tinta, suave: "#5F8572", pildora: C.bosque, pildoraTexto: "#fff" };
  let b = bloqueTexto(ctx, d, 0, tw - pad * 2, colores, s, 3);
  for (let f = 0.92; b.alto > H * 0.46 && f > 0.6; f -= 0.08) b = bloqueTexto(ctx, d, 0, tw - pad * 2, colores, s * f, 3);
  const th = b.alto + pad * 2 + 40 * s;
  const tx = m * 0.7, ty = H - abajo - th;
  ctx.save();
  ctx.translate(tx + tw / 2, ty + th / 2);
  ctx.rotate(-0.025);
  ctx.translate(-tw / 2, -th / 2);
  ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 40 * s; ctx.shadowOffsetY = 14 * s;
  ctx.fillStyle = C.crema;
  // forma de etiqueta: esquinas de arriba cortadas en diagonal
  const corte = 46 * s;
  ctx.beginPath();
  ctx.moveTo(corte, 0); ctx.lineTo(tw - corte, 0); ctx.lineTo(tw, corte); ctx.lineTo(tw, th - 22 * s);
  ctx.quadraticCurveTo(tw, th, tw - 22 * s, th); ctx.lineTo(22 * s, th); ctx.quadraticCurveTo(0, th, 0, th - 22 * s);
  ctx.lineTo(0, corte); ctx.closePath(); ctx.fill();
  ctx.shadowColor = "transparent";
  // el hoyito con su argolla
  ctx.fillStyle = C.salviaClaro; ctx.beginPath(); ctx.arc(tw / 2, 34 * s, 14 * s, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.salvia; ctx.lineWidth = 3 * s; ctx.stroke();
  ctx.translate(pad, pad + 40 * s);
  b.dibujar(0);
  ctx.restore();
}

/** El diseño listo para Instagram (JPEG). */
export function aBlob(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo guardar el diseño."))), "image/jpeg", 0.92));
}
