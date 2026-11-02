import { formatearMonto } from "@/lib/dinero"
import type { TotalDia } from "@/lib/resumenDia"
import { cn } from "@/lib/utils"

// El encabezado de un dia en las listas de movimientos (DESIGN.md 7): la fecha a
// la izquierda y, en la misma linea a la derecha, como vamos ese dia (1.12.0).
// Texto y no <Monto>: en un rotulo de 12 px el monto de columna no va (DESIGN).
// Con signo y color, nunca solo color.
export function EncabezadoDia({
  etiqueta,
  totales,
  descripcion,
}: {
  etiqueta: string
  totales: TotalDia[]
  // Que suma el total, para el lector de pantalla y el tooltip.
  descripcion: string
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
      {/* h2: la pagina tiene h1 y nada en el medio (axe, 1.7.0). */}
      <h2 className="text-xs font-medium text-muted-foreground">{etiqueta}</h2>
      {totales.length > 0 && (
        <p className="flex flex-wrap justify-end gap-x-2 text-xs font-medium" title={descripcion}>
          <span className="sr-only">{descripcion}:</span>
          {totales.map((t) => (
            <span
              key={t.moneda}
              className={cn(
                "tabular",
                t.neto > 0 ? "text-income" : t.neto < 0 ? "text-expense" : "text-muted-foreground",
              )}
            >
              {formatearMonto(Math.abs(t.neto), {
                moneda: t.moneda,
                direccion: t.neto > 0 ? "ingreso" : t.neto < 0 ? "gasto" : "neutro",
              })}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
