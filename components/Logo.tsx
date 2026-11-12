/** Logo exacto de la marca, recortado del archivo original. Se pinta con el color del texto (currentColor). */
export function Mark({ part, className = "" }: { part: "e" | "u" | "eu" | "chic" | "full"; className?: string }) {
  return <span className={`lg lg-${part} ${className}`} aria-hidden />;
}

export function Lockup({ className = "" }: { className?: string }) {
  return (
    <span className={`lockup ${className}`} role="img" aria-label="Eucalipto Chic">
      <span className="lockup-eu">
        <span className="lockup-clip"><Mark part="e" /></span>
        <span className="lockup-clip"><Mark part="u" /></span>
      </span>
      <span className="lockup-chic"><Mark part="chic" /></span>
    </span>
  );
}
