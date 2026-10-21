import { usePowerSync, useQuery } from "@powersync/react"
import { useState } from "react"

import { Calculadora } from "@/componentes/Calculadora"
import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { ajusteDeSaldo } from "@/lib/ajuste"
import { AJUSTE } from "@/lib/categorias"
import { formatearMonto } from "@/lib/dinero"
import { usuarioActualId } from "@/lib/sesion"
import { uuidv4 } from "@/lib/uuid"

// Ajustar el saldo de una cuenta (0033). La calculadora arranca en el saldo que
// calcula Mango; se escribe el que de verdad hay, o se hace la cuenta sobre ese
// numero, y la diferencia queda como un movimiento "Ajuste de cuenta" (ingreso
// si sube, egreso si baja), con fecha de ahora. La categoria es del sistema: la
// crea el servidor y ya esta sincronizada, asi que se puede ajustar sin
// conexion. Se monta al abrir: cada vez arranca del saldo de ese momento.
export function AjustarSaldo({
  cuenta,
  saldo,
  onCerrar,
}: {
  cuenta: { id: string; name: string; currency: string }
  // El saldo actual, en centavos y con signo.
  saldo: number
  // `ajustado`: se guardo un ajuste (quien abrio puede cerrar lo de abajo).
  onCerrar: (ajustado: boolean) => void
}) {
  const db = usePowerSync()
  const [nuevo, setNuevo] = useState(saldo)
  const [error, setError] = useState("")
  // Un doble toque no anota dos ajustes (cada intento tiene su id).
  const [guardando, setGuardando] = useState(false)
  const { data: categorias } = useQuery<{ id: string; system_key: string }>(
    `SELECT id, system_key FROM categories
     WHERE owner_id = ? AND system_key IN (?, ?) AND deleted_at IS NULL`,
    [usuarioActualId(), AJUSTE.income, AJUSTE.expense],
  )
  const ajuste = ajusteDeSaldo(saldo, nuevo)

  async function guardar() {
    if (!ajuste || guardando) return
    const categoria = categorias.find((c) => c.system_key === AJUSTE[ajuste.kind])
    if (!categoria) {
      return setError("Todavía no llegó la categoría del ajuste. Probá de nuevo en un momento.")
    }
    setGuardando(true)
    try {
      await db.execute(
        // Confirmado desde ya: el saldo cambia en el momento, tambien sin
        // conexion (el servidor lo deja confirmado igual).
        `INSERT INTO transactions
           (id, owner_id, kind, occurred_at, amount, currency, account_id, category_id,
            visibility, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'private', 'confirmed')`,
        [
          uuidv4(),
          usuarioActualId(),
          ajuste.kind,
          new Date().toISOString(),
          ajuste.amount,
          cuenta.currency,
          cuenta.id,
          categoria.id,
        ],
      )
      onCerrar(true)
    } catch {
      setError("No se pudo guardar el ajuste")
      setGuardando(false)
    }
  }

  const diferencia = ajuste ? formatearMonto(ajuste.amount, { moneda: cuenta.currency }) : ""
  return (
    <Hoja abierta onOpenChange={(v) => !v && onCerrar(false)} titulo="Ajustar saldo">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Según Mango, <span className="font-medium text-foreground">{cuenta.name}</span> tiene{" "}
          {/* Texto y no Monto: dentro de una frase, el monto de lista dejaba un
              hueco (es de columna, alineado a la derecha). */}
          <span className="tabular font-medium text-foreground">
            {formatearMonto(saldo, { moneda: cuenta.currency })}
          </span>
          . Escribí el saldo que de verdad tiene, o hacé la cuenta: la diferencia queda como «Ajuste
          de cuenta».
        </p>
        <Calculadora moneda={cuenta.currency} inicial={saldo} conSigno onCambio={setNuevo} />
        <p role="status" className="text-sm">
          {ajuste
            ? `Se anota un ${ajuste.kind === "income" ? "ingreso" : "egreso"} de ${diferencia}.`
            : "Es el mismo saldo: no hay nada que anotar."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!ajuste || guardando} onClick={() => void guardar()}>
            Ajustar
          </Button>
          <Button variant="secondary" onClick={() => onCerrar(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    </Hoja>
  )
}
