import { permanentRedirect, redirect } from "next/navigation";
import { slugDeUrlVieja } from "@/lib/tienda";

// Links de la tienda vieja en Squarespace (Instagram, WhatsApp, Google) → la misma pieza en la tienda nueva.
export default async function Page({ params }: { params: Promise<{ viejo: string[] }> }) {
  const { viejo } = await params;
  const slug = await slugDeUrlVieja("/tienda/p/" + viejo.join("/"));
  if (slug) permanentRedirect(`/tienda/${slug}`);
  redirect("/tienda");
}
