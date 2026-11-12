import { Lockup } from "./Logo";

/** Entrada: el logo se arma letra por letra y la cortina sube. Corre en cada carga o refresco, no al navegar dentro del sitio. */
export default function Intro() {
  return (
    <div className="intro" aria-hidden>
      <Lockup className="intro-logo" />
    </div>
  );
}
