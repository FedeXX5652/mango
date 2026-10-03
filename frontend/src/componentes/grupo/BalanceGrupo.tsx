import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { DeA } from "@/componentes/DeA"
import { SaldarPago, type Liquidacion } from "@/componentes/SaldarPago"
import { Button } from "@/componentes/ui/button"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useGrupo } from "@/hooks/useGrupo"
import { formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"

// Balance del grupo (0026), lo primero del Inicio de un grupo: como quedo YO, el
// detalle de cada uno y como saldar. Es acumulado (una deuda no es de un mes):
// partes iguales o splits, menos los pagos ya registrados (0015, 0017).
export function BalanceGrupo({ groupId }: { groupId: string }) {
  const { balance, miId, nombre } = useGrupo(groupId)
  const [pagando, setPagando] = useState<Liquidacion | null>(null)

  if (balance.length === 0) {
    return (
      <section className="rounded-xl bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Balance</h2>
        <p className="mt-1 text-lg font-semibold">Todavía no hay gastos compartidos</p>
      </section>
    )
  }

  return (
    <>
      {balance.map((r) => {
        const yo = r.balances.find((b) => b.user_id === miId)
        const neto = yo?.neto ?? 0
        const titular =
          neto > 0
            ? `Te deben ${formatearMonto(neto, { moneda: r.currency })}`
            : neto < 0
              ? `Debés ${formatearMonto(-neto, { moneda: r.currency })}`
              : "Están al día"
        return (
          <section key={r.currency} className="space-y-4 rounded-xl bg-card p-4">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground">
                Balance{balance.length > 1 ? ` (${r.currency})` : ""}
              </h2>
              <p
                className={cn(
                  "tabular text-2xl font-semibold",
                  neto > 0 && "text-income",
                  neto < 0 && "text-expense",
                )}
              >
                {titular}
              </p>
            </div>

            {/* Como saldar: cada sugerencia se registra como pago (o saldado). */}
            {r.liquidaciones.length > 0 && (
              <ListaInset>
                {r.liquidaciones.map((l, i) => (
                  <FilaInset key={i}>
                    {/* Los nombres arriba y el monto abajo: en una sola linea,
                        con el boton, en 360 px no entraban. */}
                    <span className="min-w-0 text-sm">
                      <DeA
                        de={nombre(l.de)}
                        a={nombre(l.a)}
                        flecha="le debe a"
                        className="font-medium"
                      />
                      <span className="tabular block text-xs text-muted-foreground">
                        {formatearMonto(l.monto, { moneda: r.currency })}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPagando({ de: l.de, a: l.a, monto: l.monto, currency: r.currency })
                      }
                    >
                      Saldar
                    </Button>
                  </FilaInset>
                ))}
              </ListaInset>
            )}

            {/* El detalle de cada uno: lo que puso y lo que le tocaba. */}
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-enlace">
                Cómo se llegó a esto
                <ChevronDown
                  className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <ListaInset className="mt-2">
                {r.balances.map((b) => (
                  <FilaInset key={b.user_id}>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{nombre(b.user_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        puso {formatearMonto(b.puso, { moneda: r.currency })} · le tocaba{" "}
                        {formatearMonto(b.parte, { moneda: r.currency })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium",
                        b.neto > 0
                          ? "text-income"
                          : b.neto < 0
                            ? "text-expense"
                            : "text-muted-foreground",
                      )}
                    >
                      {b.neto > 0 ? "le deben " : b.neto < 0 ? "debe " : "al día"}
                      {b.neto !== 0 && formatearMonto(Math.abs(b.neto), { moneda: r.currency })}
                    </span>
                  </FilaInset>
                ))}
              </ListaInset>
            </details>
          </section>
        )
      })}

      <SaldarPago
        groupId={groupId}
        liquidacion={pagando}
        miId={miId}
        nombre={nombre}
        onClose={() => setPagando(null)}
      />
    </>
  )
}
