import { usePowerSync } from "@powersync/react"
import { Check, SkipForward } from "lucide-react"
import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"

import { Monto } from "@/componentes/Monto"
import { Button } from "@/componentes/ui/button"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { formatearFechaCorta } from "@/lib/fecha"
import { ATAJOS_POSPONER, cuandoPosponer, textoHasta } from "@/lib/posponer"
import {
  type EstadoCiclo,
  type Vencimiento,
  detalleVencimiento,
  posponerCiclo,
  responderCiclo,
} from "@/lib/recordatorios"
import { aDia, describir, diaDeSemana, nombreDia } from "@/lib/repeticion"
import { cn } from "@/lib/utils"

// Un vencimiento del calendario de pagos (1.5.0, 0030): su fila y la hoja con lo
// que se puede hacer.

// Lo que "Cargar el pago" le pasa al alta: al guardar, el ciclo queda pagado con
// ese movimiento (Alta.tsx).
export interface PagoDeCiclo {
  reminderId: string
  nominal: string
  titulo: string
  vence: string
}

// "lunes 12/10/2026": las fechas van siempre como dd/mm/aaaa (2026-10-08).
function diaYFecha(fecha: string): string {
  return `${nombreDia(diaDeSemana(aDia(fecha)))} ${formatearFechaCorta(fecha)}`
}

const ESTADO: Record<Exclude<EstadoCiclo, "pending">, string> = {
  paid: "Pagado",
  skipped: "Omitido",
}

export function FilaVencimiento({
  v,
  hoy,
  cuantos = 1,
  onAbrir,
}: {
  v: Vencimiento
  hoy: string
  // Vencidos sin responder de este recordatorio (se muestra el mas viejo).
  cuantos?: number
  onAbrir: (v: Vencimiento) => void
}) {
  const r = v.recordatorio
  const vencido = v.estado === "pending" && v.vence < hoy
  const detalle = detalleVencimiento(v, hoy, cuantos)
  return (
    // Lo ya respondido se apaga con el color del texto (AA), no con opacidad: la
    // opacidad bajaba el texto secundario de 4,5:1.
    <FilaInset onClick={() => onAbrir(v)}>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            v.estado !== "pending" && "text-muted-foreground",
          )}
        >
          {r.title}
        </span>
        {/* La fecha va completa (dd/mm/aaaa): la linea puede bajar a dos. */}
        <span
          className={cn("block text-xs", vencido ? "text-destructive" : "text-muted-foreground")}
        >
          {detalle}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {r.monto ? <Monto centavos={r.monto} moneda={r.moneda ?? "ARS"} variante="lista" /> : null}
        {v.estado === "paid" && <Check className="h-4 w-4 text-income" aria-label="Pagado" />}
        {v.estado === "skipped" && (
          <SkipForward className="h-4 w-4 text-muted-foreground" aria-label="Omitido" />
        )}
      </span>
    </FilaInset>
  )
}

// Lo que se puede hacer con un vencimiento. `onEditar` abre el recordatorio.
export function AccionesVencimiento({
  v,
  hoy,
  onListo,
  onEditar,
}: {
  v: Vencimiento
  hoy: string
  onListo: () => void
  onEditar: () => void
}) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState("")
  const [posponiendo, setPosponiendo] = useState(false)
  const r = v.recordatorio
  const ahora = new Date()
  const pospuesto = v.pospuesto && new Date(v.pospuesto) > ahora ? new Date(v.pospuesto) : null

  async function posponer(hasta: Date | null) {
    setError("")
    try {
      await posponerCiclo(db, r.id, v.nominal, hasta)
      onListo()
    } catch {
      setError("No se pudo guardar")
    }
  }

  async function responder(estado: EstadoCiclo) {
    setError("")
    try {
      await responderCiclo(db, r.id, v.nominal, estado)
      onListo()
    } catch {
      setError("No se pudo guardar")
    }
  }

  function cargarPago() {
    const pago: PagoDeCiclo = {
      reminderId: r.id,
      nominal: v.nominal,
      titulo: r.title,
      vence: v.vence,
    }
    navigate("/nuevo", {
      state: { plantillaId: r.template_id ?? undefined, ciclo: pago, volverA: location.pathname },
    })
  }

  const cuando =
    v.vence === hoy ? "Vence hoy" : `${v.vence < hoy ? "Venció" : "Vence"} el ${diaYFecha(v.vence)}`

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className={cn("text-sm", v.estado === "pending" && v.vence < hoy && "text-destructive")}>
          {cuando}
        </p>
        {v.vence !== v.nominal && (
          <p className="text-xs text-muted-foreground">
            Era el {diaYFecha(v.nominal)}:{" "}
            {v.vence > v.nominal ? "pasó al lunes" : "se adelantó al viernes"}.
          </p>
        )}
        <p className="text-xs text-muted-foreground">{describir(r)}</p>
        {r.monto ? (
          <p className="pt-1">
            <Monto centavos={r.monto} moneda={r.moneda ?? "ARS"} />
            {r.plantilla && (
              <span className="ml-2 text-xs text-muted-foreground">según «{r.plantilla}»</span>
            )}
          </p>
        ) : null}
      </div>

      {v.estado === "pending" && posponiendo ? (
        <MasTarde ahora={ahora} onElegir={posponer} onVolver={() => setPosponiendo(false)} />
      ) : v.estado === "pending" ? (
        <div className="grid gap-2">
          {pospuesto && (
            <p className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <span>Pospuesto hasta {textoHasta(pospuesto, ahora)}</span>
              <Button variant="ghost" size="sm" onClick={() => posponer(null)}>
                Quitar
              </Button>
            </p>
          )}
          <Button onClick={cargarPago}>Cargar el pago</Button>
          <Button variant="secondary" onClick={() => responder("paid")}>
            Ya lo pagué
          </Button>
          <Button variant="outline" onClick={() => setPosponiendo(true)}>
            Más tarde
          </Button>
          <Button variant="ghost" onClick={() => responder("skipped")}>
            Omitir este vencimiento
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            {v.estado === "paid" ? (
              <Check className="h-4 w-4 text-income" aria-hidden />
            ) : (
              <SkipForward className="h-4 w-4 text-muted-foreground" aria-hidden />
            )}
            {ESTADO[v.estado]}
            {v.transactionId && (
              <Link
                to={`/movimientos/${v.transactionId}`}
                className="ml-1 font-normal text-enlace underline underline-offset-2"
              >
                Ver el pago
              </Link>
            )}
          </p>
          <Button variant="outline" className="w-full" onClick={() => responder("pending")}>
            Deshacer
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button variant="ghost" className="w-full" onClick={onEditar}>
        Editar recordatorio
      </Button>
    </div>
  )
}

// "Más tarde" (0030, R2): atajos con la hora a la que quedaria cada uno, o una
// fecha y hora a eleccion, a cualquier hora.
function MasTarde({
  ahora,
  onElegir,
  onVolver,
}: {
  ahora: Date
  onElegir: (hasta: Date) => void
  onVolver: () => void
}) {
  const [otra, setOtra] = useState("")
  const elegida = otra ? new Date(otra) : null
  return (
    <div className="space-y-3">
      <ListaInset>
        {ATAJOS_POSPONER.map((a) => {
          const hasta = cuandoPosponer(a.valor, ahora)
          return (
            <FilaInset key={a.valor} onClick={() => onElegir(hasta)}>
              <span className="text-sm">{a.etiqueta}</span>
              <span className="text-xs text-muted-foreground">{textoHasta(hasta, ahora)}</span>
            </FilaInset>
          )
        })}
      </ListaInset>
      <label className="block space-y-2">
        <span className="text-sm text-muted-foreground">O elegí fecha y hora</span>
        <Input
          type="datetime-local"
          value={otra}
          min={aLocal(ahora)}
          onChange={(e) => setOtra(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!elegida || elegida <= ahora}
          onClick={() => elegida && onElegir(elegida)}
        >
          Posponer
        </Button>
        <Button variant="outline" onClick={onVolver}>
          Volver
        </Button>
      </div>
    </div>
  )
}

// "AAAA-MM-DDTHH:MM" en la hora local, como lo pide un datetime-local.
function aLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
