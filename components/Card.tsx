import { colones, img, srcSet, type Product } from "@/lib/catalog";

export default function Card({ p, sizes = "(max-width: 700px) 50vw, 25vw" }: { p: Product; sizes?: string }) {
  return (
    <a className="card" href={`/tienda/${p.slug}`}>
      <span className="card-foto">
        <img src={img(p.fotos[0], 750)} srcSet={srcSet(p.fotos[0])} sizes={sizes} alt={p.nombre} loading="lazy" />
        {p.fotos[1] && (
          <img className="card-alt" src={img(p.fotos[1], 750)} srcSet={srcSet(p.fotos[1])} sizes={sizes} alt="" loading="lazy" />
        )}
      </span>
      <span className="card-nombre">{p.nombre}</span>
      <span className="card-precio">{colones(p.precio)}</span>
    </a>
  );
}
