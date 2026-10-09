import { useQuery } from "@powersync/react"
import { ArrowLeft, CalendarClock, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { Monto } from "@/componentes/Monto"
import { Vacio } from "@/componentes/Vacio"
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
  SQL_CICLOS,
  SQL_RECORDATORIOS,
  type Vencimiento,
  armarCalendario,
  etiquetaVence,
  vencimientoDe,
} from "@/lib/recordatorios"
import { describir, siguiente } from "@/lib/repeticion"

// Calendario de pagos (1.5.0, ver 0030): lo que vence, lo vencido sin responder
// y los recordatorios para editarlos.

type Vista = "proximos" | "todos"

const DIAS = 30

export function CalendarioPagos() {
  const volver = useVolver("/accesos")
  const { data: recordatorios, isLoading } = useQuery<RecordatorioLocal>(SQL_RECORDATORIOS)
  const { data: ciclos } = useQuery<CicloLocal>(SQL_CICLOS)
  const mostrarEsqueleto = useDemora(isLoading)
  const hoy = fechaISO(new Date())
  const cal = useMemo(
    () => armarCalendario(recordatorios, ciclos, hoy, DIAS),
    [recordatorios, ciclos, hoy],
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
      onAbrir={setAbierto}
    />
  )

  const nada =
    cal.vencidos.length + cal.hoy.length + cal.proximos.length + cal.masAdelante.length === 0

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">Calendario de pagos</h1>
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
      ) : recordatorios.length === 0 ? (
        <Vacio
          icono={CalendarClock}
          titulo="Sin recordatorios"
          detalle="Anotá lo que tenés que pagar (alquiler, tarjeta, expensas) y Mango te avisa cuando vence."
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
              {seccion(
                "Hoy",
                cal.hoy.map((v) => fila(v)),
              )}
              {seccion(
                `Próximos ${DIAS} días`,
                cal.proximos.map((v) => fila(v)),
              )}
              {seccion(
                "Más adelante",
                cal.masAdelante.map((v) => fila(v)),
              )}
              {nada && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No vence nada: los recordatorios ya terminaron.
                </p>
              )}
            </div>
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
