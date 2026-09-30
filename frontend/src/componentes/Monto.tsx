import { type Direccion, formatearMonto, partesMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"

// Monto en pantalla. Es el unico lugar donde se dibuja un monto con jerarquia:
// de aca sale lo que pide DESIGN.md 7 y la decision 0006.
//
// - El **simbolo** va atenuado y un poco mas chico: el ojo lee el numero primero.
// - Los **decimales** van mas chicos, con el separador pegado a ellos. Los
//   centavos casi nunca deciden algo, pero tampoco se pueden esconder: se
//   achican, no se recortan.
// - El **signo** conserva tamano y color del numero: es lo que comunica gasto o
//   ingreso cuando el color no se percibe.
//
// Dos variantes:
// - `lista`: el simbolo va en una columna de ancho fijo y el numero alineado a
//   la derecha. Sin eso, una lista con pesos y dolares queda dentada: "$" y
//   "US$" no miden lo mismo y corren los digitos.
// - `suelto`: una sola caja, para el monto que no comparte columna con otros.
//
// El numero se parte en varios `<span>`, asi que las piezas van `aria-hidden` y
// el monto completo va en un texto solo para lectores (`sr-only`): se anuncia un
// numero, no tres pedazos. NO en `aria-label`: en un `<span>` sin rol esta
// prohibido y algunos lectores lo ignoran (auditoria de 0022).
//
// Los tamanos relativos tienen PISO de 11 px: en un monto de 12 px, el 0,72em
// de los decimales daba 8,6 px, ilegible.
export function Monto({
  centavos,
  moneda,
  direccion = "neutro",
  variante = "suelto",
  className,
}: {
  centavos: number
  moneda?: string
  direccion?: Direccion
  variante?: "lista" | "suelto"
  className?: string
}) {
  const { simbolo, entero, separador, fraccion } = partesMonto(centavos, { moneda, direccion })
  // `partesMonto` trabaja con la magnitud: un saldo negativo sin direccion
  // explicita (un resultado en rojo) perderia el menos, que es justo lo que
  // comunica el hecho sin depender del color.
  const signo =
    direccion === "gasto" ? "-" : direccion === "ingreso" ? "+" : centavos < 0 ? "-" : ""
  const completo = `${signo}${formatearMonto(Math.abs(centavos), { moneda })}`

  // Sin decimales (JPY, CLP) no hay nada que achicar.
  const decimales = fraccion ? (
    <span className="text-[max(0.72em,11px)]">
      {separador}
      {fraccion}
    </span>
  ) : null

  if (variante === "suelto") {
    return (
      <span className={cn("tabular", className)} title={completo}>
        <span aria-hidden>
          {signo}
          <span className="text-[max(0.85em,11px)] text-muted-foreground">{simbolo}</span> {entero}
          {decimales}
        </span>
        <span className="sr-only">{completo}</span>
      </span>
    )
  }

  return (
    <span
      className={cn("tabular inline-flex items-baseline justify-end gap-1", className)}
      title={completo}
    >
      {/* El signo NO va atenuado: es lo que comunica gasto o ingreso cuando el
          color no se percibe (DESIGN.md 3). Solo el simbolo se atenua. */}
      <span aria-hidden className="w-9 shrink-0 text-right text-[max(0.85em,11px)]">
        {signo}
        <span className="text-muted-foreground">{simbolo}</span>
      </span>
      <span aria-hidden>
        {entero}
        {decimales}
      </span>
      <span className="sr-only">{completo}</span>
    </span>
  )
}
