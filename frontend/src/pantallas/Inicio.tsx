import { useQuery } from "@powersync/react"
import { ChevronRight, Settings, Wallet } from "lucide-react"
import { useMemo } from "react"
import { Link } from "react-router-dom"

import { CobrosPorConfirmar } from "@/componentes/CobrosPorConfirmar"
import { TarjetaProximosPagos } from "@/componentes/recordatorios/TarjetaProximosPagos"
import { EtiquetaGrupo } from "@/componentes/EtiquetaGrupo"
import { Notificaciones } from "@/componentes/Notificaciones"
import { PanelAccesos } from "@/componentes/PanelAccesos"
import { Monto } from "@/componentes/Monto"
import { Cargando, Esqueleto, useDemora } from "@/componentes/ui/cargando"
import { ENLACE_SECCION } from "@/componentes/ui/enlaceSeccion"
import { TarjetaResumen } from "@/componentes/TarjetaResumen"
import { TarjetaGrupos } from "@/componentes/grupo/TarjetaGrupos"
import { Vacio } from "@/componentes/Vacio"
import { SelectorEspacio } from "@/componentes/SelectorEspacio"
import { useMonedaBase } from "@/hooks/monedaBase"
import { iconoCuenta } from "@/lib/cuentas"
import { type Direccion } from "@/lib/dinero"
import { formatearFechaCorta } from "@/lib/fecha"
import type { SaldoMoneda } from "@/lib/patrimonio"
import { saldoCuenta } from "@/lib/saldos"
import { cn } from "@/lib/utils"

interface SaldoCuenta {
  id: string
  name: string
  type: string
  currency: string
  off_budget: number
  archived: number
  balance: number
}
interface MovReciente {
  id: string
  kind: "expense" | "income" | "transfer"
  amount: number
  currency: string
  occurred_at: string
  payee: string | null
  categoria: string | null
  grupo_nombre: string | null
  grupo_color: string | null
}

const DIR: Record<MovReciente["kind"], Direccion> = {
  expense: "gasto",
  income: "ingreso",
  transfer: "neutro",
}

// Topes del resumen: el detalle completo esta a un toque ("Ver todos/todas").
const MAX_RECIENTES = 5
const MAX_CUENTAS = 4

// La formula del saldo vive en lib/saldos (una sola para toda la app).
// `transactions` es solo lo mio: mis cuentas no cambian por lo que pagan los
// demas miembros (0014).
const SQL_SALDOS = `
  SELECT a.id, a.name, a.type, a.currency, a.off_budget, a.archived,
    ${saldoCuenta()} AS balance
  FROM accounts a
  WHERE a.deleted_at IS NULL AND a.owner_id IS NOT NULL
  ORDER BY a.archived, a.sort_order, a.created_at
`

const SQL_RECIENTES = `
  SELECT t.id, t.kind, t.amount, t.currency, t.occurred_at, t.payee, c.name AS categoria,
         g.name AS grupo_nombre, g.color AS grupo_color
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN groups g ON g.id = t.group_id
  WHERE t.deleted_at IS NULL AND t.status = 'confirmed'
  ORDER BY t.occurred_at DESC
  LIMIT ${MAX_RECIENTES}
`

export function Inicio() {
  const { data: cuentas, isLoading: cargaCuentas } = useQuery<SaldoCuenta>(SQL_SALDOS)
  const { data: recientes } = useQuery<MovReciente>(SQL_RECIENTES)

  const base = useMonedaBase()

  // Saldo por moneda de las cuentas que cuentan en el patrimonio. La tarjeta
  // decide si lo muestra unificado o separado.
  const patrimonio = useMemo<SaldoMoneda[]>(() => {
    const porMoneda = new Map<string, number>()
    for (const c of cuentas) {
      if (c.off_budget || c.archived) continue
      porMoneda.set(c.currency, (porMoneda.get(c.currency) ?? 0) + c.balance)
    }
    return [...porMoneda.entries()].sort().map(([moneda, saldo]) => ({ moneda, saldo }))
  }, [cuentas])

  const activas = cuentas.filter((c) => !c.archived)

  // Sin este corte, Inicio dibuja "Sin cuentas todavia" y "$ 0,00" antes de
  // que vuelvan las consultas, y despues todo salta (ver 0008).
  const cargando = cargaCuentas
  // El umbral solo decide si el esqueleto se VE; el corte es `cargando`.
  const mostrarEsqueleto = useDemora(cargando)

  if (cargando) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-4">
        <Cargando visible={mostrarEsqueleto} className="space-y-6" etiqueta="Cargando inicio">
          <Esqueleto className="h-32 w-full rounded-xl" />
          <Esqueleto className="h-28 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            <Esqueleto className="h-24 rounded-xl" />
            <Esqueleto className="h-24 rounded-xl" />
            <Esqueleto className="h-24 rounded-xl" />
            <Esqueleto className="h-24 rounded-xl" />
          </div>
        </Cargando>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      {/* Toda pantalla tiene su h1; aca el header muestra la marca, asi que el
          titulo es solo para lectores de pantalla. */}
      <h1 className="sr-only">Inicio</h1>
      {/* Header movil: Ajustes vive aca (en escritorio esta en la barra lateral). */}
      <header className="flex items-center justify-between lg:hidden">
        {/* El espacio en el que se esta (0026), con el logo de la marca al lado. */}
        <div className="flex min-w-0 items-center gap-2">
          <img src="/icons/svg/mango.svg" alt="" className="h-7 w-7 shrink-0" />
          <SelectorEspacio />
        </div>
        <div className="flex items-center gap-1">
          <Notificaciones />
          <Link
            to="/ajustes"
            aria-label="Ajustes"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </header>

      <CobrosPorConfirmar />

      {/* Lo vencido y lo que vence en la semana (0030). No depende de tener
          cuentas: va afuera del bloque que las necesita. */}
      <TarjetaProximosPagos />

      {activas.length === 0 ? (
        <Vacio
          icono={Wallet}
          titulo="Sin cuentas todavía"
          detalle="Creá tu primera cuenta para ver tu patrimonio y empezar a cargar movimientos."
          accion={{ to: "/cuentas", etiqueta: "Crear cuenta" }}
        />
      ) : (
        <>
          <TarjetaResumen saldos={patrimonio} base={base} />

          {/* Accesos (0024): lo que no esta en la barra, a un toque. Solo en el
              movil: en escritorio la barra lateral ya tiene todo. */}
          <PanelAccesos className="lg:hidden" />

          {/* Cuentas: bloque 2x2 con las primeras segun el orden de Ajustes. */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Cuentas</h2>
              {activas.length > MAX_CUENTAS && (
                <Link to="/cuentas" className={ENLACE_SECCION}>
                  Ver todas ({activas.length})
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {activas.slice(0, MAX_CUENTAS).map((c) => {
                const Icono = iconoCuenta(c.type)
                // A sus movimientos (BACKLOG, auditoria): "¿que paso en esta
                // cuenta?" es la pregunta de quien toca una cuenta.
                return (
                  <Link
                    key={c.id}
                    to={`/movimientos?cuenta=${c.id}`}
                    className="rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icono className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="truncate text-sm text-muted-foreground">{c.name}</span>
                    </div>
                    {/* Saldo completo, sin abreviar (ver 0006). En movil el
                        monto largo baja un punto de tamano antes que perder
                        digitos. */}
                    <Monto
                      centavos={c.balance}
                      moneda={c.currency}
                      className={cn(
                        "block text-base font-semibold sm:text-lg",
                        c.balance < 0 && "text-expense",
                      )}
                    />
                  </Link>
                )
              })}
            </div>
          </section>

          {/* Cada grupo con como quede yo (0026). */}
          <TarjetaGrupos />

          {/* Ultimos movimientos */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Últimos movimientos</h2>
              {recientes.length > 0 && (
                <Link to="/movimientos" className={ENLACE_SECCION}>
                  Ver todos
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </div>
            {recientes.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                Todavía no hay movimientos.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {recientes.map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`/movimientos/${m.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {m.payee ||
                            m.categoria ||
                            (m.kind === "transfer" ? "Transferencia" : "—")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatearFechaCorta(m.occurred_at)}
                        </p>
                        {m.grupo_nombre && (
                          <EtiquetaGrupo
                            nombre={m.grupo_nombre}
                            color={m.grupo_color}
                            className="mt-1"
                          />
                        )}
                      </div>
                      <span
                        className={cn(
                          "tabular shrink-0 text-sm font-medium",
                          m.kind === "expense"
                            ? "text-expense"
                            : m.kind === "income"
                              ? "text-income"
                              : "text-foreground",
                        )}
                      >
                        <Monto
                          centavos={m.amount}
                          moneda={m.currency}
                          direccion={DIR[m.kind]}
                          variante="lista"
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
