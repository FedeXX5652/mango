import { useQuery } from "@powersync/react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Monto } from "@/componentes/Monto"
import { Segmentado } from "@/componentes/ui/segmentado"
import { formatearFechaCorta } from "@/lib/fecha"
import { ordenarMonedas } from "@/lib/monedas"
import {
  type CotizacionConocida,
  type SaldoMoneda,
  calcularPatrimonio,
  ultimaPorPar,
} from "@/lib/patrimonio"

// Patrimonio, en dos vistas (decision 0005):
//
// - **Global**: todo en una sola moneda, convertido con la ultima cotizacion
//   conocida. Contesta "cuanto vale lo que tengo", asi que fluctua con la
//   cotizacion y muestra de que fecha es el dato.
// - **Por moneda**: el saldo de cada moneda por separado, sin convertir nada.
//   Es el numero exacto, y el que sirve para saber cuantos dolares tenes.
//
// La eleccion se guarda por dispositivo: es una preferencia de lectura, no un
// dato del usuario que deba sincronizarse.
const LS_VISTA = "mango.patrimonioVista"
const LS_MONEDA = "mango.patrimonioMoneda"

type Vista = "global" | "moneda"

export function TarjetaPatrimonio({
  saldos,
  base,
}: {
  saldos: SaldoMoneda[]
  base: string
}) {
  const [vista, setVista] = useState<Vista>(
    () => (localStorage.getItem(LS_VISTA) as Vista) ?? "global",
  )
  const [monedaElegida, setMonedaElegida] = useState<string | null>(
    () => localStorage.getItem(LS_MONEDA),
  )

  const { data: cotizaRows } = useQuery<CotizacionConocida>(
    `SELECT base_currency, quote_currency, rate, rate_date
     FROM exchange_rates WHERE deleted_at IS NULL
     ORDER BY rate_date DESC, created_at DESC`,
  )
  const cotizaciones = useMemo(() => ultimaPorPar(cotizaRows), [cotizaRows])

  // Se puede pedir el total en cualquier moneda que el usuario tenga.
  const monedas = useMemo(
    () => ordenarMonedas(saldos.map((s) => s.moneda), base),
    [saldos, base],
  )
  const destino = monedaElegida && monedas.includes(monedaElegida) ? monedaElegida : base
  const patrimonio = useMemo(
    () => calcularPatrimonio(saldos, destino, cotizaciones),
    [saldos, destino, cotizaciones],
  )

  function cambiarVista(v: Vista) {
    setVista(v)
    localStorage.setItem(LS_VISTA, v)
  }
  function cambiarMoneda(m: string) {
    setMonedaElegida(m)
    localStorage.setItem(LS_MONEDA, m)
  }

  // Con una sola moneda no hay nada que unificar ni que elegir.
  const unaSolaMoneda = monedas.length <= 1

  return (
    <section className="rounded-xl bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Patrimonio</h2>
        {!unaSolaMoneda && (
          <Segmentado
            opciones={[
              { valor: "global", etiqueta: "Global" },
              { valor: "moneda", etiqueta: "Por moneda" },
            ]}
            valor={vista}
            onCambio={cambiarVista}
          />
        )}
      </div>

      {saldos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Sin cuentas en el patrimonio.</p>
      ) : unaSolaMoneda || vista === "moneda" ? (
        <div className="mt-1 space-y-1">
          {patrimonio.lineas.map((l) => (
            <Monto
              key={l.moneda}
              centavos={l.saldo}
              moneda={l.moneda}
              className="block text-3xl font-semibold"
            />
          ))}
        </div>
      ) : (
        <div className="mt-1 space-y-2">
          <Monto
            centavos={patrimonio.total}
            moneda={destino}
            className="block text-3xl font-semibold"
          />

          {monedas.length > 1 && (
            <Segmentado
              className="w-fit"
              opciones={monedas.map((m) => ({ valor: m, etiqueta: m }))}
              valor={destino}
              onCambio={cambiarMoneda}
            />
          )}

          {/* La cotizacion cacheada sirve para estimar: por eso se muestra de
              que fecha es el dato, para que se vea si esta vieja (ver 0005). */}
          {patrimonio.fecha && (
            <p className="text-xs text-muted-foreground">
              Convertido con la cotización del {formatearFechaCorta(patrimonio.fecha)}.
            </p>
          )}
          {patrimonio.sinCotizacion.length > 0 && (
            <p className="text-xs text-muted-foreground">
              No incluye {patrimonio.sinCotizacion.join(", ")}: falta la cotización.{" "}
              <Link
                to="/cotizaciones"
                className="text-primary underline-offset-2 hover:underline"
              >
                Cargarla
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </section>
  )
}
