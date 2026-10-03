import { useQuery } from "@powersync/react"
import { ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Monto } from "@/componentes/Monto"
import { SelectorMoneda } from "@/componentes/SelectorMoneda"
import { Segmentado } from "@/componentes/ui/segmentado"
import { useRefrescoCotizaciones } from "@/hooks/refrescoCotizaciones"
import { formatearFechaCorta } from "@/lib/fecha"
import { ordenarMonedas } from "@/lib/monedas"
import {
  type CotizacionConocida,
  type SaldoMoneda,
  calcularPatrimonio,
  ultimaPorPar,
} from "@/lib/patrimonio"
import { cn } from "@/lib/utils"

// Resumen de cuenta: el patrimonio y el movimiento del mes en una sola tarjeta,
// separados por una linea (decision 0005). Son la misma pregunta vista en dos
// escalas —cuanto tengo y como viene el mes— y tenerlas en dos bloques sueltos
// obligaba a leer dos veces.
//
// Dos modos, los mismos cuatro campos:
//
// - **Global**: todo llevado a la moneda elegida con **una sola** cotizacion, la
//   ultima conocida: patrimonio y flujos por igual. La tarjeta dice "cuanto
//   tengo y como vino el mes, en esta moneda, HOY", como si cambiaras todo
//   ahora; que el patrimonio usara una y los flujos otra mezclaria dos
//   valuaciones en el mismo bloque (0005 punto 1.2).
//
//   La cotizacion del dia de cada movimiento es de los informes historicos
//   (Estadisticas), donde lo gastado en marzo no puede cambiar porque hoy salto
//   el dolar. No confundir las dos.
// - **Por moneda**: solo lo que ya esta en la moneda elegida, sin convertir
//   nada. Es el numero exacto.
//
// Ambas elecciones se guardan por dispositivo: son preferencias de lectura.
const LS_VISTA = "mango.resumenVista"
const LS_MONEDA = "mango.resumenMoneda"

type Vista = "global" | "moneda"

interface FlujoRow {
  currency: string
  // Un cobro de un pago de grupo es un "reintegro", no un ingreso (0026).
  tipo: "income" | "expense" | "reintegro"
  total: number
}

// Ingresos y egresos del mes en curso, por moneda. Sin agrupar por dia: se
// convierte todo con la ultima cotizacion, la misma que el patrimonio.
//
// Los cobros de un pago de grupo (`settlement_id`) van aparte, como
// "reintegros": es plata propia que vuelve, no un ingreso (0026, etapa 3). Se
// reconocen por el vinculo con el pago y no por la categoria.
const SQL_FLUJOS = `
  SELECT currency,
         CASE WHEN kind = 'income' AND settlement_id IS NOT NULL THEN 'reintegro' ELSE kind END AS tipo,
         SUM(amount) AS total
  FROM transactions
  WHERE kind IN ('income','expense') AND status = 'confirmed' AND deleted_at IS NULL
    AND occurred_at >= ? AND occurred_at < ?
  GROUP BY currency, tipo
`

// A igual fecha, **lo cargado a mano gana** sobre lo automatico: si el usuario
// tipeo una cotizacion es porque la oficial que trae la API no es la que aplica
// (en Argentina, MEP o tarjeta). Ver 0005.
const SQL_COTIZACIONES = `
  SELECT base_currency, quote_currency, rate, rate_date
  FROM exchange_rates WHERE deleted_at IS NULL
  ORDER BY rate_date DESC, (source = 'auto') ASC, created_at DESC
`

export function TarjetaResumen({ saldos, base }: { saldos: SaldoMoneda[]; base: string }) {
  const [vista, setVista] = useState<Vista>(
    () => (localStorage.getItem(LS_VISTA) as Vista) ?? "global",
  )
  const [monedaElegida, setMonedaElegida] = useState<string | null>(() =>
    localStorage.getItem(LS_MONEDA),
  )

  const rangoMes = useMemo(() => {
    const h = new Date()
    return [
      new Date(h.getFullYear(), h.getMonth(), 1).toISOString(),
      new Date(h.getFullYear(), h.getMonth() + 1, 1).toISOString(),
    ]
  }, [])
  const { data: flujoRows } = useQuery<FlujoRow>(SQL_FLUJOS, rangoMes)
  const { data: cotizaRows } = useQuery<CotizacionConocida>(SQL_COTIZACIONES)

  // Una por par, la ultima: la tarjeta entera se lee con esa. La serie completa
  // la usa Estadisticas, que si necesita la de cada fecha.
  const ultimas = useMemo(() => ultimaPorPar(cotizaRows), [cotizaRows])

  // Se puede leer el resumen en cualquier moneda que el usuario tenga, sea de
  // una cuenta o de un movimiento del mes.
  const monedas = useMemo(
    () =>
      ordenarMonedas([...saldos.map((s) => s.moneda), ...flujoRows.map((f) => f.currency)], base),
    [saldos, flujoRows, base],
  )
  const moneda = monedaElegida && monedas.includes(monedaElegida) ? monedaElegida : base

  const patrimonio = useMemo(
    () => calcularPatrimonio(saldos, moneda, ultimas),
    [saldos, moneda, ultimas],
  )

  const flujos = useMemo(() => {
    const porMoneda = (tipo: FlujoRow["tipo"]): SaldoMoneda[] =>
      flujoRows.filter((f) => f.tipo === tipo).map((f) => ({ moneda: f.currency, saldo: f.total }))

    if (vista === "moneda") {
      // Sin convertir: solo lo que ya esta en esa moneda.
      const propio = (tipo: FlujoRow["tipo"]) =>
        flujoRows
          .filter((f) => f.tipo === tipo && f.currency === moneda)
          .reduce((s, f) => s + f.total, 0)
      return {
        ingresos: propio("income"),
        reintegros: propio("reintegro"),
        egresos: propio("expense"),
        sinCotizacion: [] as string[],
      }
    }
    // Misma operacion que el patrimonio: una sola cotizacion, la ultima.
    const ing = calcularPatrimonio(porMoneda("income"), moneda, ultimas)
    const rei = calcularPatrimonio(porMoneda("reintegro"), moneda, ultimas)
    const egr = calcularPatrimonio(porMoneda("expense"), moneda, ultimas)
    return {
      ingresos: ing.total,
      reintegros: rei.total,
      egresos: egr.total,
      sinCotizacion: [
        ...new Set([...ing.sinCotizacion, ...rei.sinCotizacion, ...egr.sinCotizacion]),
      ].sort(),
    }
  }, [flujoRows, ultimas, moneda, vista])

  // El resultado no cambia por separar los reintegros: la plata entro igual.
  const resultado = flujos.ingresos + flujos.reintegros - flujos.egresos

  // El saldo de la moneda elegida, para el modo "Por moneda".
  const saldoPropio = saldos.find((s) => s.moneda.toUpperCase() === moneda)?.saldo ?? 0
  const global = vista === "global"
  const totalArriba = global ? patrimonio.total : saldoPropio

  // Con una sola moneda no hay nada que unificar ni que elegir.
  const unaSola = monedas.length <= 1

  function cambiarVista(v: Vista) {
    setVista(v)
    localStorage.setItem(LS_VISTA, v)
  }
  function cambiarMoneda(m: string) {
    setMonedaElegida(m)
    localStorage.setItem(LS_MONEDA, m)
  }

  // Lo que no se pudo convertir queda afuera y se informa; nunca se estima.
  const faltantes = global
    ? [...new Set([...patrimonio.sinCotizacion, ...flujos.sinCotizacion])].sort()
    : []

  // Y se pide en el momento: una moneda nueva no deberia obligar a recargar la
  // app para que aparezca su cotizacion. Toda moneda es automatica por default.
  useRefrescoCotizaciones(faltantes)

  return (
    <section className="rounded-xl bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Solo "Resumen": los chips ya dicen el modo y el selector la moneda.
            Repetirlo partia la fila en dos en 390 px. */}
        <h2 className="text-sm font-medium text-muted-foreground">Resumen</h2>
        {!unaSola && (
          <Segmentado
            etiqueta="Cómo ver las monedas"
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
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">Patrimonio</p>
          <Monto centavos={totalArriba} moneda={moneda} className="block text-3xl font-semibold" />
          {!unaSola && (
            <SelectorMoneda
              className="mt-2"
              monedas={monedas}
              valor={moneda}
              onCambio={cambiarMoneda}
            />
          )}

          {/* La linea separa las dos escalas del mismo tema: lo que tengo,
              arriba; como viene el mes, abajo. Una tarjeta anidada pesaria mas
              y no diria mas (DESIGN.md 7). */}
          <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
            <Fila
              etiqueta="Ingresos"
              centavos={flujos.ingresos}
              moneda={moneda}
              clase="text-income"
            />
            {/* Solo si hubo: en un mes sin cobros de grupo es ruido. */}
            {flujos.reintegros !== 0 && (
              <Fila
                etiqueta="Reintegros"
                centavos={flujos.reintegros}
                moneda={moneda}
                clase="text-income"
              />
            )}
            <Fila
              etiqueta="Egresos"
              centavos={flujos.egresos}
              moneda={moneda}
              clase="text-expense"
            />
            <Fila
              etiqueta="Resultado"
              centavos={resultado}
              moneda={moneda}
              clase={resultado < 0 ? "text-expense" : "text-income"}
            />
          </dl>

          {/* El pie dice el dato, no lo explica: que la conversion usa la
              ultima cotizacion es una regla del producto, no algo que haya que
              repetir en cada pantalla (ver 0005). */}
          {global && patrimonio.fecha && (
            <p className="mt-3 text-xs text-muted-foreground">
              Cotización del {formatearFechaCorta(patrimonio.fecha)}
            </p>
          )}
          {faltantes.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              No incluye {faltantes.join(", ")}: falta su cotización.{" "}
              <Link
                to="/cotizaciones"
                className="font-medium text-enlace underline underline-offset-2"
              >
                Cargarla
              </Link>
              .
            </p>
          )}
        </>
      )}

      {/* Salida a Estadisticas: en el telefono no esta en la barra (0022), y
          esta tarjeta es la pregunta de la que Estadisticas es el detalle. Es un
          enlace propio y no la tarjeta entera: la tarjeta tiene controles adentro
          (modo y moneda), y un enlace no puede contener botones. */}
      <div className="mt-4 border-t border-border pt-1">
        <Link
          to="/estadisticas"
          className="-mx-2 flex min-h-11 items-center justify-between rounded-md px-2 text-sm font-medium text-enlace hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver estadísticas
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  )
}

function Fila({
  etiqueta,
  centavos,
  moneda,
  clase,
}: {
  etiqueta: string
  centavos: number
  moneda: string
  clase: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd>
        <Monto centavos={centavos} moneda={moneda} variante="lista" className={cn(clase)} />
      </dd>
    </div>
  )
}
