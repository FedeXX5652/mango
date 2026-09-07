import { type Direccion, formatearMonto, partesMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"

// Monto en pantalla. Dos variantes (DESIGN.md 7):
//
// - `lista`: el simbolo va en una columna de ancho fijo y atenuada, y el numero
//   alineado a la derecha. Sin eso, una lista con pesos y dolares queda dentada:
//   "$" y "US$" no miden lo mismo y corren los digitos.
// - `suelto`: una sola caja, para cuando el monto no comparte columna con otros
//   (el monto destacado de Inicio, una linea de detalle).
//
// El `title` lleva siempre el monto completo con su codigo, que es la version
// inequivoca cuando el simbolo se comparte entre monedas.
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
  const { simbolo, numero } = partesMonto(centavos, { moneda, direccion })
  // `partesMonto` trabaja con la magnitud: un saldo negativo sin direccion
  // explicita (un resultado en rojo) perderia el menos, que es justo lo que
  // comunica el hecho sin depender del color.
  const signo =
    direccion === "gasto" ? "-" : direccion === "ingreso" ? "+" : centavos < 0 ? "-" : ""
  const completo = `${signo}${formatearMonto(Math.abs(centavos), { moneda })}`

  if (variante === "suelto") {
    return (
      <span className={cn("tabular", className)} title={completo}>
        {signo}
        <span className="text-[0.85em] text-muted-foreground">{simbolo}</span> {numero}
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
      <span className="w-9 shrink-0 text-right text-[0.85em]">
        {signo}
        <span className="text-muted-foreground">{simbolo}</span>
      </span>
      <span>{numero}</span>
    </span>
  )
}
