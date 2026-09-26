import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, HandCoins, Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { aCentavos, formatearMonto } from "@/lib/dinero"
import { uuidv4 } from "@/lib/uuid"

// Deudas y prestamos fuera de un grupo (fase 5). `receivable` = me deben (yo
// preste); `payable` = yo debo (me prestaron). Se saldan por partes.

interface Deuda {
  id: string
  direction: "payable" | "receivable"
  counterparty: string
  description: string | null
  amount: number
  amount_settled: number
  currency: string
  due_date: string | null
}

export function Deudas() {
  const navigate = useNavigate()
  const db = usePowerSync()
  const { data: deudas } = useQuery<Deuda>(
    "SELECT id, direction, counterparty, description, amount, amount_settled, currency, due_date FROM debts WHERE deleted_at IS NULL ORDER BY settled_at IS NOT NULL, created_at",
  )
  const [form, setForm] = useState(false)
  const [saldando, setSaldando] = useState<Deuda | null>(null)
  const [aBorrar, setABorrar] = useState<Deuda | null>(null)

  const meDeben = deudas.filter((d) => d.direction === "receivable")
  const debo = deudas.filter((d) => d.direction === "payable")

  async function borrar(d: Deuda) {
    await db.execute("DELETE FROM debts WHERE id = ?", [d.id])
    setABorrar(null)
  }

  const seccion = (titulo: string, lista: Deuda[]) =>
    lista.length > 0 && (
      <section>
        <h2 className="mb-1 text-sm font-semibold text-muted-foreground">{titulo}</h2>
        <ListaInset>
          {lista.map((d) => {
            const pendiente = d.amount - d.amount_settled
            const saldada = pendiente <= 0
            return (
              <FilaInset key={d.id}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.counterparty}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {saldada
                      ? "Saldada"
                      : `Pendiente ${formatearMonto(pendiente, { moneda: d.currency })} de ${formatearMonto(d.amount, { moneda: d.currency })}`}
                    {d.description ? ` · ${d.description}` : ""}
                    {d.due_date ? ` · vence ${d.due_date}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!saldada && (
                    <Button variant="outline" size="sm" onClick={() => setSaldando(d)}>
                      Saldar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-expense"
                    aria-label="Eliminar"
                    onClick={() => setABorrar(d)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </FilaInset>
            )
          })}
        </ListaInset>
      </section>
    )

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Deudas y préstamos</h1>
      </header>

      <Button className="w-full" onClick={() => setForm(true)}>
        Nueva
      </Button>
      <Hoja abierta={form} onOpenChange={setForm} titulo="Nueva deuda o préstamo">
        <FormularioDeuda onCerrar={() => setForm(false)} />
      </Hoja>

      {deudas.length === 0 ? (
        <Vacio
          icono={HandCoins}
          titulo="Sin deudas ni préstamos"
          detalle="Anotá lo que te deben o lo que debés, fuera de un grupo."
        />
      ) : (
        <div className="space-y-4">
          {seccion("Me deben", meDeben)}
          {seccion("Debo", debo)}
        </div>
      )}

      {saldando && (
        <SaldarDeuda deuda={saldando} onCerrar={() => setSaldando(null)} />
      )}
      <Confirmar
        abierta={aBorrar !== null}
        onOpenChange={(v) => !v && setABorrar(null)}
        titulo="Eliminar"
        detalle={aBorrar ? `Se elimina la deuda con "${aBorrar.counterparty}".` : undefined}
        etiqueta="Eliminar"
        destructivo
        onConfirmar={() => aBorrar && borrar(aBorrar)}
      />
    </div>
  )
}

function SaldarDeuda({ deuda, onCerrar }: { deuda: Deuda; onCerrar: () => void }) {
  const db = usePowerSync()
  const pendiente = deuda.amount - deuda.amount_settled
  const [monto, setMonto] = useState((pendiente / 100).toString().replace(".", ","))
  const [error, setError] = useState("")

  async function guardar() {
    const centavos = aCentavos(monto, deuda.currency) ?? 0
    if (centavos <= 0) return setError("Poné un monto")
    if (centavos > pendiente) return setError("No puede superar lo pendiente")
    await db.execute("UPDATE debts SET amount_settled = ? WHERE id = ?", [
      deuda.amount_settled + centavos,
      deuda.id,
    ])
    onCerrar()
  }

  return (
    <Hoja abierta onOpenChange={(v) => !v && onCerrar()} titulo="Saldar">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pendiente con <span className="font-medium text-foreground">{deuda.counterparty}</span>:{" "}
          {formatearMonto(pendiente, { moneda: deuda.currency })}.
        </p>
        <Campo etiqueta={`Monto a saldar (${deuda.currency})`}>
          <Input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            className="tabular"
          />
        </Campo>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={guardar}>
          Saldar
        </Button>
      </div>
    </Hoja>
  )
}

function FormularioDeuda({ onCerrar }: { onCerrar: () => void }) {
  const db = usePowerSync()
  const [direction, setDirection] = useState<"payable" | "receivable">("receivable")
  const [counterparty, setCounterparty] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [monto, setMonto] = useState("")
  const [fecha, setFecha] = useState("")
  const [error, setError] = useState("")

  async function guardar() {
    if (!counterparty.trim()) return setError("Poné con quién")
    const centavos = aCentavos(monto) ?? 0
    if (centavos <= 0) return setError("Poné un monto")
    try {
      await db.execute(
        "INSERT INTO debts (id, direction, counterparty, description, amount, currency, amount_settled, due_date) VALUES (?, ?, ?, ?, ?, 'ARS', 0, ?)",
        [uuidv4(), direction, counterparty.trim(), descripcion.trim() || null, centavos, fecha || null],
      )
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Tipo">
        <SelectorEntidad
          titulo="Tipo"
          placeholder="Elegí"
          opciones={[
            { id: "receivable", nombre: "Me deben (presté)" },
            { id: "payable", nombre: "Debo (me prestaron)" },
          ]}
          valor={direction}
          onCambio={(v) => setDirection(v as "payable" | "receivable")}
        />
      </Campo>
      <Campo etiqueta="Con quién">
        <Input
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="Juan"
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Monto (ARS)">
          <Input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            className="tabular"
          />
        </Campo>
        <Campo etiqueta="Vence (opcional)">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
      </div>
      <Campo etiqueta="Nota (opcional)">
        <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </Campo>
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
