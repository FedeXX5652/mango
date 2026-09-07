import { ArrowDown, ArrowUp } from "lucide-react"

import { formatearMonto, partesMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"

interface Mov {
  kind: "expense" | "income" | "transfer"
  amount: number
  currency: string
  occurred_at: string
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

// Grilla mensual con el neto por dia (ingresos - gastos; las transferencias no
// cuentan). El dia se toma en la zona del navegador (una compra 23:50 cae en el
// dia correcto, ESPECIFICACION 8). Tocar un dia filtra la lista.
//
// El neto es de UNA moneda: sumar monedas distintas en la misma celda daria un
// numero sin sentido. Los movimientos en otra moneda se ignoran para el neto
// (siguen estando en la lista) y el pie lo aclara.
export function Calendario({
  anio,
  mes,
  moneda,
  movimientos,
  onDia,
}: {
  anio: number
  mes: number
  moneda: string
  movimientos: Mov[]
  onDia: (dia: number) => void
}) {
  const netoPorDia = new Map<number, number>()
  let otraMoneda = false
  for (const m of movimientos) {
    if (m.kind === "transfer") continue
    if (m.currency !== moneda) {
      otraMoneda = true
      continue
    }
    const d = new Date(m.occurred_at)
    if (d.getFullYear() !== anio || d.getMonth() !== mes) continue
    const dia = d.getDate()
    const delta = m.kind === "income" ? m.amount : -m.amount
    netoPorDia.set(dia, (netoPorDia.get(dia) ?? 0) + delta)
  }

  // Tope del mes: la barra de cada dia se mide contra el dia mas movido.
  const tope = Math.max(1, ...[...netoPorDia.values()].map((n) => Math.abs(n)))

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
              <span className="font-mono text-xs text-muted-foreground">{dia}</span>
              {neto !== undefined && neto !== 0 && (
                <span
                  className="mt-auto w-full"
                  title={`${neto < 0 ? "-" : "+"}${formatearMonto(Math.abs(neto), { moneda })}`}
                >
                  {/* Los montos no se abrevian (ver 0006), y en una celda de
                      ~45 px no entra ninguno completo: en movil la magnitud se
                      comunica con una barra proporcional al dia mas movido del
                      mes, y el monto exacto esta en el `title` y en la lista al
                      tocar el dia. En escritorio la celda es ancha y va el
                      numero. El signo no se comunica solo por color: la barra
                      lleva la flecha. */}
                  <span className="flex items-center gap-0.5 lg:hidden">
                    {neto < 0 ? (
                      <ArrowDown className="h-2.5 w-2.5 shrink-0 text-expense" aria-hidden />
                    ) : (
                      <ArrowUp className="h-2.5 w-2.5 shrink-0 text-income" aria-hidden />
                    )}
                    <span
                      className={cn(
                        "h-1 rounded-full",
                        neto < 0 ? "bg-expense" : "bg-income",
                      )}
                      style={{ width: `${Math.max(12, (Math.abs(neto) / tope) * 100)}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "tabular hidden text-[10px] leading-tight lg:block",
                      neto < 0 ? "text-expense" : "text-income",
                    )}
                  >
                    {neto < 0 ? "-" : "+"}
                    {partesMonto(neto, { moneda }).numero}
                  </span>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Neto por día en {moneda}.
        {otraMoneda && " Los movimientos en otra moneda no se suman acá."}
      </p>
    </div>
  )
}
