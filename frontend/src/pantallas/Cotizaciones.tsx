import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, Coins, Pencil, RefreshCw, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Segmentado } from "@/componentes/ui/segmentado"
import { Select } from "@/componentes/ui/select"
import { useColoresTokens } from "@/hooks/useColoresTokens"
import { useCotizaciones } from "@/hooks/useCotizaciones"
import { useMonedaBase } from "@/hooks/monedaBase"
import { useVolver } from "@/hooks/useVolver"
import { api } from "@/lib/api"
import { cotizacionLegible } from "@/lib/conversion"
import {
  CASAS,
  CASA_POR_DEFECTO,
  type Casa,
  type CotizacionUsada,
  type Indice,
  type PreferenciasFx,
  cotizar,
  cotizarConDolar,
  nombreCasa,
  serieDiaria,
} from "@/lib/cotizaciones"
import { fechaISO, formatearFechaCorta } from "@/lib/fecha"
import { nombreMoneda, ordenarMonedas } from "@/lib/monedas"
import { guardarPreferencias } from "@/lib/preferencias"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

// Cotizaciones (1.7.0, ver 0031). Se traen solas, todas contra el dolar: los
// cuatro dolares argentinos y las demas monedas. Aca se elige con que dolar se
// convierte cada moneda, se ve como vino la serie y se carga a mano un valor
// que gana en su fecha.

interface Manual {
  id: string
  base_currency: string
  quote_currency: string
  rate: string
  rate_date: string
  source: string
}

// "manual" = la moneda va a mano (users.fx_manual); "auto" = automatica sin
// dolar de por medio (no se pasa por el peso).
type Eleccion = Casa | "manual" | "auto"

type Rango = "mes" | "trimestre" | "anio" | "todo"
const RANGOS: { valor: Rango; etiqueta: string }[] = [
  { valor: "mes", etiqueta: "Mes" },
  { valor: "trimestre", etiqueta: "3 meses" },
  { valor: "anio", etiqueta: "Año" },
  { valor: "todo", etiqueta: "Todo" },
]

function inicioDe(rango: Rango, hoy: Date): string {
  const d = new Date(hoy)
  if (rango === "mes") d.setMonth(d.getMonth() - 1)
  else if (rango === "trimestre") d.setMonth(d.getMonth() - 3)
  else if (rango === "anio") d.setFullYear(d.getFullYear() - 1)
  else return "0000-01-01"
  return fechaISO(d)
}

// La frase de una cotizacion (DESIGN: no es un monto): en la direccion del
// numero grande, "1 USD = 1.542,9 ARS" y no "1 ARS = 0,000648 USD".
function frase(moneda: string, base: string, rate: number): string {
  return rate >= 1
    ? `1 ${moneda} = ${cotizacionLegible(rate)} ${base}`
    : `1 ${base} = ${cotizacionLegible(1 / rate)} ${moneda}`
}

// "Dólar estadounidense": el nombre de Intl viene en minuscula.
function nombreLindo(moneda: string): string {
  const n = nombreMoneda(moneda)
  return n.charAt(0).toUpperCase() + n.slice(1)
}

function origenDe(c: CotizacionUsada): string {
  if (c.manual) return "cargada a mano"
  return c.casa ? `dólar ${nombreCasa(c.casa)}` : "automática"
}

// La base guarda NUMERIC(20,10), asi que vuelve con ceros de relleno
// ("1735.1000000000"). Se muestran solo los decimales que aportan.
function formatearRate(rate: string): string {
  const limpio = rate.includes(".") ? rate.replace(/0+$/, "").replace(/\.$/, "") : rate
  return limpio || "0"
}

export function Cotizaciones() {
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver("/ajustes")
  const db = usePowerSync()
  const base = useMonedaBase()
  const { indice, prefs } = useCotizaciones()

  // Monedas de las cuentas: son las que hay que cotizar. La base no se cotiza
  // contra si misma.
  const { data: monedaRows } = useQuery<{ currency: string }>(
    "SELECT DISTINCT currency FROM accounts WHERE deleted_at IS NULL",
  )
  // El dolar primero: es el pivote de todo y el que mas se mira; el resto, en
  // orden alfabetico.
  const extranjeras = useMemo(
    () =>
      ordenarMonedas(
        monedaRows.map((r) => r.currency),
        base,
      )
        .filter((m) => m !== base)
        .sort((a, b) => Number(b === "USD") - Number(a === "USD")),
    [monedaRows, base],
  )

  const { data: manuales } = useQuery<Manual>(
    `SELECT id, base_currency, quote_currency, rate, rate_date, source
     FROM exchange_rates WHERE deleted_at IS NULL AND source <> 'auto'
     ORDER BY rate_date DESC, created_at DESC`,
  )

  const [editando, setEditando] = useState<Manual | "nueva" | null>(null)
  const [borrando, setBorrando] = useState<Manual | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function elegir(moneda: string, eleccion: Eleccion) {
    setAviso(null)
    const clave = moneda === "ARS" ? base : moneda
    const sinEsta = prefs.manuales.filter((m) => m !== moneda)
    try {
      // Escritura local: funciona sin conexion y sube despues.
      if (eleccion === "manual") {
        await guardarPreferencias({ fx_manual: [...sinEsta, moneda] })
      } else if (eleccion === "auto") {
        await guardarPreferencias({ fx_manual: sinEsta })
      } else {
        await guardarPreferencias({
          fx_manual: sinEsta,
          fx_dolar: { ...prefs.dolar, [clave]: eleccion },
        })
      }
    } catch {
      setAviso("No se pudo guardar la preferencia.")
    }
  }

  async function refrescarAhora() {
    setRefrescando(true)
    setAviso(null)
    try {
      const r = await api.refrescarCotizaciones(true)
      const partes: string[] = []
      if (r.actualizadas.length) partes.push(`actualizadas: ${r.actualizadas.join(", ")}`)
      if (r.sin_cambios.length) partes.push(`ya al día: ${r.sin_cambios.join(", ")}`)
      if (r.manuales.length) partes.push(`a mano: ${r.manuales.join(", ")}`)
      if (r.fallidas.length) partes.push(`sin respuesta: ${r.fallidas.join(", ")}`)
      setAviso(partes.length ? partes.join(" · ") : "No hay monedas que cotizar.")
    } catch {
      setAviso("No se pudo consultar la fuente: hace falta conexión.")
    } finally {
      setRefrescando(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">Cotizaciones</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        La cotización se usa para <strong>ver</strong>: convierte el patrimonio y los informes a una
        sola moneda. Nunca cambia un movimiento ya cargado, que conserva la que se le aplicó.
      </p>

      {extranjeras.length === 0 ? (
        <Vacio
          icono={Coins}
          titulo="No hace falta ninguna cotización"
          detalle={`Todas tus cuentas están en ${base}. Cuando tengas una cuenta en otra moneda, acá ves cuánto vale.`}
        />
      ) : (
        <>
          {extranjeras.map((m) => (
            <TarjetaMoneda
              key={m}
              moneda={m}
              base={base}
              indice={indice}
              prefs={prefs}
              onElegir={(e) => void elegir(m, e)}
            />
          ))}

          <Evolucion extranjeras={extranjeras} base={base} indice={indice} prefs={prefs} />

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Cargadas a mano</h2>
              <Button variant="outline" size="sm" onClick={() => setEditando("nueva")}>
                Cargar una
              </Button>
            </div>
            {manuales.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Ninguna. Si pagaste otro valor, cargalo: gana sobre la automática en su fecha.
              </p>
            ) : (
              <ListaInset>
                {manuales.map((c) => (
                  <FilaInset key={c.id}>
                    <div className="min-w-0 flex-1">
                      <p className="tabular truncate text-sm">
                        1 {c.base_currency} = {formatearRate(c.rate)} {c.quote_currency}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatearFechaCorta(c.rate_date)}
                        {/* Las de antes de la 1.7.0 guardan la etiqueta que se eligio. */}
                        {c.source !== "manual" && ` · ${c.source}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar la del ${formatearFechaCorta(c.rate_date)}`}
                        onClick={() => setEditando(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar la del ${formatearFechaCorta(c.rate_date)}`}
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
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Se actualizan solas cada hora, con su historia.
              </p>
              <Button variant="outline" size="sm" onClick={refrescarAhora} disabled={refrescando}>
                <RefreshCw
                  className={cn("mr-2 h-4 w-4", refrescando && "motion-safe:animate-spin")}
                  aria-hidden
                />
                {refrescando ? "Consultando…" : "Actualizar ahora"}
              </Button>
            </div>
            {aviso && (
              <p role="status" className="text-xs text-muted-foreground">
                {aviso}
              </p>
            )}
          </section>
        </>
      )}

      <Hoja
        abierta={editando !== null}
        onOpenChange={(v) => {
          if (!v) setEditando(null)
        }}
        titulo={editando === "nueva" ? "Cargar una cotización" : "Editar cotización"}
      >
        {editando && (
          <FormCotizacion
            inicial={editando === "nueva" ? null : editando}
            base={base}
            extranjeras={extranjeras}
            existentes={manuales}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Hoja>

      <Confirmar
        abierta={borrando !== null}
        onOpenChange={(v) => {
          if (!v) setBorrando(null)
        }}
        titulo="Eliminar cotización"
        detalle={
          borrando
            ? `Se elimina la del ${formatearFechaCorta(borrando.rate_date)}. En esa fecha vuelve a valer la automática. Los movimientos ya cargados no cambian: cada uno guarda la suya.`
            : undefined
        }
        etiqueta="Eliminar"
        destructivo
        onConfirmar={() => {
          if (borrando) void db.execute("DELETE FROM exchange_rates WHERE id = ?", [borrando.id])
        }}
      />
    </div>
  )
}

// Una moneda: lo que vale hoy y con que se convierte.
function TarjetaMoneda({
  moneda,
  base,
  indice,
  prefs,
  onElegir,
}: {
  moneda: string
  base: string
  indice: Indice
  prefs: PreferenciasFx
  onElegir: (e: Eleccion) => void
}) {
  // El dolar solo importa si la conversion pasa por el peso. Lo decide la
  // moneda que no es el peso (0031).
  const conPeso = moneda === "ARS" || base === "ARS"
  const clave = moneda === "ARS" ? base : moneda
  const aMano = prefs.manuales.includes(moneda)
  const eleccion: Eleccion = aMano
    ? "manual"
    : conPeso
      ? (prefs.dolar[clave] ?? CASA_POR_DEFECTO)
      : "auto"
  const vigente = cotizar(moneda, base, indice, prefs)
  // Lo que valdria con cada dolar, para comparar antes de elegir.
  const porDolar =
    conPeso && !aMano
      ? CASAS.flatMap((c) => {
          const cot = cotizarConDolar(moneda, base, indice, c.id)
          // Si ese dolar no tiene dato, la conversion cae al oficial: no se repite.
          return cot && cot.casa === c.id ? [{ ...c, rate: cot.rate }] : []
        })
      : []
  const idSelect = `dolar-${moneda}`

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">
          {moneda} <span className="font-normal text-muted-foreground">{nombreLindo(moneda)}</span>
        </h2>
        {vigente ? (
          <>
            <p className="tabular mt-1 text-lg">{frase(moneda, base, vigente.rate)}</p>
            <p className="text-xs text-muted-foreground">
              {origenDe(vigente)} · {formatearFechaCorta(vigente.fecha)}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {aMano
              ? "Sin cotización: cargá una a mano."
              : "Todavía no hay cotización. Se trae sola en un rato."}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={idSelect} className="text-sm text-muted-foreground">
          {conPeso ? "Dólar para convertir" : "Cotización"}
        </label>
        <Select
          id={idSelect}
          value={eleccion}
          onChange={(e) => onElegir(e.target.value as Eleccion)}
          className="w-36 shrink-0"
        >
          {conPeso ? (
            CASAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))
          ) : (
            <option value="auto">Automática</option>
          )}
          <option value="manual">A mano</option>
        </Select>
      </div>
      {porDolar.length > 1 && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {porDolar.map((x) => (
            <li
              key={x.id}
              className={cn("flex justify-between gap-2", eleccion === x.id && "text-foreground")}
            >
              <span>{x.nombre}</span>
              <span className="tabular">
                {cotizacionLegible(x.rate >= 1 ? x.rate : 1 / x.rate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Como vino la serie: area con degradado, sin ejes pesados (DESIGN, graficos).
// Es la de la conversion que se usa, con el dolar elegido.
function Evolucion({
  extranjeras,
  base,
  indice,
  prefs,
}: {
  extranjeras: string[]
  base: string
  indice: Indice
  prefs: PreferenciasFx
}) {
  const colores = useColoresTokens()
  const [moneda, setMoneda] = useState(extranjeras[0])
  const [rango, setRango] = useState<Rango>("trimestre")
  const actual = extranjeras.includes(moneda) ? moneda : extranjeras[0]

  const { puntos, unidad } = useMemo(() => {
    const hoy = new Date()
    const serie = serieDiaria(actual, base, indice, prefs, inicioDe(rango, hoy), fechaISO(hoy))
    // En la direccion del numero grande, como la frase.
    const alreves = serie.length > 0 && serie[serie.length - 1].rate < 1
    return {
      puntos: serie.map((p) => ({ fecha: p.fecha, valor: alreves ? 1 / p.rate : p.rate })),
      unidad: alreves ? `${actual} por ${base}` : `${base} por ${actual}`,
    }
  }, [actual, base, indice, prefs, rango])

  const resumen = useMemo(() => {
    if (puntos.length < 2) return null
    const primero = puntos[0]
    const ultimo = puntos[puntos.length - 1]
    const valores = puntos.map((p) => p.valor)
    const cambio = ((ultimo.valor - primero.valor) / primero.valor) * 100
    const signo = cambio > 0 ? "+" : ""
    return {
      texto:
        `Del ${formatearFechaCorta(primero.fecha)} al ${formatearFechaCorta(ultimo.fecha)}: ` +
        `de ${cotizacionLegible(primero.valor)} a ${cotizacionLegible(ultimo.valor)} ` +
        `(${signo}${cambio.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %).`,
      extremos: `Mínimo ${cotizacionLegible(Math.min(...valores))} · Máximo ${cotizacionLegible(Math.max(...valores))}`,
    }
  }, [puntos])

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Evolución</h2>
      {extranjeras.length > 1 && (
        <Segmentado
          opciones={extranjeras.map((m) => ({ valor: m, etiqueta: m }))}
          valor={actual}
          onCambio={setMoneda}
          etiqueta="Moneda del gráfico"
        />
      )}
      <Segmentado
        opciones={RANGOS}
        valor={rango}
        onCambio={setRango}
        etiqueta="Período del gráfico"
      />
      {puntos.length < 2 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Todavía no hay serie para mostrar en este período.
        </p>
      ) : (
        <>
          {/* El grafico es una imagen para el lector de pantalla: lo que dice va
              escrito abajo. */}
          <div className="h-48" role="img" aria-label={`${unidad}. ${resumen?.texto ?? ""}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={puntos} margin={{ top: 8, right: 20, bottom: 0, left: 20 }}>
                <defs>
                  <linearGradient id="gradCotizacion" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colores.primary} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={colores.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="fecha"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                  tickFormatter={(f: string) => formatearFechaCorta(f).slice(0, 5)}
                  tick={{ fontSize: 12, fill: colores["muted-foreground"] }}
                />
                {/* Sin eje visible, pero el dominio va de lo minimo a lo maximo: con
                    el cero abajo, un 4 % de suba seria una linea plana. */}
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  labelFormatter={(f) => formatearFechaCorta(String(f))}
                  formatter={(v) => [cotizacionLegible(Number(v)), unidad]}
                />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="valor"
                  name={unidad}
                  stroke={colores.primary}
                  strokeWidth={2}
                  fill="url(#gradCotizacion)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {resumen && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{resumen.texto}</p>
              <p className="tabular">{resumen.extremos}</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function FormCotizacion({
  inicial,
  base,
  extranjeras,
  existentes,
  onCerrar,
}: {
  inicial: Manual | null
  base: string
  extranjeras: string[]
  existentes: Manual[]
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const [moneda, setMoneda] = useState(inicial?.base_currency ?? extranjeras[0] ?? "")
  const [valor, setValor] = useState(inicial ? formatearRate(inicial.rate) : "")
  const [fecha, setFecha] = useState(inicial?.rate_date ?? fechaISO(new Date()))
  const [error, setError] = useState("")
  const cotiza = inicial?.quote_currency ?? base

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
    // llegaria cuando el conector ya la subio.
    const choca = existentes.some(
      (c) =>
        c.id !== inicial?.id &&
        c.base_currency === moneda &&
        c.quote_currency === cotiza &&
        c.rate_date === fecha &&
        c.source === "manual",
    )
    if (choca) return setError("Ya cargaste una de esa moneda para esa fecha")

    try {
      if (inicial) {
        // Solo el valor se corrige: cambiar el par o la fecha es otra
        // cotizacion (ver 0005).
        await db.execute("UPDATE exchange_rates SET rate = ? WHERE id = ?", [limpio, inicial.id])
      } else {
        await db.execute(
          `INSERT INTO exchange_rates
             (id, base_currency, quote_currency, rate, rate_date, source)
           VALUES (?, ?, ?, ?, ?, 'manual')`,
          [uuidv4(), moneda, cotiza, limpio, fecha],
        )
      }
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Gana sobre la automática en su fecha: sirve para el valor que pagaste de verdad.
      </p>
      <Campo etiqueta="Cuánto vale">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">1</span>
          <Select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value)}
            disabled={inicial !== null}
            aria-label="Moneda"
            className="w-28 shrink-0"
          >
            {(inicial ? [inicial.base_currency] : extranjeras).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <span className="shrink-0 text-sm text-muted-foreground">=</span>
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="1542,90"
            inputMode="decimal"
            aria-label={`Valor en ${cotiza}`}
            className="tabular"
          />
          <span className="shrink-0 text-sm text-muted-foreground">{cotiza}</span>
        </div>
      </Campo>
      <Campo etiqueta="Fecha">
        <Input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          disabled={inicial !== null}
        />
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
