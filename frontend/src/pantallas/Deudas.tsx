import { usePowerSync, useQuery } from "@powersync/react"
import { BellPlus, BellRing, HandCoins } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"

import { AccionesEdicion, AccionesFila } from "@/componentes/AccionesEdicion"
import { BotonNuevo, EncabezadoPantalla } from "@/componentes/EncabezadoPantalla"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Vacio } from "@/componentes/Vacio"
import { HojaAvisarme } from "@/componentes/recordatorios/HojaAvisarme"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useVinculados } from "@/hooks/useVinculados"
import { useVolver } from "@/hooks/useVolver"
import { aCentavos, aTextoEditable, formatearMonto } from "@/lib/dinero"
import { formatearFechaCorta } from "@/lib/fecha"
import { semillaDeDeuda } from "@/lib/recordatorios"
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
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver("/accesos")
  const db = usePowerSync()
  const { data: deudas } = useQuery<Deuda>(
    "SELECT id, direction, counterparty, description, amount, amount_settled, currency, due_date FROM debts WHERE deleted_at IS NULL ORDER BY settled_at IS NOT NULL, created_at",
  )
  const { porDeuda } = useVinculados()
  const [form, setForm] = useState(false)
  // La deuda abierta (tocar la fila): saldarla, el aviso y eliminarla.
  const [abierta, setAbierta] = useState<Deuda | null>(null)
  const [aBorrar, setABorrar] = useState<Deuda | null>(null)
  const [avisando, setAvisando] = useState<Deuda | null>(null)

  // "Saldar la deuda" desde el calendario de pagos (1.6.0): `?saldar=<id>` abre
  // su hoja, si todavia se debe.
  const [params, setParams] = useSearchParams()
  const pedida = params.get("saldar")
  const deudaPedida = deudas.find((x) => x.id === pedida && x.amount > x.amount_settled) ?? null
  // La de la consulta, no la guardada al tocar: con lo saldado al dia, y la
  // hoja se cierra sola si la deuda se elimino.
  const aVer = (abierta && deudas.find((x) => x.id === abierta.id)) || deudaPedida
  function cerrar() {
    setAbierta(null)
    if (pedida) setParams({}, { replace: true })
  }

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
            const aviso = porDeuda.get(d.id)
            // Tocar la fila abre la deuda: ahi se salda, se pide el aviso y se
            // elimina (y en escritorio, eliminar tambien sobre la fila).
            return (
              <FilaInset
                key={d.id}
                onClick={() => setAbierta(d)}
                chevron
                acciones={
                  <AccionesFila
                    nombre={`la deuda con ${d.counterparty}`}
                    onEliminar={() => setABorrar(d)}
                  />
                }
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.counterparty}</p>
                  {/* Sin cortar: al final va la fecha de vencimiento (1.5.1). */}
                  <p className="break-words text-xs text-muted-foreground">
                    {saldada
                      ? "Saldada"
                      : `Pendiente ${formatearMonto(pendiente, { moneda: d.currency })} de ${formatearMonto(d.amount, { moneda: d.currency })}`}
                    {d.description ? ` · ${d.description}` : ""}
                    {d.due_date ? ` · vence ${formatearFechaCorta(d.due_date)}` : ""}
                  </p>
                </div>
                {/* Ya tiene aviso del vencimiento: se ve desde la lista. */}
                {!saldada && aviso && (
                  <BellRing
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    role="img"
                    aria-label="Con aviso del vencimiento"
                  />
                )}
              </FilaInset>
            )
          })}
        </ListaInset>
      </section>
    )

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <EncabezadoPantalla
        titulo="Deudas y préstamos"
        volver={volver}
        acciones={<BotonNuevo etiqueta="Nueva deuda o préstamo" onClick={() => setForm(true)} />}
      />

      <Hoja abierta={form} onOpenChange={setForm} titulo="Nueva deuda o préstamo">
        <FormularioDeuda onCerrar={() => setForm(false)} />
      </Hoja>

      {deudas.length === 0 ? (
        <Vacio
          icono={HandCoins}
          titulo="Sin deudas ni préstamos"
          detalle="Anotá lo que te deben o lo que debés, fuera de un grupo."
          accion={{ onClick: () => setForm(true), etiqueta: "Nueva deuda o préstamo" }}
        />
      ) : (
        <div className="space-y-4">
          {seccion("Me deben", meDeben)}
          {seccion("Debo", debo)}
        </div>
      )}

      {aVer && (
        <HojaDeuda
          deuda={aVer}
          conAviso={porDeuda.has(aVer.id)}
          onAvisar={() => setAvisando(aVer)}
          onEliminar={() => setABorrar(aVer)}
          onCerrar={cerrar}
        />
      )}
      {avisando?.due_date && (
        <HojaAvisarme
          existente={porDeuda.get(avisando.id)}
          semilla={semillaDeDeuda({ ...avisando, due_date: avisando.due_date })}
          onCerrar={() => setAvisando(null)}
        />
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

// Una deuda: saldarla (todo o una parte) mientras se deba y, al pie, el aviso
// del vencimiento y eliminarla. El aviso y la confirmacion se abren encima.
function HojaDeuda({
  deuda,
  conAviso,
  onAvisar,
  onEliminar,
  onCerrar,
}: {
  deuda: Deuda
  conAviso: boolean
  onAvisar: () => void
  onEliminar: () => void
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const pendiente = deuda.amount - deuda.amount_settled
  const [monto, setMonto] = useState(aTextoEditable(pendiente, deuda.currency))
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
    <Hoja abierta onOpenChange={(v) => !v && onCerrar()} titulo={deuda.counterparty}>
      {pendiente > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pendiente:{" "}
            <span className="font-medium text-foreground">
              {formatearMonto(pendiente, { moneda: deuda.currency })}
            </span>{" "}
            de {formatearMonto(deuda.amount, { moneda: deuda.currency })}
            {deuda.due_date ? ` · vence ${formatearFechaCorta(deuda.due_date)}` : ""}.
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
      ) : (
        <p className="text-sm text-muted-foreground">
          Saldada: {formatearMonto(deuda.amount, { moneda: deuda.currency })}.
        </p>
      )}
      <AccionesEdicion onEliminar={onEliminar}>
        {/* "Avisarme" (1.6.0): solo con fecha, y mientras se deba. */}
        {pendiente > 0 && deuda.due_date && (
          <Button variant="ghost" className="justify-start" onClick={onAvisar}>
            {conAviso ? (
              <BellRing className="h-4 w-4" aria-hidden />
            ) : (
              <BellPlus className="h-4 w-4" aria-hidden />
            )}
            {conAviso ? "Recordatorio del vencimiento" : "Avisarme del vencimiento"}
          </Button>
        )}
      </AccionesEdicion>
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
        [
          uuidv4(),
          direction,
          counterparty.trim(),
          descripcion.trim() || null,
          centavos,
          fecha || null,
        ],
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
        <Button variant="secondary" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
