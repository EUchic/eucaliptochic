import Link from "next/link";
import { colones, img, srcSet, type Product } from "@/lib/catalog";
import QuickAdd from "./QuickAdd";
import Reveal from "./Reveal";

export default function Card({ p, i = 0, sizes = "(max-width: 700px) 50vw, 25vw", grande = false }: { p: Product; i?: number; sizes?: string; grande?: boolean }) {
  return (
    <article className={"card" + (grande ? " card-xl" : "")}>
      <div className="card-marco">
        <Link href={`/tienda/${p.slug}`} data-cursor="Ver" draggable={false} aria-label={p.nombre}>
          <Reveal kind="img" delay={(i % 4) * 90} className="card-foto" as="span">
            <img src={img(p.fotos[0], 750)} srcSet={srcSet(p.fotos[0])} sizes={sizes} alt={p.nombre} loading="lazy" draggable={false} />
            {p.fotos[1] && (
              <img className="card-alt" src={img(p.fotos[1], 750)} srcSet={srcSet(p.fotos[1])} sizes={sizes} alt="" loading="lazy" draggable={false} />
            )}
          </Reveal>
        </Link>
        {p.nuevo && <span className="card-tag">Nuevo</span>}
        {p.precio > 0 && p.colores.length === 0 && (
          <QuickAdd slug={p.slug} nombre={p.nombre} precio={p.precio} foto={img(p.fotos[0], 300)} tallas={p.tallas} />
        )}
      </div>
      <Link className="card-pie" href={`/tienda/${p.slug}`} draggable={false}>
        <span className="card-nombre">{p.nombre}</span>
        <span className="card-precio">{colones(p.precio)}</span>
      </Link>
    </article>
  );
}
