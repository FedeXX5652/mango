import { BellPlus, BellRing, CreditCard, Pencil, Scale } from "lucide-react"

import { AccionesEdicion } from "@/componentes/AccionesEdicion"
import { Monto } from "@/componentes/Monto"
import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import type { SaldoTarjeta, Tarjeta } from "@/hooks/useTarjetas"
import { descripcionTarjeta } from "@/lib/tarjeta"
import { formatearMonto } from "@/lib/dinero"
import { formatearFechaCorta } from "@/lib/fecha"

// La hoja de una tarjeta de credito (0034): lo que se debe en cada saldo, lo que
// vence y el disponible, con "Pagar tarjeta" como la accion principal (el unico
// amarillo). Editar los datos de la tarjeta va en su propia hoja: con el
// formulario aca, "Guardar" y "Pagar" serian dos amarillos.

export function HojaTarjeta({
  tarjeta,
  conAviso,
  onPagar,
  onAjustar,
  onAvisarme,
  onEditar,
  onArchivar,
  onEliminar,
  onCerrar,
}: {
  tarjeta: Tarjeta
  // Ya tiene "Avisarme" del vencimiento.
  conAviso: boolean
  onPagar: () => void
  onAjustar: (saldo: SaldoTarjeta) => void
  onAvisarme: () => void
  onEditar: () => void
  onArchivar: () => void
  onEliminar: () => void
  onCerrar: () => void
}) {
  const debe = tarjeta.saldos.some((s) => s.estado.deuda > 0)
  return (
    <Hoja abierta onOpenChange={(v) => !v && onCerrar()} titulo={tarjeta.name}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{descripcionTarjeta(tarjeta)}</p>

        <ul className="divide-y divide-border rounded-lg bg-muted/40">
          {tarjeta.saldos.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">
                  {tarjeta.saldos.length > 1 ? `En ${s.currency}` : "Saldo"}
                </p>
                <p className="text-xs text-muted-foreground">{lineaResumen(s)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <EstadoSaldo saldo={s} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => onAjustar(s)}
                >
                  <Scale className="h-3.5 w-3.5" aria-hidden />
                  Ajustar
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {tarjeta.credit_limit != null && (
          <p className="text-sm text-muted-foreground">
            {tarjeta.disponible == null
              ? `Límite ${formatearMonto(tarjeta.credit_limit, { moneda: tarjeta.currency })}. Falta la cotización para calcular el disponible.`
              : tarjeta.disponible < 0
                ? `Te pasaste del límite por ${formatearMonto(-tarjeta.disponible, { moneda: tarjeta.currency })}.`
                : `Disponible ${formatearMonto(tarjeta.disponible, { moneda: tarjeta.currency })} de ${formatearMonto(tarjeta.credit_limit, { moneda: tarjeta.currency })}.`}
          </p>
        )}

        {!tarjeta.archived && (
          <div className="space-y-1">
            <Button className="w-full" disabled={!debe} onClick={onPagar}>
              <CreditCard className="h-4 w-4" aria-hidden />
              Pagar tarjeta
            </Button>
            {/* Un boton apagado dice por que. */}
            {!debe && (
              <p className="text-center text-xs text-muted-foreground">No debés nada por ahora.</p>
            )}
          </div>
        )}

        <AccionesEdicion
          archivada={tarjeta.archived}
          onArchivar={onArchivar}
          onEliminar={onEliminar}
        >
          <Button variant="ghost" className="justify-start" onClick={onEditar}>
            <Pencil className="h-4 w-4" aria-hidden />
            Editar tarjeta
          </Button>
          {tarjeta.due_day != null && !tarjeta.archived && (
            <Button variant="ghost" className="justify-start" onClick={onAvisarme}>
              {conAviso ? (
                <BellRing className="h-4 w-4" aria-hidden />
              ) : (
                <BellPlus className="h-4 w-4" aria-hidden />
              )}
              {conAviso ? "Recordatorio del vencimiento" : "Avisarme del vencimiento"}
            </Button>
          )}
        </AccionesEdicion>
      </div>
    </Hoja>
  )
}

// "Debés $ X", "A favor $ X" o "Al día", con el monto como en las listas.
export function EstadoSaldo({ saldo }: { saldo: SaldoTarjeta }) {
  const { deuda, aFavor } = saldo.estado
  if (deuda === 0 && aFavor === 0)
    return <span className="text-sm text-muted-foreground">Al día</span>
  return (
    // "Debés" arriba del monto y no al lado: en un telefono chico, al lado le
    // quitaba lugar al nombre de la cuenta.
    <span className="flex flex-col items-end">
      <span className="text-xs leading-tight text-muted-foreground">
        {deuda > 0 ? "Debés" : "A favor"}
      </span>
      <Monto
        centavos={deuda > 0 ? deuda : aFavor}
        moneda={saldo.currency}
        className={deuda > 0 ? "font-medium text-expense" : "font-medium text-income"}
      />
    </span>
  )
}

// Lo que vence de este saldo, en una linea.
function lineaResumen(s: SaldoTarjeta): string {
  const { estado } = s
  if (estado.resumen == null || !estado.cierre) return "Sin día de cierre: solo el total."
  const cierre = formatearFechaCorta(estado.cierre)
  if (estado.resumen === 0) return `Resumen del ${cierre}: pagado.`
  const vence = estado.vence ? `, vence el ${formatearFechaCorta(estado.vence)}` : ""
  return `Resumen del ${cierre}: ${formatearMonto(estado.resumen, { moneda: s.currency })}${vence}.`
}
