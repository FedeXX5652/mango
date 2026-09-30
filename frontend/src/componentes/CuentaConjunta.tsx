import { usePowerSync, useQuery } from "@powersync/react"
import { useState } from "react"

import { Monto } from "@/componentes/Monto"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Select } from "@/componentes/ui/select"
import { TX_GRUPO } from "@/lib/lente"
import { saldoCuenta } from "@/lib/saldos"
import { uuidv4 } from "@/lib/uuid"

// Cuenta(s) conjunta(s) del grupo (fase 3b, ver 0016): cuentas del grupo
// (owner_id NULL). La plata es de todos; lo que se paga con ellas suma al gasto
// del grupo pero no genera deuda. Cualquier miembro la crea. Se escribe local
// (accounts con group_id) y sube por /accounts.

interface CuentaSaldo {
  id: string
  name: string
  currency: string
  balance: number
}

const TIPOS = [
  { valor: "cash", etiqueta: "Efectivo" },
  { valor: "bank", etiqueta: "Banco" },
  { valor: "savings", etiqueta: "Caja de ahorro" },
]

export function CuentaConjunta({ groupId }: { groupId: string }) {
  const db = usePowerSync()
  const { data: grupoRows } = useQuery<{ base_currency: string }>(
    "SELECT base_currency FROM groups WHERE id = ?",
    [groupId],
  )
  const monedaGrupo = grupoRows[0]?.base_currency ?? "ARS"

  // Saldo por cuenta conjunta: la formula unica (lib/saldos) sobre el LENTE del
  // grupo, no sobre `transactions`. La cuenta es de todos: su saldo lleva lo
  // que puso y pago cada miembro, y eso solo esta junto en el lente (0021).
  const { data: cuentas } = useQuery<CuentaSaldo>(
    `SELECT a.id, a.name, a.currency, ${saldoCuenta(TX_GRUPO)} AS balance
     FROM accounts a
     WHERE a.group_id = ? AND a.deleted_at IS NULL AND a.archived = 0
     ORDER BY a.sort_order, a.created_at`,
    [groupId],
  )

  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState("")
  const [tipo, setTipo] = useState("bank")
  const [error, setError] = useState("")

  async function crear() {
    if (!nombre.trim()) return setError("Poné un nombre")
    try {
      await db.execute(
        `INSERT INTO accounts (id, group_id, name, type, currency, opening_balance, off_budget, visibility, archived, sort_order)
         VALUES (?, ?, ?, ?, ?, 0, 0, 'shared', 0, 0)`,
        [uuidv4(), groupId, nombre.trim(), tipo, monedaGrupo],
      )
      setNombre("")
      setAbierto(false)
    } catch {
      setError("No se pudo crear")
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Cuenta conjunta</h2>
        <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
          Nueva
        </Button>
      </div>

      {cuentas.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Sin cuentas conjuntas. Creá una para pagar gastos con plata del grupo: no generan deuda
          entre los miembros.
        </p>
      ) : (
        <ListaInset>
          {cuentas.map((c) => (
            <FilaInset key={c.id}>
              <span className="truncate">{c.name}</span>
              <Monto
                centavos={c.balance}
                moneda={c.currency}
                variante="lista"
                className="font-medium"
              />
            </FilaInset>
          ))}
        </ListaInset>
      )}

      <Hoja abierta={abierto} onOpenChange={setAbierto} titulo="Nueva cuenta conjunta">
        <div className="space-y-3">
          <Campo etiqueta="Nombre">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Caja común"
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Select>
          </Campo>
          <p className="text-xs text-muted-foreground">Moneda: {monedaGrupo} (la del grupo).</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={crear} disabled={!nombre.trim()}>
            Crear cuenta conjunta
          </Button>
        </div>
      </Hoja>
    </section>
  )
}
