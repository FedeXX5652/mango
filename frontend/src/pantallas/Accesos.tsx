import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Minus, Plus } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import {
  ACCESOS,
  type Acceso,
  MAX_EN_INICIO,
  acceso,
  agregarAcceso,
  moverAcceso,
  quitarAcceso,
} from "@/componentes/accesos"
import { Button } from "@/componentes/ui/button"
import { ListaInset } from "@/componentes/ui/listaInset"
import { useAccesos } from "@/hooks/useAccesos"
import { useVolver } from "@/hooks/useVolver"

// "Más" del panel de Inicio (0024): todos los accesos, y la edicion de los
// cuatro que van en Inicio. Se ordena con botones de subir/bajar y no
// arrastrando: arrastrar en una lista que scrollea es impreciso con el dedo, y
// WCAG 2.2 (2.5.7) pide una alternativa de un solo toque de todas formas.
export function Accesos() {
  const volver = useVolver("/")
  const { ids, guardar } = useAccesos()
  const [editando, setEditando] = useState(false)

  const elegidos = ids.map((id) => acceso(id)).filter((a): a is Acceso => Boolean(a))
  const lleno = ids.length >= MAX_EN_INICIO

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">Accesos</h1>
        <Button
          variant={editando ? "default" : "outline"}
          size="sm"
          className="ml-auto"
          onClick={() => setEditando((e) => !e)}
        >
          {editando ? "Listo" : "Editar"}
        </Button>
      </header>

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
              {ACCESOS.filter((a) => !ids.includes(a.id)).map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2">
                  <IconoAcceso a={a} />
                  <span className="min-w-0 flex-1 break-words text-sm">{a.etiqueta}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Sumar ${a.etiqueta} a Inicio`}
                    disabled={lleno}
                    onClick={() => guardar(agregarAcceso(ids, a.id))}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </ListaInset>
          </section>

          <Button variant="outline" className="w-full" onClick={() => guardar(null)}>
            Volver a los de fábrica
          </Button>
        </>
      ) : (
        <>
          <Grupo titulo="Funciones" accesos={ACCESOS.filter((a) => a.grupo === "funciones")} />
          <Grupo
            titulo="Configuración"
            accesos={ACCESOS.filter((a) => a.grupo === "configuracion")}
          />
        </>
      )}
    </div>
  )
}

function Grupo({ titulo, accesos }: { titulo: string; accesos: Acceso[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{titulo}</h2>
      <ListaInset>
        {accesos.map((a) => (
          <Link
            key={a.id}
            to={a.to}
            className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <IconoAcceso a={a} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.etiqueta}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </ListaInset>
    </section>
  )
}

function IconoAcceso({ a }: { a: Acceso }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <a.icono className="h-5 w-5" aria-hidden />
    </span>
  )
}
