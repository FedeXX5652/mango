import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import { aCentavos, formatearSaldo } from "@/lib/dinero"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

interface Cuenta {
  id: string
  name: string
  type: string
  currency: string
  opening_balance: number
  off_budget: number
  archived: number
}

const TIPOS: Record<string, string> = {
  cash: "Efectivo",
  bank: "Banco",
  savings: "Caja de ahorro",
  credit_card: "Tarjeta de crédito",
  investment: "Inversión",
  loan: "Préstamo",
  other: "Otra",
}

export function Cuentas() {
  const navigate = useNavigate()
  const db = usePowerSync()
  const { data: cuentas } = useQuery<Cuenta>(
    "SELECT id, name, type, currency, opening_balance, off_budget, archived FROM accounts WHERE deleted_at IS NULL ORDER BY archived, sort_order, created_at",
  )
  const [editando, setEditando] = useState<Cuenta | "nuevo" | null>(null)

  async function archivar(c: Cuenta, valor: number) {
    await db.execute("UPDATE accounts SET archived = ? WHERE id = ?", [valor, c.id])
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Cuentas</h1>
      </header>

      {editando ? (
        <FormularioCuenta
          inicial={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
        />
      ) : (
        <Button className="w-full" onClick={() => setEditando("nuevo")}>
          Nueva cuenta
        </Button>
      )}

      <ul className="divide-y divide-border">
        {cuentas.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className={cn("truncate font-medium", c.archived && "text-muted-foreground")}>
                {c.name}
                {c.archived === 1 && " · archivada"}
              </p>
              <p className="text-xs text-muted-foreground">
                {TIPOS[c.type] ?? c.type} · {c.currency} · {formatearSaldo(c.opening_balance, c.currency)} inicial
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditando(c)}>
                Editar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => archivar(c, c.archived ? 0 : 1)}>
                {c.archived ? "Desarchivar" : "Archivar"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FormularioCuenta({ inicial, onCerrar }: { inicial: Cuenta | null; onCerrar: () => void }) {
  const db = usePowerSync()
  const [name, setName] = useState(inicial?.name ?? "")
  const [type, setType] = useState(inicial?.type ?? "cash")
  const [currency, setCurrency] = useState(inicial?.currency ?? "ARS")
  const [apertura, setApertura] = useState(
    inicial ? (inicial.opening_balance / 100).toString().replace(".", ",") : "",
  )
  const [offBudget, setOffBudget] = useState(inicial?.off_budget === 1)
  const [error, setError] = useState("")

  async function guardar() {
    if (!name.trim()) return setError("Poné un nombre")
    if (!/^[A-Za-z]{3}$/.test(currency)) return setError("Moneda: 3 letras (ej. ARS)")
    const opening = apertura.trim() ? (aCentavos(apertura) ?? 0) : 0
    const cur = currency.toUpperCase()

    if (inicial) {
      await db.execute(
        "UPDATE accounts SET name = ?, type = ?, currency = ?, opening_balance = ?, off_budget = ? WHERE id = ?",
        [name.trim(), type, cur, opening, offBudget ? 1 : 0, inicial.id],
      )
    } else {
      await db.execute(
        `INSERT INTO accounts (id, name, type, currency, opening_balance, off_budget, visibility, archived, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'private', 0, 0)`,
        [uuidv4(), name.trim(), type, cur, opening, offBudget ? 1 : 0],
      )
    }
    onCerrar()
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <Campo etiqueta="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Caja de ahorro" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TIPOS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Moneda">
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
        </Campo>
      </div>
      <Campo etiqueta="Saldo inicial (opcional)">
        <Input value={apertura} onChange={(e) => setApertura(e.target.value)} placeholder="0" inputMode="decimal" />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={offBudget} onChange={(e) => setOffBudget(e.target.checked)} />
        No contar en el patrimonio (plata de terceros)
      </label>
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
