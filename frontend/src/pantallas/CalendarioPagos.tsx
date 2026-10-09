import { useQuery } from "@powersync/react"
import { ArrowLeft, CalendarClock, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { EtiquetaGrupo } from "@/componentes/EtiquetaGrupo"
import { Monto } from "@/componentes/Monto"
import { Vacio } from "@/componentes/Vacio"
import { FilaRecurrente } from "@/componentes/recordatorios/FilaRecurrente"
import { FormularioRecordatorio } from "@/componentes/recordatorios/FormularioRecordatorio"
import { AccionesVencimiento, FilaVencimiento } from "@/componentes/recordatorios/Vencimiento"
import { Button } from "@/componentes/ui/button"
import { Cargando, Esqueleto, useDemora } from "@/componentes/ui/cargando"
import { Hoja } from "@/componentes/ui/hoja"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Segmentado } from "@/componentes/ui/segmentado"
import { useVolver } from "@/hooks/useVolver"
import { fechaISO } from "@/lib/fecha"
import {
  type CicloLocal,
  type RecordatorioLocal,
  type RecurrenteEnCalendario,
  SQL_CICLOS,
  SQL_RECORDATORIOS,
  SQL_RECORDATORIOS_GRUPO,
  SQL_RECURRENTES,
  type Vencimiento,
  armarCalendario,
  etiquetaVence,
  vencimientoDe,
} from "@/lib/recordatorios"
import { type FechaDeRegla, recurrentesQueVienen } from "@/lib/recurrentes"
import { describir, siguiente } from "@/lib/repeticion"

// Calendario de pagos (1.5.0, ver 0030): lo que vence, lo vencido sin responder
// y los recordatorios para editarlos. Desde la 1.6.0 tambien lo que viene de las
// recurrentes, como informacion: se cargan solas.
//
// Con `grupo`, el calendario de un grupo (1.6.0, G1): sus recordatorios, que
// avisan a todos y los responde cualquiera (dice quien). Las recurrentes son
// personales: ahi no van.

type Vista = "proximos" | "todos"

const DIAS = 30

export function CalendarioPagos({
  grupo,
  nombreMiembro,
}: {
  grupo?: { id: string; nombre: string; color: string | null }
  nombreMiembro?: (id: string) => string
} = {}) {
  const volver = useVolver(grupo ? `/grupos/${grupo.id}` : "/accesos")
  const { data: recordatorios, isLoading } = useQuery<RecordatorioLocal>(
    grupo ? SQL_RECORDATORIOS_GRUPO : SQL_RECORDATORIOS,
    grupo ? [grupo.id] : [],
  )
  const { data: ciclos } = useQuery<CicloLocal>(SQL_CICLOS)
  const { data: todasLasRecurrentes } = useQuery<RecurrenteEnCalendario>(SQL_RECURRENTES)
  const mostrarEsqueleto = useDemora(isLoading)
  const hoy = fechaISO(new Date())
  const cal = useMemo(
    () => armarCalendario(recordatorios, ciclos, hoy, DIAS),
    [recordatorios, ciclos, hoy],
  )
  const enGrupo = grupo !== undefined
  const rec = useMemo(
    () => recurrentesQueVienen(enGrupo ? [] : todasLasRecurrentes, hoy, DIAS),
    [enGrupo, todasLasRecurrentes, hoy],
  )
  const [vista, setVista] = useState<Vista>("proximos")
  const [editando, setEditando] = useState<RecordatorioLocal | "nuevo" | null>(null)
  const [abierto, setAbierto] = useState<Vencimiento | null>(null)
  // Tocar un aviso de recordatorio abre su vencimiento: `?r=<id>&n=<fecha>`.
  const [params, setParams] = useSearchParams()
  const pedidoR = params.get("r")
  const pedidoN = params.get("n")
  const desdeAviso = useMemo(() => {
    const r = recordatorios.find((x) => x.id === pedidoR)
    return r && pedidoN ? vencimientoDe(r, ciclos, pedidoN) : null
  }, [recordatorios, ciclos, pedidoR, pedidoN])
  const visible = abierto ?? desdeAviso
  function cerrarVencimiento() {
    setAbierto(null)
    if (pedidoR) setParams({}, { replace: true })
  }

  const seccion = (titulo: string, filas: React.ReactNode[]) =>
    filas.length > 0 && (
      <section>
        <h2 className="mb-1 text-sm font-semibold text-muted-foreground">{titulo}</h2>
        <ListaInset>{filas}</ListaInset>
      </section>
    )
  const fila = (v: Vencimiento, cuantos?: number) => (
    <FilaVencimiento
      key={`${v.recordatorio.id}:${v.nominal}`}
      v={v}
      hoy={hoy}
      cuantos={cuantos}
      nombre={nombreMiembro}
      onAbrir={setAbierto}
    />
  )

  // Recordatorios y recurrentes juntos, por fecha. En el mismo dia van primero
  // los recordatorios, que son los que piden algo.
  const mezclar = (vs: Vencimiento[], rs: FechaDeRegla<RecurrenteEnCalendario>[]) =>
    [
      ...vs.map((v) => ({ fecha: v.vence, nodo: fila(v) })),
      ...rs.map((x) => ({
        fecha: x.fecha,
        nodo: (
          <FilaRecurrente key={`rec:${x.regla.id}:${x.fecha}`} regla={x.regla} fecha={x.fecha} />
        ),
      })),
    ]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((e) => e.nodo)

  const nada =
    cal.vencidos.length +
      cal.hoy.length +
      cal.proximos.length +
      cal.masAdelante.length +
      rec.hoy.length +
      rec.proximos.length +
      rec.masAdelante.length ===
    0

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Calendario de pagos</h1>
          {grupo && <EtiquetaGrupo nombre={grupo.nombre} color={grupo.color} variante="punto" />}
        </div>
      </header>

      <Button className="w-full" onClick={() => setEditando("nuevo")}>
        <Plus className="h-4 w-4" />
        Nuevo recordatorio
      </Button>

      {isLoading ? (
        <Cargando
          visible={mostrarEsqueleto}
          className="space-y-3"
          etiqueta="Cargando el calendario"
        >
          <Esqueleto className="h-11" />
          <Esqueleto className="h-48 w-full rounded-xl" />
        </Cargando>
      ) : recordatorios.length === 0 && (enGrupo || todasLasRecurrentes.length === 0) ? (
        <Vacio
          icono={CalendarClock}
          titulo={grupo ? "Sin recordatorios del grupo" : "Sin recordatorios"}
          detalle={
            grupo
              ? "Anotá lo que paga el grupo (expensas, servicios) y Mango les avisa a todos cuando vence."
              : "Anotá lo que tenés que pagar (alquiler, tarjeta, expensas) y Mango te avisa cuando vence."
          }
        />
      ) : (
        <>
          <Segmentado
            etiqueta="Qué ver"
            opciones={[
              { valor: "proximos", etiqueta: "Próximos" },
              { valor: "todos", etiqueta: "Recordatorios" },
            ]}
            valor={vista}
            onCambio={setVista}
          />
          {vista === "proximos" ? (
            <div className="space-y-4">
              {seccion(
                "Vencidos sin marcar",
                cal.vencidos.map((g) => fila(g.primero, g.cuantos)),
              )}
              {seccion("Hoy", mezclar(cal.hoy, rec.hoy))}
              {seccion(`Próximos ${DIAS} días`, mezclar(cal.proximos, rec.proximos))}
              {seccion("Más adelante", mezclar(cal.masAdelante, rec.masAdelante))}
              {nada && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No vence nada: los recordatorios ya terminaron.
                </p>
              )}
            </div>
          ) : recordatorios.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no anotaste recordatorios. Las recurrentes se administran en Recurrentes.
            </p>
          ) : (
            <ListaInset>
              {recordatorios.map((r) => {
                const prox = siguiente(r, hoy)
                return (
                  <FilaInset key={r.id} onClick={() => setEditando(r)}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {describir(r)}
                        {" · "}
                        {prox
                          ? `próximo: ${etiquetaVence(prox.vence, hoy).toLowerCase()}`
                          : "terminado"}
                      </span>
                    </span>
                    {r.monto ? (
                      <Monto centavos={r.monto} moneda={r.moneda ?? "ARS"} variante="lista" />
                    ) : null}
                  </FilaInset>
                )
              })}
            </ListaInset>
          )}
        </>
      )}

      <Hoja
        abierta={editando !== null}
        onOpenChange={(v) => !v && setEditando(null)}
        titulo={editando === "nuevo" ? "Nuevo recordatorio" : "Editar recordatorio"}
      >
        {editando !== null && (
          <FormularioRecordatorio
            key={editando === "nuevo" ? "nuevo" : editando.id}
            inicial={editando === "nuevo" ? undefined : editando}
            grupo={grupo?.id}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Hoja>

      <Hoja
        abierta={visible !== null}
        onOpenChange={(v) => !v && cerrarVencimiento()}
        titulo={visible?.recordatorio.title}
      >
        {visible && (
          <AccionesVencimiento
            v={visible}
            hoy={hoy}
            nombre={nombreMiembro}
            onListo={cerrarVencimiento}
            onEditar={() => {
              cerrarVencimiento()
              setEditando(visible.recordatorio)
            }}
          />
        )}
      </Hoja>
    </div>
  )
}
