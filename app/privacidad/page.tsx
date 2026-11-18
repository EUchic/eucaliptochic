import type { Metadata } from "next";
import { WHATSAPP } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Privacidad",
  description: "Qué datos usa Eucalipto Chic, para qué, y cómo pedir que los borremos.",
};

export default function Privacidad() {
  return (
    <section className="pag priv">
      <header className="cab wrap">
        <h1 className="titulo titulo-xxl">Privacidad</h1>
        <p className="cab-sub">Qué datos usamos, para qué, y cómo pedir que los borremos. Actualizado el 17 de noviembre de 2026.</p>
      </header>
      <div className="wrap priv-texto">
        <h2>Quiénes somos</h2>
        <p>Eucalipto Chic es la marca de ropa de Andrea Bermúdez, en Costa Rica. Si tenés cualquier duda sobre tus datos, escribinos al WhatsApp <a href={`https://wa.me/${WHATSAPP}`}>7017 1232</a> o a <a href="https://www.instagram.com/eucaliptochicr/">@eucaliptochicr</a> en Instagram.</p>

        <h2>Qué datos usamos</h2>
        <p>Cuando hacés un pedido usamos tu nombre, tu teléfono, la dirección de entrega y lo que compraste. Si pagás con tarjeta, el pago lo procesa ONVO Pay: nosotras nunca vemos ni guardamos los datos de tu tarjeta.</p>
        <p>La bolsa de compras se guarda solo en tu navegador, para que no se pierda si cerrás la página. Esta página no usa cookies de publicidad ni rastreadores.</p>

        <h2>Para qué los usamos</h2>
        <p>Para preparar y entregar tu pedido, responderte y llevar las cuentas del negocio. No vendemos ni alquilamos tus datos, y solo los compartimos con quien ayuda a entregar el pedido o a cobrarlo.</p>

        <h2>Anuncios en Instagram y Facebook</h2>
        <p>A veces promocionamos publicaciones de @eucaliptochicr con las herramientas de Meta. Meta decide a quién mostrar esos anuncios según sus propias políticas. Nosotras no recibimos datos personales de quienes ven los anuncios: solo totales, como cuántas personas lo vieron y cuántas nos escribieron. Si nos escribís por Instagram, esa conversación queda en Instagram.</p>

        <h2>Cuánto tiempo los guardamos</h2>
        <p>Lo necesario para completar tu pedido y cumplir con las obligaciones contables y tributarias de Costa Rica.</p>

        <h2 id="borrar">Cómo ver, corregir o borrar tus datos</h2>
        <p>Según la Ley 8968 de Costa Rica, podés pedir ver, corregir o borrar tus datos en cualquier momento. Escribinos al WhatsApp <a href={`https://wa.me/${WHATSAPP}`}>7017 1232</a> diciendo qué querés hacer y te respondemos lo antes posible. Solo guardamos lo que la ley nos obliga a conservar para la contabilidad.</p>
      </div>
    </section>
  );
}
