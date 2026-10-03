import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { Monto } from "@/componentes/Monto"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Select } from "@/componentes/ui/select"
import { rutaMoverPlata } from "@/lib/espacios"
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
  // Con una sola conjunta, poner o sacar ya la trae elegida; con varias, se
  // elige en el formulario.
  const unica = cuentas.length === 1 ? cuentas[0].id : undefined

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

      {/* Poner o sacar plata (0017, 0026): una transferencia entre una cuenta
          propia y la conjunta, con la conjunta ya elegida. */}
      {cuentas.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Link to={rutaMoverPlata(groupId, "poner", unica)} className={ACCION}>
            <ArrowDownToLine className="h-4 w-4" aria-hidden />
            Poner plata
          </Link>
          <Link to={rutaMoverPlata(groupId, "sacar", unica)} className={ACCION}>
            <ArrowUpFromLine className="h-4 w-4" aria-hidden />
            Sacar plata
          </Link>
        </div>
      )}

      <HojaNuevaConjunta groupId={groupId} abierta={abierto} onOpenChange={setAbierto} />
    </section>
  )
}

const ACCION =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

// Crear una cuenta conjunta. La usa la seccion de arriba y el acceso "Poner
// plata" de un grupo que todavia no tiene ninguna (`onCreada` sigue al
// formulario con la cuenta nueva).
export function HojaNuevaConjunta({
  groupId,
  abierta,
  onOpenChange,
  onCreada,
  detalle,
}: {
  groupId: string
  abierta: boolean
  onOpenChange: (v: boolean) => void
  onCreada?: (id: string) => void
  detalle?: string
}) {
  const db = usePowerSync()
  const { data: grupoRows } = useQuery<{ base_currency: string }>(
    "SELECT base_currency FROM groups WHERE id = ?",
    [groupId],
  )
  const monedaGrupo = grupoRows[0]?.base_currency ?? "ARS"
  const [nombre, setNombre] = useState("")
  const [tipo, setTipo] = useState("bank")
  const [error, setError] = useState("")

  async function crear() {
    if (!nombre.trim()) return setError("Poné un nombre")
    const id = uuidv4()
    try {
      await db.execute(
        `INSERT INTO accounts (id, group_id, name, type, currency, opening_balance, off_budget, visibility, archived, sort_order)
         VALUES (?, ?, ?, ?, ?, 0, 0, 'shared', 0, 0)`,
        [id, groupId, nombre.trim(), tipo, monedaGrupo],
      )
      setNombre("")
      onOpenChange(false)
      onCreada?.(id)
    } catch {
      setError("No se pudo crear")
    }
  }

  return (
    <Hoja abierta={abierta} onOpenChange={onOpenChange} titulo="Nueva cuenta conjunta">
      <div className="space-y-3">
        {detalle && <p className="text-sm text-muted-foreground">{detalle}</p>}
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
  )
}
