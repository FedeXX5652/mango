import { useQuery } from "@powersync/react"
import { Plus } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { HojaNuevaConjunta } from "@/componentes/CuentaConjunta"
import { DeA } from "@/componentes/DeA"
import { SaldarPago, type Liquidacion } from "@/componentes/SaldarPago"
import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useGrupo } from "@/hooks/useGrupo"
import {
  ACCESOS_GRUPO,
  type HerramientaGrupo,
  herramientasGrupo,
} from "@/componentes/grupo/herramientasGrupo"
import { formatearMonto } from "@/lib/dinero"
import { rutaMoverPlata } from "@/lib/espacios"
import { useBloqueListo } from "@/hooks/bloquesListos"
import { cn } from "@/lib/utils"

// Accesos del Inicio de un grupo (0026): lo que se HACE con el grupo, a un
// toque. Cuatro fijos y "Más" con todo lo demas (1.12.0), en las mismas cinco
// columnas que el panel personal (0024) y con su estilo de baldosa.
const BALDOSA =
  "flex min-h-20 w-full flex-col items-center justify-start gap-2 rounded-xl px-1 py-2 text-center text-xs font-medium leading-tight transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function Icono({ icono: I }: { icono: LucideIcon }) {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <I className="h-5 w-5" aria-hidden />
    </span>
  )
}

export function AccesosGrupo({ groupId }: { groupId: string }) {
  const navigate = useNavigate()
  const { balance, miId, nombre, cargando } = useGrupo(groupId)
  const { data: conjuntas, isLoading: cargaConjuntas } = useQuery<{ id: string }>(
    "SELECT id FROM accounts WHERE group_id = ? AND deleted_at IS NULL AND archived = 0",
    [groupId],
  )
  useBloqueListo(cargando || cargaConjuntas)
  const [verSaldar, setVerSaldar] = useState(false)
  const [pagando, setPagando] = useState<Liquidacion | null>(null)
  const [crearConjunta, setCrearConjunta] = useState(false)
  const [verMas, setVerMas] = useState(false)
  const todas = herramientasGrupo(groupId)

  // Como saldar, con lo que me toca primero.
  const liquidaciones: Liquidacion[] = balance
    .flatMap((r) => r.liquidaciones.map((l) => ({ ...l, currency: r.currency })))
    .sort((x, y) => Number(esMia(y, miId)) - Number(esMia(x, miId)))
  const mias = liquidaciones.filter((l) => esMia(l, miId))

  function saldar() {
    // Una sola deuda que me toca: directo al pago. Si no, la lista.
    if (mias.length === 1) setPagando(mias[0])
    else setVerSaldar(true)
  }

  function ponerPlata() {
    // Sin conjunta no hay donde poner: primero se crea, y se sigue con ella.
    if (conjuntas.length === 0) setCrearConjunta(true)
    else
      navigate(
        rutaMoverPlata(groupId, "poner", conjuntas.length === 1 ? conjuntas[0].id : undefined),
      )
  }

  function sacarPlata() {
    navigate(rutaMoverPlata(groupId, "sacar", conjuntas.length === 1 ? conjuntas[0].id : undefined))
  }

  // Una accion o un lugar, segun la herramienta.
  function usar(h: HerramientaGrupo) {
    setVerMas(false)
    if (h.id === "saldar") saldar()
    else if (h.id === "poner") ponerPlata()
    else if (h.id === "sacar") sacarPlata()
    else if (h.to) navigate(h.to)
  }
  // Sacar plata sin conjunta no tiene de donde: se dice, en vez de un toque que
  // no hace nada.
  const sinConjunta = conjuntas.length === 0

  return (
    <section aria-labelledby="titulo-accesos-grupo" className="space-y-3">
      <h2 id="titulo-accesos-grupo" className="text-sm font-semibold text-muted-foreground">
        Accesos
      </h2>
      <ul className="grid grid-cols-5 gap-1">
        {ACCESOS_GRUPO.map((id) => {
          const h = todas.find((x) => x.id === id)!
          return (
            <li key={id}>
              <button type="button" onClick={() => usar(h)} className={BALDOSA}>
                <Icono icono={h.icono} />
                <span lang="es" className="line-clamp-2 w-full hyphens-auto break-words">
                  {h.etiqueta}
                </span>
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={() => setVerMas(true)}
            aria-label="Más del grupo"
            className={BALDOSA}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border bg-card text-muted-foreground">
              <Plus className="h-5 w-5" aria-hidden />
            </span>
            <span>Más</span>
          </button>
        </li>
      </ul>

      {/* Todo lo del grupo, cada cosa con para que sirve. */}
      <Hoja abierta={verMas} onOpenChange={setVerMas} titulo="Todo lo del grupo">
        <ListaInset>
          {todas.map((h) => {
            const apagada = h.id === "sacar" && sinConjunta
            return (
              <FilaInset
                key={h.id}
                onClick={apagada ? undefined : () => usar(h)}
                chevron={!apagada}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <h.icono className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        apagada && "text-muted-foreground",
                      )}
                    >
                      {h.etiqueta}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {apagada ? "El grupo todavía no tiene cuenta conjunta" : h.detalle}
                    </span>
                  </span>
                </span>
              </FilaInset>
            )
          })}
        </ListaInset>
      </Hoja>

      <Hoja abierta={verSaldar} onOpenChange={setVerSaldar} titulo="Saldar">
        {liquidaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Están al día: nadie le debe nada a nadie en el grupo.
          </p>
        ) : (
          <ListaInset>
            {liquidaciones.map((l, i) => (
              <FilaInset key={i}>
                <span className="min-w-0 text-sm">
                  <DeA
                    de={nombre(l.de)}
                    a={nombre(l.a)}
                    flecha="le debe a"
                    className="font-medium"
                  />
                  <span className="tabular block text-xs text-muted-foreground">
                    {formatearMonto(l.monto, { moneda: l.currency })}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setVerSaldar(false)
                    setPagando(l)
                  }}
                >
                  Saldar
                </Button>
              </FilaInset>
            ))}
          </ListaInset>
        )}
      </Hoja>

      <SaldarPago
        groupId={groupId}
        liquidacion={pagando}
        miId={miId}
        nombre={nombre}
        onClose={() => setPagando(null)}
      />

      <HojaNuevaConjunta
        groupId={groupId}
        abierta={crearConjunta}
        onOpenChange={setCrearConjunta}
        detalle="Para poner plata, el grupo necesita una cuenta conjunta: la plata que hay ahí es de todos."
        onCreada={(id) => navigate(rutaMoverPlata(groupId, "poner", id))}
      />
    </section>
  )
}

function esMia(l: Liquidacion, miId: string): boolean {
  return l.de === miId || l.a === miId
}
