import { ChevronDown, ChevronRight, ChevronUp, Minus, Plus } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Link, useLocation } from "react-router-dom"

import {
  type Acceso,
  MAX_EN_INICIO,
  SECCIONES,
  agregarAcceso,
  catalogoDe,
  moverAcceso,
  quitarAcceso,
} from "@/componentes/accesos"
import { EncabezadoPantalla } from "@/componentes/EncabezadoPantalla"
import { useAccionesGrupo } from "@/componentes/grupo/useAccionesGrupo"
import { Button } from "@/componentes/ui/button"
import { ListaInset } from "@/componentes/ui/listaInset"
import { useAccesos } from "@/hooks/useAccesos"
import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { useVolver } from "@/hooks/useVolver"
import { type Espacio, PERSONAL, espacioDeRuta, rutaEspacio } from "@/lib/espacios"
import { cn } from "@/lib/utils"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

// "Más" del panel de Inicio (0024): todos los accesos, y la edicion de los
// cuatro que van en Inicio. La misma pantalla en Personal (`/accesos`) y en
// cada grupo (`/grupos/<grupo>/accesos`, 1.13.0): antes la del grupo era una
// hoja distinta y sin editar.
//
// Se ordena con botones de subir/bajar y no arrastrando: arrastrar en una lista
// que scrollea es impreciso con el dedo, y WCAG 2.2 (2.5.7) pide una
// alternativa de un solo toque de todas formas.
export function Accesos() {
  const espacio = espacioDeRuta(useLocation().pathname)
  return espacio.tipo === "grupo" ? <AccesosDeGrupo /> : <PantallaAccesos espacio={PERSONAL} />
}

function AccesosDeGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()
  const acciones = useAccionesGrupo(id)
  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  return (
    <PantallaAccesos
      espacio={{ tipo: "grupo", id }}
      usar={acciones.usar}
      motivo={acciones.motivo}
      hojas={acciones.hojas}
    />
  )
}

function PantallaAccesos({
  espacio,
  usar,
  motivo,
  hojas,
}: {
  espacio: Espacio
  usar?: (a: Acceso) => void
  motivo?: (a: Acceso) => string | null
  hojas?: ReactNode
}) {
  const volver = useVolver(rutaEspacio(espacio))
  const { ids, guardar } = useAccesos(espacio)
  const [editando, setEditando] = useState(false)
  const catalogo = catalogoDe(espacio)

  const elegidos = ids
    .map((id) => catalogo.find((a) => a.id === id))
    .filter((a): a is Acceso => Boolean(a))
  const lleno = ids.length >= MAX_EN_INICIO

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4">
      <EncabezadoPantalla
        titulo="Accesos"
        volver={volver}
        acciones={
          <Button
            variant={editando ? "default" : "secondary"}
            size="sm"
            onClick={() => setEditando((e) => !e)}
          >
            {editando ? "Listo" : "Editar"}
          </Button>
        }
      />

      {editando ? (
        <>
          <section className="space-y-3" aria-labelledby="en-inicio">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="en-inicio" className="text-sm font-semibold text-muted-foreground">
                En Inicio
              </h2>
              <span className="text-xs text-muted-foreground">
                {ids.length} de {MAX_EN_INICIO}
              </span>
            </div>
            {elegidos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Inicio no muestra ningún acceso, solo “Más”. Sumá alguno de abajo.
              </p>
            ) : (
              <ListaInset>
                {elegidos.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2">
                    <IconoAcceso a={a} />
                    <span className="min-w-0 flex-1 break-words text-sm">{a.etiqueta}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Subir ${a.etiqueta}`}
                      disabled={i === 0}
                      onClick={() => guardar(moverAcceso(ids, a.id, -1))}
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Bajar ${a.etiqueta}`}
                      disabled={i === elegidos.length - 1}
                      onClick={() => guardar(moverAcceso(ids, a.id, 1))}
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Sacar ${a.etiqueta} de Inicio`}
                      onClick={() => guardar(quitarAcceso(ids, a.id))}
                    >
                      <Minus className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </ListaInset>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="para-sumar">
            <h2 id="para-sumar" className="text-sm font-semibold text-muted-foreground">
              Para sumar
            </h2>
            {lleno && (
              <p className="text-sm text-muted-foreground">
                Inicio ya tiene {MAX_EN_INICIO}. Sacá uno para sumar otro.
              </p>
            )}
            <ListaInset>
              {catalogo
                .filter((a) => !ids.includes(a.id))
                .map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2">
                    <IconoAcceso a={a} />
                    <span className="min-w-0 flex-1 break-words text-sm">{a.etiqueta}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Sumar ${a.etiqueta} a Inicio`}
                      disabled={lleno}
                      onClick={() => guardar(agregarAcceso(ids, a.id, catalogo))}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ))}
            </ListaInset>
          </section>

          <Button variant="secondary" className="w-full" onClick={() => guardar(null)}>
            Volver a los de fábrica
          </Button>
        </>
      ) : (
        SECCIONES.map((s) => {
          const accesos = catalogo.filter((a) => a.seccion === s.id)
          if (accesos.length === 0) return null
          return (
            <section key={s.id} className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{s.titulo}</h2>
              <ListaInset>
                {accesos.map((a) => (
                  <FilaAcceso key={a.id} a={a} usar={usar} motivo={motivo?.(a) ?? null} />
                ))}
              </ListaInset>
            </section>
          )
        })
      )}
      {hojas}
    </div>
  )
}

const FILA =
  "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"

// Un lugar es un enlace; una accion, un boton. Cada uno dice para que sirve (o
// por que no se puede usar ahora).
function FilaAcceso({
  a,
  usar,
  motivo,
}: {
  a: Acceso
  usar?: (a: Acceso) => void
  motivo: string | null
}) {
  const contenido = (
    <>
      <IconoAcceso a={a} />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-medium", motivo && "text-muted-foreground")}>
          {a.etiqueta}
        </span>
        <span className="block text-xs text-muted-foreground">{motivo ?? a.detalle}</span>
      </span>
      {!motivo && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  )
  if (a.to)
    return (
      <Link to={a.to} className={FILA}>
        {contenido}
      </Link>
    )
  return (
    <button type="button" disabled={motivo !== null} onClick={() => usar?.(a)} className={FILA}>
      {contenido}
    </button>
  )
}

function IconoAcceso({ a }: { a: Acceso }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <a.icono className="h-5 w-5" aria-hidden />
    </span>
  )
}
