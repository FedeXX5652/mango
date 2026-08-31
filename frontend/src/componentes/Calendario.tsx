import { formatearCentavos } from "@/lib/dinero"
import { cn } from "@/lib/utils"

interface Mov {
  kind: "expense" | "income" | "transfer"
  amount: number
  occurred_at: string
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

// Grilla mensual con el neto por dia (ingresos - gastos; las transferencias no
// cuentan). El dia se toma en la zona del navegador (una compra 23:50 cae en el
// dia correcto, ESPECIFICACION 8). Tocar un dia filtra la lista.
export function Calendario({
  anio,
  mes,
  movimientos,
  onDia,
}: {
  anio: number
  mes: number
  movimientos: Mov[]
  onDia: (dia: number) => void
}) {
  const netoPorDia = new Map<number, number>()
  for (const m of movimientos) {
    if (m.kind === "transfer") continue
    const d = new Date(m.occurred_at)
    if (d.getFullYear() !== anio || d.getMonth() !== mes) continue
    const dia = d.getDate()
    const delta = m.kind === "income" ? m.amount : -m.amount
    netoPorDia.set(dia, (netoPorDia.get(dia) ?? 0) + delta)
  }

  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const primerDiaSemana = (new Date(anio, mes, 1).getDay() + 6) % 7 // lunes = 0
  const celdas: (number | null)[] = [
    ...Array(primerDiaSemana).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ]

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {DIAS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia, i) => {
          if (dia === null) return <div key={`v${i}`} />
          const neto = netoPorDia.get(dia)
          return (
            <button
              key={dia}
              onClick={() => onDia(dia)}
              className="flex min-h-14 flex-col rounded-md border border-border bg-card p-1 text-left hover:bg-muted"
            >
              <span className="text-xs text-muted-foreground">{dia}</span>
              {neto !== undefined && neto !== 0 && (
                <span
                  className={cn(
                    "mt-auto tabular text-[10px] leading-tight",
                    neto < 0 ? "text-expense" : "text-income",
                  )}
                >
                  {neto < 0 ? "-" : "+"}
                  {formatearCentavos(neto)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
