import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, Coins, Pencil, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Select } from "@/componentes/ui/select"
import { useMonedaBase } from "@/hooks/monedaBase"
import { fechaISO, formatearFechaCorta } from "@/lib/fecha"
import { ordenarMonedas } from "@/lib/monedas"
import { uuidv4 } from "@/lib/uuid"

interface Cotizacion {
  id: string
  base_currency: string
  quote_currency: string
  rate: string
  rate_date: string
  source: string
}

// Las que conviven en Argentina. Es texto libre en la base: esta lista es solo
// para no tipearlas mal (ver 0005).
const FUENTES = ["oficial", "mep", "tarjeta", "manual"]

export function Cotizaciones() {
  const navigate = useNavigate()
  const db = usePowerSync()
  const base = useMonedaBase()

  const { data: filas } = useQuery<Cotizacion>(
    `SELECT id, base_currency, quote_currency, rate, rate_date, source
     FROM exchange_rates WHERE deleted_at IS NULL
     ORDER BY rate_date DESC, base_currency`,
  )
  // Monedas de las cuentas: son las que hay que cotizar. La base no se cotiza
  // contra si misma.
  const { data: monedaRows } = useQuery<{ currency: string }>(
    "SELECT DISTINCT currency FROM accounts WHERE deleted_at IS NULL",
  )
  const extranjeras = useMemo(
    () => ordenarMonedas(monedaRows.map((r) => r.currency), base).filter((m) => m !== base),
    [monedaRows, base],
  )

  const [editando, setEditando] = useState<Cotizacion | "nueva" | null>(null)
  const [borrando, setBorrando] = useState<Cotizacion | null>(null)

  async function borrar(c: Cotizacion) {
    await db.execute("DELETE FROM exchange_rates WHERE id = ?", [c.id])
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Cotizaciones</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        La cotización se usa para <strong>ver</strong>: convierte el patrimonio a una sola moneda.
        Nunca cambia un movimiento ya cargado, que conserva la cotización que se le aplicó.
      </p>

      {extranjeras.length === 0 ? (
        <Vacio
          icono={Coins}
          titulo="No hace falta ninguna cotización"
          detalle={`Todas tus cuentas están en ${base}. Cuando tengas una cuenta en otra moneda, acá cargás cuánto vale.`}
        />
      ) : (
        <Button className="w-full" onClick={() => setEditando("nueva")}>
          Nueva cotización
        </Button>
      )}

      <Hoja
        abierta={editando !== null}
        onOpenChange={(v) => {
          if (!v) setEditando(null)
        }}
        titulo={editando === "nueva" ? "Nueva cotización" : "Editar cotización"}
      >
        {editando && (
          <FormCotizacion
            inicial={editando === "nueva" ? null : editando}
            base={base}
            extranjeras={extranjeras}
            existentes={filas}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Hoja>

      {filas.length === 0 ? (
        extranjeras.length > 0 && (
          <Vacio
            icono={Coins}
            titulo="Sin cotizaciones"
            detalle="Cargá la primera y el patrimonio va a poder mostrarse en una sola moneda."
          />
        )
      ) : (
        <ListaInset>
          {filas.map((c) => (
            <FilaInset key={c.id}>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  1 {c.base_currency} = {formatearRate(c.rate)} {c.quote_currency}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatearFechaCorta(c.rate_date)} · {c.source}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
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
                  aria-label="Eliminar"
                  className="text-expense"
                  onClick={() => setBorrando(c)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </FilaInset>
          ))}
        </ListaInset>
      )}

      <Confirmar
        abierta={borrando !== null}
        onOpenChange={(v) => {
          if (!v) setBorrando(null)
        }}
        titulo="Eliminar cotización"
        detalle={
          borrando
            ? `Se elimina la cotización del ${formatearFechaCorta(borrando.rate_date)}. Los movimientos ya cargados no cambian: cada uno guarda la suya.`
            : undefined
        }
        etiqueta="Eliminar"
        destructivo
        onConfirmar={() => {
          if (borrando) borrar(borrando)
        }}
      />
    </div>
  )
}

// La base guarda NUMERIC(20,10), asi que vuelve con ceros de relleno
// ("1735.1000000000"). Se muestran solo los decimales que aportan.
function formatearRate(rate: string): string {
  const limpio = rate.includes(".") ? rate.replace(/0+$/, "").replace(/\.$/, "") : rate
  return limpio || "0"
}

function FormCotizacion({
  inicial,
  base,
  extranjeras,
  existentes,
  onCerrar,
}: {
  inicial: Cotizacion | null
  base: string
  extranjeras: string[]
  existentes: Cotizacion[]
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const [moneda, setMoneda] = useState(inicial?.base_currency ?? extranjeras[0] ?? "")
  const [valor, setValor] = useState(inicial ? formatearRate(inicial.rate) : "")
  const [fecha, setFecha] = useState(inicial?.rate_date ?? fechaISO(new Date()))
  const [fuente, setFuente] = useState(inicial?.source ?? "oficial")
  const [error, setError] = useState("")

  async function guardar() {
    setError("")
    // La cotizacion no es un monto en centavos: es un decimal con hasta 10
    // lugares. Se valida como texto y viaja como texto.
    const limpio = valor.trim().replace(",", ".")
    if (!/^\d+(\.\d{1,10})?$/.test(limpio) || Number(limpio) <= 0) {
      return setError("Poné un valor mayor a cero (hasta 10 decimales)")
    }
    if (!moneda) return setError("Elegí la moneda")

    // El duplicado se valida ACA: la escritura es local y el 422 del servidor
    // llegaria cuando el conector ya descarto la subida en silencio.
    const choca = existentes.some(
      (c) =>
        c.id !== inicial?.id &&
        c.base_currency === moneda &&
        c.quote_currency === base &&
        c.rate_date === fecha &&
        c.source === fuente,
    )
    if (choca) return setError("Ya hay una cotización de esa moneda, fecha y fuente")

    try {
      if (inicial) {
        // Solo el valor y la fuente se corrigen: cambiar el par o la fecha es
        // otra cotizacion (ver 0005).
        await db.execute("UPDATE exchange_rates SET rate = ?, source = ? WHERE id = ?", [
          limpio,
          fuente,
          inicial.id,
        ])
      } else {
        await db.execute(
          `INSERT INTO exchange_rates
             (id, base_currency, quote_currency, rate, rate_date, source)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), moneda, base, limpio, fecha, fuente],
        )
      }
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Cuánto vale">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">1</span>
          <Select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value)}
            disabled={inicial !== null}
            className="w-28 shrink-0"
          >
            {extranjeras.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <span className="shrink-0 text-sm text-muted-foreground">=</span>
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="1735,10"
            inputMode="decimal"
            className="tabular"
          />
          <span className="shrink-0 text-sm text-muted-foreground">{base}</span>
        </div>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha">
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={inicial !== null}
          />
        </Campo>
        <Campo etiqueta="Fuente">
          <Select value={fuente} onChange={(e) => setFuente(e.target.value)}>
            {FUENTES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
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
