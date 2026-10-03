import { useQuery } from "@powersync/react"
import { ChevronRight, Settings } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { CuentaConjunta } from "@/componentes/CuentaConjunta"
import { Monto } from "@/componentes/Monto"
import { Notificaciones } from "@/componentes/Notificaciones"
import { EncabezadoEspacio } from "@/componentes/SelectorEspacio"
import { AccesosGrupo } from "@/componentes/grupo/AccesosGrupo"
import { BalanceGrupo } from "@/componentes/grupo/BalanceGrupo"
import { FilaHistoria, HojaPago } from "@/componentes/grupo/Historia"
import { ListaInset } from "@/componentes/ui/listaInset"
import { type PagoGrupo, armarHistoria, useGrupo } from "@/hooks/useGrupo"
import { LS_ULTIMO_GRUPO } from "@/lib/atajos"
import { rutaEspacio } from "@/lib/espacios"
import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

const MAX_ULTIMOS = 5
const ENLACE =
  "-my-3 inline-flex items-center gap-1 rounded-md py-3 text-sm font-medium text-enlace hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

// Inicio de un grupo (0026): como quede yo y como saldar, como viene el mes, la
// cuenta conjunta y lo ultimo que paso. Lo que antes era una sola pagina larga
// quedo repartido en las cuatro pantallas del grupo.
export function InicioGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()

  // El ultimo grupo abierto en este dispositivo: a donde va el atajo "Último
  // grupo" del icono (0023). Solo si el grupo existe.
  useEffect(() => {
    if (!grupo) return
    try {
      localStorage.setItem(LS_ULTIMO_GRUPO, grupo.id)
    } catch {
      // Sin storage: el atajo cae al unico grupo o a la lista.
    }
  }, [grupo])

  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  const espacio = { tipo: "grupo" as const, id }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="sr-only">{grupo.name}</h1>
      <EncabezadoEspacio>
        <Notificaciones />
        <Link
          to={rutaEspacio(espacio, "ajustes")}
          aria-label="Ajustes del grupo"
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings className="h-5 w-5" aria-hidden />
        </Link>
      </EncabezadoEspacio>

      <BalanceGrupo groupId={id} />
      <AccesosGrupo groupId={id} />
      <MesGrupo groupId={id} moneda={grupo.base_currency} />
      <CuentaConjunta groupId={id} />
      <UltimosGrupo groupId={id} />
    </div>
  )
}

function inicioDeMes(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`
}

// Como viene el mes: lo gastado en la moneda del grupo y, si hay, contra los
// topes. El detalle esta en Presupuesto y Estadisticas del grupo.
function MesGrupo({ groupId, moneda }: { groupId: string; moneda: string }) {
  const { gastos } = useGrupo(groupId)
  const mes = inicioDeMes()
  const { data: topes } = useQuery<{ total: number | null }>(
    "SELECT SUM(amount) AS total FROM budgets WHERE group_id = ? AND period_start = ? AND currency = ? AND deleted_at IS NULL",
    [groupId, mes, moneda],
  )
  const gastado = useMemo(
    () =>
      gastos
        .filter((g) => g.currency === moneda && g.occurred_at >= mes)
        .reduce((s, g) => s + g.amount, 0),
    [gastos, moneda, mes],
  )
  const tope = topes[0]?.total ?? 0
  const nombreMes = new Date().toLocaleDateString("es-AR", { month: "long" })
  const espacio = { tipo: "grupo" as const, id: groupId }

  return (
    <section className="space-y-3 rounded-xl bg-card p-4">
      <h2 className="text-sm font-medium text-muted-foreground">Gasto del grupo en {nombreMes}</h2>
      <p className="text-2xl font-semibold">
        <Monto centavos={gastado} moneda={moneda} />
        {tope > 0 && (
          <span className="text-base font-normal text-muted-foreground">
            {" "}
            de <Monto centavos={tope} moneda={moneda} />
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-x-6 border-t border-border pt-1">
        <Link to={rutaEspacio(espacio, "presupuesto")} className={ENLACE}>
          Presupuesto
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link to={rutaEspacio(espacio, "estadisticas")} className={ENLACE}>
          Estadísticas
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  )
}

function UltimosGrupo({ groupId }: { groupId: string }) {
  const { gastos, pagos, aportes, miId, miembros, splitsDe, categoria, nombre } = useGrupo(groupId)
  const [pago, setPago] = useState<PagoGrupo | null>(null)
  const items = useMemo(
    () => armarHistoria(gastos, pagos, aportes).slice(0, MAX_ULTIMOS),
    [gastos, pagos, aportes],
  )

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Lo último del grupo</h2>
        {items.length > 0 && (
          <Link to={rutaEspacio({ tipo: "grupo", id: groupId }, "movimientos")} className={ENLACE}>
            Ver todo
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Cuando alguien cargue un gasto compartido con el grupo, aparece acá.
        </p>
      ) : (
        <ListaInset>
          {items.map((it) => (
            <FilaHistoria
              key={`${it.tipo}-${it.id}`}
              item={it}
              groupId={groupId}
              miId={miId}
              miembros={miembros}
              splitsDe={splitsDe}
              categoria={categoria}
              nombre={nombre}
              onPago={setPago}
            />
          ))}
        </ListaInset>
      )}
      <HojaPago pago={pago} nombre={nombre} onClose={() => setPago(null)} />
    </section>
  )
}
