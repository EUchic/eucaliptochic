"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icons";
import { Lockup } from "./Logo";
import Reveal from "./Reveal";

export default function Footer() {
  if (usePathname().startsWith("/admin")) return null;
  return (
    <footer className="pie">
      <div className="wrap pie-grid">
        <nav aria-label="Pie">
          <b>Comprar</b>
          <Link href="/tienda">Toda la tienda</Link>
          <Link href="/colecciones">Colecciones</Link>
          <Link href="/tienda?tipo=Vestidos">Vestidos</Link>
          <Link href="/tienda?tipo=Blusas">Blusas</Link>
        </nav>
        <nav aria-label="La marca">
          <b>La marca</b>
          <Link href="/andrea">Andrea</Link>
          <Link href="/encontranos">Ferias y contacto</Link>
          <Link href="/privacidad">Privacidad</Link>
        </nav>
        <div className="pie-red">
          <a href="https://wa.me/50670171232" target="_blank" rel="noopener noreferrer"><Icon n="chat" /> 7017 1232</a>
          <a href="https://www.instagram.com/eucaliptochicr/" target="_blank" rel="noopener noreferrer"><Icon n="camara" /> @eucaliptochicr</a>
        </div>
        <p className="pie-nota">Eucalipto Chic, by Andrea Bermúdez. Costa Rica, desde 2020.</p>
      </div>
      <Reveal kind="logo" className="pie-marca">
        <Lockup />
      </Reveal>
    </footer>
  );
}
