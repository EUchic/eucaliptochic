import Link from "next/link";
import { colones, img, srcSet, type Product } from "@/lib/catalog";
import Reveal from "./Reveal";

export default function Card({ p, i = 0, sizes = "(max-width: 700px) 50vw, 25vw" }: { p: Product; i?: number; sizes?: string }) {
  return (
    <Link className="card" href={`/tienda/${p.slug}`} data-cursor="Ver" draggable={false}>
      <Reveal kind="img" delay={(i % 4) * 90} className="card-foto" as="span">
        <img src={img(p.fotos[0], 750)} srcSet={srcSet(p.fotos[0])} sizes={sizes} alt={p.nombre} loading="lazy" draggable={false} />
        {p.fotos[1] && (
          <img className="card-alt" src={img(p.fotos[1], 750)} srcSet={srcSet(p.fotos[1])} sizes={sizes} alt="" loading="lazy" draggable={false} />
        )}
        {p.nuevo && <span className="card-tag">Nuevo</span>}
      </Reveal>
      <span className="card-pie">
        <span className="card-nombre">{p.nombre}</span>
        <span className="card-precio">{colones(p.precio)}</span>
      </span>
    </Link>
  );
}
