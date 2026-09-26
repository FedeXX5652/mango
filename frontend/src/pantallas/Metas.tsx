import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, Target, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { aCentavos, formatearMonto } from "@/lib/dinero"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

// Metas de ahorro (fase 5). Cada meta se asocia a una cuenta; el progreso es el
// saldo de esa cuenta contra el objetivo. Escribe local (goals) y sube por /goals.

interface Meta {
  id: string
  name: string
  target_amount: number
  currency: string
  target_date: string | null
  account_id: string | null
}

// Saldo por cuenta (misma convencion que Inicio/0005), para el progreso.
const SQL_SALDOS = `
  SELECT a.id, a.name, a.currency,
    a.opening_balance
    + COALESCE((SELECT SUM(COALESCE(amount_account, amount)) FROM transactions WHERE account_id = a.id AND kind='income' AND status='confirmed' AND deleted_at IS NULL), 0)
    - COALESCE((SELECT SUM(COALESCE(amount_account, amount)) FROM transactions WHERE account_id = a.id AND kind='expense' AND status='confirmed' AND deleted_at IS NULL), 0)
    + COALESCE((SELECT SUM(amount) FROM transactions WHERE transfer_account_id = a.id AND kind='transfer' AND status='confirmed' AND deleted_at IS NULL), 0)
    - COALESCE((SELECT SUM(COALESCE(amount_account, amount)) FROM transactions WHERE account_id = a.id AND kind='transfer' AND status='confirmed' AND deleted_at IS NULL), 0)
    - COALESCE((SELECT SUM(amount) FROM settlements WHERE account_id = a.id AND deleted_at IS NULL), 0)
    AS balance
  FROM accounts a WHERE a.deleted_at IS NULL AND a.owner_id IS NOT NULL`

export function Metas() {
  const navigate = useNavigate()
  const db = usePowerSync()
  const { data: metas } = useQuery<Meta>(
    "SELECT id, name, target_amount, currency, target_date, account_id FROM goals WHERE deleted_at IS NULL AND archived = 0 ORDER BY created_at",
  )
  const { data: cuentas } = useQuery<{ id: string; name: string; currency: string; balance: number }>(
    SQL_SALDOS,
  )
  const saldoDe = useMemo(() => new Map(cuentas.map((c) => [c.id, c.balance])), [cuentas])

  const [form, setForm] = useState(false)
  const [aBorrar, setABorrar] = useState<Meta | null>(null)

  async function borrar(m: Meta) {
    await db.execute("DELETE FROM goals WHERE id = ?", [m.id])
    setABorrar(null)
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Metas de ahorro</h1>
      </header>

      <Button className="w-full" onClick={() => setForm(true)}>
        Nueva meta
      </Button>
      <Hoja abierta={form} onOpenChange={setForm} titulo="Nueva meta">
        <FormularioMeta cuentas={cuentas} onCerrar={() => setForm(false)} />
      </Hoja>

      {metas.length === 0 ? (
        <Vacio
          icono={Target}
          titulo="Sin metas"
          detalle="Poné un objetivo de ahorro y seguí el progreso contra una cuenta."
        />
      ) : (
        <div className="space-y-3">
          {metas.map((m) => {
            const usado = m.account_id ? (saldoDe.get(m.account_id) ?? 0) : 0
            const pct = m.target_amount > 0 ? Math.min(100, Math.round((usado / m.target_amount) * 100)) : 0
            const listo = usado >= m.target_amount && m.target_amount > 0
            return (
              <section key={m.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatearMonto(usado, { moneda: m.currency })} de{" "}
                      {formatearMonto(m.target_amount, { moneda: m.currency })}
                      {m.target_date ? ` · para ${m.target_date}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-expense"
                    aria-label="Eliminar"
                    onClick={() => setABorrar(m)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", listo ? "bg-income" : "bg-primary")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  {listo ? "¡Meta cumplida!" : `${pct}%`}
                </p>
              </section>
            )
          })}
        </div>
      )}

      <Confirmar
        abierta={aBorrar !== null}
        onOpenChange={(v) => !v && setABorrar(null)}
        titulo="Eliminar meta"
        detalle={aBorrar ? `Se elimina "${aBorrar.name}". La cuenta y su plata no se tocan.` : undefined}
        etiqueta="Eliminar"
        destructivo
        onConfirmar={() => aBorrar && borrar(aBorrar)}
      />
    </div>
  )
}

function FormularioMeta({
  cuentas,
  onCerrar,
}: {
  cuentas: { id: string; name: string; currency: string }[]
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const [name, setName] = useState("")
  const [monto, setMonto] = useState("")
  const [cuentaId, setCuentaId] = useState("")
  const [fecha, setFecha] = useState("")
  const [error, setError] = useState("")

  const moneda = cuentas.find((c) => c.id === cuentaId)?.currency ?? "ARS"

  async function guardar() {
    if (!name.trim()) return setError("Poné un nombre")
    const centavos = aCentavos(monto, moneda) ?? 0
    if (centavos <= 0) return setError("Poné un monto objetivo")
    try {
      await db.execute(
        "INSERT INTO goals (id, name, target_amount, currency, target_date, account_id, archived) VALUES (?, ?, ?, ?, ?, ?, 0)",
        [uuidv4(), name.trim(), centavos, moneda, fecha || null, cuentaId || null],
      )
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vacaciones" />
      </Campo>
      <Campo etiqueta="Cuenta donde ahorrás">
        <SelectorEntidad
          titulo="Cuenta"
          placeholder="Elegí una cuenta"
          opciones={cuentas.map((c) => ({ id: c.id, nombre: c.name, detalle: c.currency }))}
          valor={cuentaId}
          onCambio={setCuentaId}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta={`Objetivo (${moneda})`}>
          <Input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            className="tabular"
            placeholder="500000"
          />
        </Campo>
        <Campo etiqueta="Fecha límite (opcional)">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={guardar}>
          Guardar
        </Button>
        <Button variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
