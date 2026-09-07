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
// El numero se parte en varios `<span>`, asi que el contenedor lleva el monto
// completo en `aria-label` y las piezas van `aria-hidden`: el lector de pantalla
// anuncia un numero, no tres pedazos.
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
    <span className="text-[0.72em]">
      {separador}
      {fraccion}
    </span>
  ) : null

  if (variante === "suelto") {
    return (
      <span className={cn("tabular", className)} aria-label={completo} title={completo}>
        <span aria-hidden>
          {signo}
          <span className="text-[0.85em] text-muted-foreground">{simbolo}</span> {entero}
          {decimales}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn("tabular inline-flex items-baseline justify-end gap-1", className)}
      aria-label={completo}
      title={completo}
    >
      {/* El signo NO va atenuado: es lo que comunica gasto o ingreso cuando el
          color no se percibe (DESIGN.md 3). Solo el simbolo se atenua. */}
      <span aria-hidden className="w-9 shrink-0 text-right text-[0.85em]">
        {signo}
        <span className="text-muted-foreground">{simbolo}</span>
      </span>
      <span aria-hidden>
        {entero}
        {decimales}
      </span>
    </span>
  )
}
