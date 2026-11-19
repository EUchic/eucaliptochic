/** Achica una foto en el teléfono antes de subirla (webp, o jpeg si el navegador no hace webp). */
export async function achicarFoto(archivo: Blob, lado: number): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const k = Math.min(1, lado / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    const cx = cv.getContext("2d")!;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(im, 0, 0, cv.width, cv.height);
    const hacer = (t: string, q: number) => new Promise<Blob | null>((r) => cv.toBlob(r, t, q));
    let b = await hacer("image/webp", 0.86);
    if (!b || b.type !== "image/webp") b = await hacer("image/jpeg", 0.88);
    if (!b) throw new Error("No pude leer esa foto. Probá con otra.");
    return b;
  } catch (e) {
    throw e instanceof Error && e.message.startsWith("No pude") ? e : new Error("No pude leer esa foto. Probá con otra.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
