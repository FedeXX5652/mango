import { useQuery } from "@powersync/react"
import { Check, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { SIN_COLOR } from "@/lib/paleta"

interface EtiquetaOpcion {
  id: string
  name: string
  color: string | null
}

// Un movimiento puede tener varias etiquetas o ninguna (ver 3.5.1). Con muchas
// etiquetas, mostrarlas todas inline inunda el formulario: se resume en una
// linea y la eleccion pasa a un dialogo con buscador (sheet en movil, modal en
// escritorio). Si no hay etiquetas creadas no renderiza nada.
export function SelectorEtiquetas({
  seleccionadas,
  onCambio,
}: {
  seleccionadas: string[]
  onCambio: (ids: string[]) => void
}) {
  const { data: etiquetas } = useQuery<EtiquetaOpcion>(
    "SELECT id, name, color FROM tags WHERE deleted_at IS NULL AND archived = 0",
  )
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState("")

  const orden = useMemo(
    () => [...etiquetas].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [etiquetas],
  )

  if (orden.length === 0) return null

  const elegidas = orden.filter((e) => seleccionadas.includes(e.id))
  const q = busqueda.trim().toLowerCase()
  const filtradas = q ? orden.filter((e) => e.name.toLowerCase().includes(q)) : orden

  function alternar(id: string) {
    onCambio(
      seleccionadas.includes(id) ? seleccionadas.filter((x) => x !== id) : [...seleccionadas, id],
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
      >
        {elegidas.length === 0 ? (
          <span className="text-muted-foreground">Ninguna</span>
        ) : (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {elegidas.map((e) => (
              <span
                key={e.id}
                className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: e.color ?? SIN_COLOR }}
                  aria-hidden
                />
                {e.name}
              </span>
            ))}
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Hoja abierta={abierto} onOpenChange={setAbierto} titulo="Etiquetas">
        <div className="space-y-3">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar etiqueta…"
            autoFocus
          />
          {filtradas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ninguna etiqueta coincide con “{busqueda.trim()}”.
            </p>
          ) : (
            <ListaInset>
              {filtradas.map((e) => {
                const activa = seleccionadas.includes(e.id)
                return (
                  <FilaInset key={e.id} onClick={() => alternar(e.id)}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: e.color ?? SIN_COLOR }}
                        aria-hidden
                      />
                      <span className="truncate text-sm">{e.name}</span>
                    </span>
                    {activa && (
                      <span className="flex shrink-0 items-center text-primary">
                        <Check className="h-4 w-4" aria-hidden />
                        <span className="sr-only">seleccionada</span>
                      </span>
                    )}
                  </FilaInset>
                )
              })}
            </ListaInset>
          )}
          <Button className="w-full" onClick={() => setAbierto(false)}>
            Listo
          </Button>
        </div>
      </Hoja>
    </>
  )
}
