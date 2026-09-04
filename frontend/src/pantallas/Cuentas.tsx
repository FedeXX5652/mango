import { usePowerSync, useQuery } from "@powersync/react"
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Aviso, Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Select } from "@/componentes/ui/select"
import { iconoCuenta } from "@/lib/cuentas"
import { moverEnOrden } from "@/lib/orden"
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
  // Cuentas referenciadas por algo: no se pueden eliminar (dejarian huerfano lo
  // que apunta a ellas). Se pueden archivar. El resto si se puede borrar.
  const { data: enUsoRows } = useQuery<{ id: string }>(
    `SELECT account_id AS id FROM transactions WHERE deleted_at IS NULL AND account_id IS NOT NULL
     UNION SELECT transfer_account_id FROM transactions WHERE deleted_at IS NULL AND transfer_account_id IS NOT NULL
     UNION SELECT account_id FROM payment_method_accounts WHERE deleted_at IS NULL AND account_id IS NOT NULL
     UNION SELECT account_id FROM templates WHERE deleted_at IS NULL AND account_id IS NOT NULL
     UNION SELECT account_id FROM recurring_rules WHERE deleted_at IS NULL AND account_id IS NOT NULL
     UNION SELECT transfer_account_id FROM recurring_rules WHERE deleted_at IS NULL AND transfer_account_id IS NOT NULL`,
  )
  const enUso = useMemo(() => new Set(enUsoRows.map((r) => r.id)), [enUsoRows])
  // Movimientos por cuenta (origen o destino), para el motivo del aviso.
  const { data: movsRows } = useQuery<{ id: string; n: number }>(
    `SELECT id, SUM(n) AS n FROM (
       SELECT account_id AS id, COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL AND account_id IS NOT NULL GROUP BY account_id
       UNION ALL
       SELECT transfer_account_id AS id, COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL AND transfer_account_id IS NOT NULL GROUP BY transfer_account_id
     ) GROUP BY id`,
  )
  const movs = useMemo(() => new Map(movsRows.map((r) => [r.id, r.n])), [movsRows])

  const [editando, setEditando] = useState<Cuenta | "nuevo" | null>(null)
  const [accion, setAccion] = useState<{ tipo: "archivar" | "eliminar"; c: Cuenta } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Modo ordenar: cambia las acciones por flechas, para no amontonar iconos.
  const [ordenando, setOrdenando] = useState(false)

  async function archivar(c: Cuenta, valor: number) {
    await db.execute("UPDATE accounts SET archived = ? WHERE id = ?", [valor, c.id])
  }
  async function borrar(c: Cuenta) {
    await db.execute("DELETE FROM accounts WHERE id = ?", [c.id])
  }

  function motivo(c: Cuenta): string {
    const n = movs.get(c.id) ?? 0
    return n > 0
      ? `No se puede eliminar: tiene ${n} movimiento${n === 1 ? "" : "s"} asociado${n === 1 ? "" : "s"}. Archivala en su lugar.`
      : "No se puede eliminar: está en uso (medios de pago, plantillas o recurrentes). Archivala en su lugar."
  }
  function alTacho(c: Cuenta) {
    if (enUso.has(c.id)) setAviso(motivo(c))
    else setAccion({ tipo: "eliminar", c })
  }
  function alArchivar(c: Cuenta) {
    if (c.archived) archivar(c, 0) // desarchivar es reversible: directo
    else setAccion({ tipo: "archivar", c })
  }

  const activas = cuentas.filter((c) => !c.archived)
  const archivadas = cuentas.filter((c) => c.archived)

  async function mover(c: Cuenta, delta: -1 | 1) {
    await moverEnOrden(
      db,
      "UPDATE accounts SET sort_order = ? WHERE id = ?",
      activas,
      activas.findIndex((x) => x.id === c.id),
      delta,
    )
  }

  function filaCuenta(c: Cuenta, i?: number) {
    const Icono = iconoCuenta(c.type)
    const eliminable = !enUso.has(c.id)
    return (
      <FilaInset key={c.id}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={cn("truncate font-medium", c.archived && "text-muted-foreground")}>
              {c.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {TIPOS[c.type] ?? c.type} · {c.currency} ·{" "}
              {formatearSaldo(c.opening_balance, c.currency)} inicial
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {ordenando && i !== undefined ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Subir"
                disabled={i === 0}
                onClick={() => mover(c, -1)}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Bajar"
                disabled={i === activas.length - 1}
                onClick={() => mover(c, 1)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar"
                onClick={() => setEditando(c)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={c.archived ? "Desarchivar" : "Archivar"}
                onClick={() => alArchivar(c)}
              >
                {c.archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar"
                aria-disabled={!eliminable}
                className={eliminable ? "text-expense" : "text-muted-foreground/40"}
                onClick={() => alTacho(c)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </FilaInset>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Cuentas</h1>
      </header>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setEditando("nuevo")}>
          Nueva cuenta
        </Button>
        <Button
          variant={ordenando ? "default" : "outline"}
          onClick={() => setOrdenando((o) => !o)}
          disabled={activas.length < 2}
        >
          {ordenando ? "Listo" : "Ordenar"}
        </Button>
      </div>
      <Hoja
        abierta={editando !== null}
        onOpenChange={(v) => {
          if (!v) setEditando(null)
        }}
        titulo={editando === "nuevo" ? "Nueva cuenta" : "Editar cuenta"}
      >
        {editando && (
          <FormularioCuenta
            inicial={editando === "nuevo" ? null : editando}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Hoja>

      {activas.length > 0 && (
        <ListaInset>{activas.map((c, i) => filaCuenta(c, i))}</ListaInset>
      )}

      {archivadas.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">Archivadas</h2>
          <ListaInset>{archivadas.map(filaCuenta)}</ListaInset>
        </section>
      )}

      <Confirmar
        abierta={accion !== null}
        onOpenChange={(v) => {
          if (!v) setAccion(null)
        }}
        titulo={accion?.tipo === "eliminar" ? "Eliminar cuenta" : "Archivar cuenta"}
        detalle={
          accion?.tipo === "eliminar"
            ? `Se elimina "${accion.c.name}". No tiene movimientos.`
            : accion
              ? `"${accion.c.name}" se oculta de los selectores, pero conserva su historial. Podés desarchivarla cuando quieras.`
              : undefined
        }
        etiqueta={accion?.tipo === "eliminar" ? "Eliminar" : "Archivar"}
        destructivo={accion?.tipo === "eliminar"}
        onConfirmar={() => {
          if (!accion) return
          if (accion.tipo === "eliminar") borrar(accion.c)
          else archivar(accion.c, 1)
        }}
      />
      <Aviso
        abierta={aviso !== null}
        onOpenChange={(v) => {
          if (!v) setAviso(null)
        }}
        titulo="No se puede eliminar"
        detalle={aviso ?? ""}
      />
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

    try {
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
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
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
