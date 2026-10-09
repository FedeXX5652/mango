import { useQuery } from "@powersync/react"
import { ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { AccionesVencimiento, FilaVencimiento } from "@/componentes/recordatorios/Vencimiento"
import { ENLACE_SECCION } from "@/componentes/ui/enlaceSeccion"
import { Hoja } from "@/componentes/ui/hoja"
import { ListaInset } from "@/componentes/ui/listaInset"
import { fechaISO } from "@/lib/fecha"
import {
  type CicloLocal,
  type RecordatorioLocal,
  SQL_CICLOS,
  SQL_RECORDATORIOS,
  type Vencimiento,
  armarCalendario,
} from "@/lib/recordatorios"

// "Próximos pagos" del Inicio (1.5.0, 0030): lo vencido sin marcar y lo que vence
// en la semana, para marcarlo sin salir del Inicio. Si no hay nada, no se dibuja.

const DIAS = 7
const MAX_FILAS = 3

export function TarjetaProximosPagos() {
  const navigate = useNavigate()
  const { data: recordatorios } = useQuery<RecordatorioLocal>(SQL_RECORDATORIOS)
  const { data: ciclos } = useQuery<CicloLocal>(SQL_CICLOS)
  const hoy = fechaISO(new Date())
  const cal = useMemo(
    () => armarCalendario(recordatorios, ciclos, hoy, DIAS),
    [recordatorios, ciclos, hoy],
  )
  const [abierto, setAbierto] = useState<Vencimiento | null>(null)

  const porVenir = [...cal.hoy, ...cal.proximos].filter((v) => v.estado === "pending")
  const filas = [
    ...cal.vencidos.map((g) => ({ v: g.primero, cuantos: g.cuantos })),
    ...porVenir.map((v) => ({ v, cuantos: 1 })),
  ]
  if (filas.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Próximos pagos</h2>
        <Link to="/calendario" className={ENLACE_SECCION}>
          Ver el calendario
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ListaInset>
        {filas.slice(0, MAX_FILAS).map(({ v, cuantos }) => (
          <FilaVencimiento
            key={`${v.recordatorio.id}:${v.nominal}`}
            v={v}
            hoy={hoy}
            cuantos={cuantos}
            onAbrir={setAbierto}
          />
        ))}
      </ListaInset>
      {filas.length > MAX_FILAS && (
        <p className="text-xs text-muted-foreground">Y {filas.length - MAX_FILAS} más.</p>
      )}
      <Hoja
        abierta={abierto !== null}
        onOpenChange={(v) => !v && setAbierto(null)}
        titulo={abierto?.recordatorio.title}
      >
        {abierto && (
          <AccionesVencimiento
            v={abierto}
            hoy={hoy}
            onListo={() => setAbierto(null)}
            onEditar={() => navigate("/calendario")}
          />
        )}
      </Hoja>
    </section>
  )
}
