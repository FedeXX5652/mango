import { usePowerSync, useQuery } from "@powersync/react"
import { Check, ChevronRight, Plus } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { PALETA, SIN_COLOR } from "@/lib/paleta"
import { uuidv4 } from "@/lib/uuid"

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
  const db = usePowerSync()
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState("")

  const orden = useMemo(
    () => [...etiquetas].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [etiquetas],
  )

  // Se muestra SIEMPRE, aunque no haya ninguna etiqueta: antes devolvia null y
  // el campo quedaba como un titulo suelto pegado a "Guardar", sin forma de
  // crear la primera desde el alta.
  const elegidas = orden.filter((e) => seleccionadas.includes(e.id))
  const q = busqueda.trim().toLowerCase()
  const filtradas = q ? orden.filter((e) => e.name.toLowerCase().includes(q)) : orden

  // Crear desde el buscador: si lo escrito no es ninguna etiqueta, se crea y
  // queda elegida. Si ya existe (sin importar mayusculas), se elige esa.
  const texto = busqueda.trim()
  const existente = orden.find((e) => e.name.toLowerCase() === texto.toLowerCase())
  async function crear() {
    if (!texto) return
    if (existente) {
      if (!seleccionadas.includes(existente.id)) onCambio([...seleccionadas, existente.id])
      setBusqueda("")
      return
    }
    const id = uuidv4()
    await db.execute("INSERT INTO tags (id, name, color, archived) VALUES (?, ?, ?, 0)", [
      id,
      texto,
      PALETA[orden.length % PALETA.length],
    ])
    onCambio([...seleccionadas, id])
    setBusqueda("")
  }

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
          {/* Sin autoFocus: en el telefono abria el teclado y tapaba la lista. */}
          <Input
            aria-label="Buscar o crear etiqueta"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") crear()
            }}
            placeholder={orden.length > 0 ? "Buscar o crear etiqueta…" : "Nombre de la etiqueta…"}
          />
          {texto && !existente && (
            <ListaInset>
              <FilaInset onClick={crear}>
                <span className="flex min-w-0 items-center gap-3 text-sm">
                  <Plus className="h-4 w-4 shrink-0 text-enlace" aria-hidden />
                  <span className="truncate">
                    Crear etiqueta <span className="font-medium">“{texto}”</span>
                  </span>
                </span>
              </FilaInset>
            </ListaInset>
          )}
          {orden.length === 0 ? (
            !texto && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Todavía no tenés etiquetas. Escribí un nombre para crear la primera.
              </p>
            )
          ) : filtradas.length === 0 ? (
            !texto && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Ninguna etiqueta coincide.
              </p>
            )
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
                      <span className="flex shrink-0 items-center text-enlace">
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
