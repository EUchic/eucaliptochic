"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BagButton } from "./Cart";
import Icon from "./Icons";
import { Mark } from "./Logo";

const LINKS = [
  { href: "/tienda", t: "Tienda", ic: "percha" },
  { href: "/colecciones", t: "Colecciones", ic: "hoja" },
  { href: "/andrea", t: "Andrea", ic: "persona" },
  { href: "/encontranos", t: "Ferias", ic: "pin" },
];

export default function Nav() {
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  return (
    <header className="nav">
      <Link className="nav-logo" href="/" aria-label="Eucalipto Chic, inicio"><Mark part="full" /></Link>
      <nav className="nav-links" aria-label="Principal">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
            <Icon n={l.ic} size={24} /><span>{l.t}</span>
          </Link>
        ))}
      </nav>
      <BagButton />
    </header>
  );
}
