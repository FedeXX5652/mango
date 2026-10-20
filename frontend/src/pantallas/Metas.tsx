import { usePowerSync, useQuery } from "@powersync/react"
import { ChevronRight, Target } from "lucide-react"
import { useMemo, useState } from "react"

import { AccionesEdicion, AccionesFila } from "@/componentes/AccionesEdicion"
import { BotonNuevo, EncabezadoPantalla } from "@/componentes/EncabezadoPantalla"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { useVolver } from "@/hooks/useVolver"
import { aCentavos, aTextoEditable, formatearMonto } from "@/lib/dinero"
import { formatearFechaCorta } from "@/lib/fecha"
import { saldoCuenta } from "@/lib/saldos"
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

// Saldo por cuenta (la formula unica, lib/saldos), para el progreso.
const SQL_SALDOS = `
  SELECT a.id, a.name, a.currency, ${saldoCuenta()} AS balance
  FROM accounts a WHERE a.deleted_at IS NULL AND a.owner_id IS NOT NULL`

export function Metas() {
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver("/accesos")
  const db = usePowerSync()
  const { data: metas } = useQuery<Meta>(
    "SELECT id, name, target_amount, currency, target_date, account_id FROM goals WHERE deleted_at IS NULL AND archived = 0 ORDER BY created_at",
  )
  const { data: cuentas } = useQuery<{
    id: string
    name: string
    currency: string
    balance: number
  }>(SQL_SALDOS)
  const saldoDe = useMemo(() => new Map(cuentas.map((c) => [c.id, c.balance])), [cuentas])

  const [form, setForm] = useState(false)
  // Tocar una meta la edita (eliminar, al pie). Se cierra sola si la meta ya no
  // esta (se elimino desde ahi).
  const [editando, setEditando] = useState<Meta | null>(null)
  const editandoVigente = editando !== null && metas.some((m) => m.id === editando.id)
  const [aBorrar, setABorrar] = useState<Meta | null>(null)

  async function borrar(m: Meta) {
    await db.execute("DELETE FROM goals WHERE id = ?", [m.id])
    setABorrar(null)
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <EncabezadoPantalla
        titulo="Metas de ahorro"
        volver={volver}
        acciones={<BotonNuevo etiqueta="Nueva meta" onClick={() => setForm(true)} />}
      />

      <Hoja abierta={form} onOpenChange={setForm} titulo="Nueva meta">
        <FormularioMeta cuentas={cuentas} onCerrar={() => setForm(false)} />
      </Hoja>
      <Hoja
        abierta={editandoVigente}
        onOpenChange={(v) => !v && setEditando(null)}
        titulo="Editar meta"
      >
        {editando && (
          <FormularioMeta
            key={editando.id}
            cuentas={cuentas}
            inicial={editando}
            onCerrar={() => setEditando(null)}
          />
        )}
        {editando && <AccionesEdicion onEliminar={() => setABorrar(editando)} />}
      </Hoja>

      {metas.length === 0 ? (
        <Vacio
          icono={Target}
          titulo="Sin metas"
          detalle="Poné un objetivo de ahorro y seguí el progreso contra una cuenta."
          accion={{ onClick: () => setForm(true), etiqueta: "Nueva meta" }}
        />
      ) : (
        <div className="space-y-3">
          {metas.map((m) => {
            const usado = m.account_id ? (saldoDe.get(m.account_id) ?? 0) : 0
            const pct =
              m.target_amount > 0 ? Math.min(100, Math.round((usado / m.target_amount) * 100)) : 0
            const listo = usado >= m.target_amount && m.target_amount > 0
            // La tarjeta entera abre la edicion. En escritorio, eliminar
            // aparece tambien arriba a la derecha con el mouse o el teclado
            // (como las acciones de una fila, FilaInset).
            return (
              <div key={m.id} className="group/fila relative">
                <button
                  type="button"
                  onClick={() => setEditando(m)}
                  className="block w-full rounded-xl bg-card p-4 text-left shadow-tarjeta transition-colors duration-100 ease-salida hover:bg-muted/50 active:bg-muted/50"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatearMonto(usado, { moneda: m.currency })} de{" "}
                        {formatearMonto(m.target_amount, { moneda: m.currency })}
                        {m.target_date ? ` · para el ${formatearFechaCorta(m.target_date)}` : ""}
                      </span>
                    </span>
                    <ChevronRight
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-2 block h-2 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        listo ? "bg-income" : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="mt-1 block text-right text-xs text-muted-foreground">
                    {listo ? "¡Meta cumplida!" : `${pct}%`}
                  </span>
                </button>
                <div className="absolute right-2 top-2 hidden rounded-lg bg-card lg:pointer-events-none lg:flex lg:opacity-0 lg:transition-opacity lg:duration-100 lg:ease-salida lg:group-hover/fila:pointer-events-auto lg:group-hover/fila:opacity-100 lg:group-has-[:focus-visible]/fila:pointer-events-auto lg:group-has-[:focus-visible]/fila:opacity-100">
                  <AccionesFila nombre={m.name} onEliminar={() => setABorrar(m)} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Confirmar
        abierta={aBorrar !== null}
        onOpenChange={(v) => !v && setABorrar(null)}
        titulo="Eliminar meta"
        detalle={
          aBorrar ? `Se elimina "${aBorrar.name}". La cuenta y su plata no se tocan.` : undefined
        }
        etiqueta="Eliminar"
        destructivo
        onConfirmar={() => {
          if (aBorrar) void borrar(aBorrar)
          setEditando(null)
        }}
      />
    </div>
  )
}

// Alta o edicion (`inicial`) de una meta. La moneda la fija la cuenta al
// crearla y despues no cambia (el servidor no la deja cambiar): al editar se
// elige entre las cuentas de esa moneda.
function FormularioMeta({
  cuentas,
  inicial,
  onCerrar,
}: {
  cuentas: { id: string; name: string; currency: string }[]
  inicial?: Meta
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const [name, setName] = useState(inicial?.name ?? "")
  const [monto, setMonto] = useState(
    inicial ? aTextoEditable(inicial.target_amount, inicial.currency) : "",
  )
  const [cuentaId, setCuentaId] = useState(inicial?.account_id ?? "")
  const [fecha, setFecha] = useState(inicial?.target_date ?? "")
  const [error, setError] = useState("")

  const moneda = inicial?.currency ?? cuentas.find((c) => c.id === cuentaId)?.currency ?? "ARS"
  const elegibles = inicial ? cuentas.filter((c) => c.currency === inicial.currency) : cuentas

  async function guardar() {
    if (!name.trim()) return setError("Poné un nombre")
    const centavos = aCentavos(monto, moneda) ?? 0
    if (centavos <= 0) return setError("Poné un monto objetivo")
    try {
      if (inicial) {
        await db.execute(
          "UPDATE goals SET name = ?, target_amount = ?, target_date = ?, account_id = ? WHERE id = ?",
          [name.trim(), centavos, fecha || null, cuentaId || null, inicial.id],
        )
      } else {
        await db.execute(
          "INSERT INTO goals (id, name, target_amount, currency, target_date, account_id, archived) VALUES (?, ?, ?, ?, ?, ?, 0)",
          [uuidv4(), name.trim(), centavos, moneda, fecha || null, cuentaId || null],
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
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vacaciones" />
      </Campo>
      <Campo etiqueta="Cuenta donde ahorrás">
        <SelectorEntidad
          titulo="Cuenta"
          placeholder="Elegí una cuenta"
          opciones={elegibles.map((c) => ({ id: c.id, nombre: c.name, detalle: c.currency }))}
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
        <Button variant="secondary" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
