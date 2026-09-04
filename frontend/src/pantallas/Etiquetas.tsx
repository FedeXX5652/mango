import { usePowerSync, useQuery } from "@powersync/react"
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Tags, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Aviso, Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { PALETA, SIN_COLOR } from "@/lib/paleta"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

interface Etiqueta {
  id: string
  name: string
  color: string | null
  archived: number
}

export function Etiquetas() {
  const navigate = useNavigate()
  const db = usePowerSync()
  const { data: etiquetas } = useQuery<Etiqueta>(
    "SELECT id, name, color, archived FROM tags WHERE deleted_at IS NULL",
  )
  // Movimientos etiquetados: da el "en uso" y el numero para el aviso.
  const { data: usoRows } = useQuery<{ id: string; n: number }>(
    "SELECT tag_id AS id, COUNT(*) AS n FROM transaction_tags WHERE deleted_at IS NULL GROUP BY tag_id",
  )
  const uso = useMemo(() => new Map(usoRows.map((r) => [r.id, r.n])), [usoRows])

  const [editando, setEditando] = useState<Etiqueta | "nueva" | null>(null)
  const [accion, setAccion] = useState<{ tipo: "archivar" | "eliminar"; e: Etiqueta } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Alfabetico con localeCompare: ordena bien acentos y ñ (LOWER de SQLite no).
  const ordenadas = useMemo(
    () => [...etiquetas].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [etiquetas],
  )
  const activas = ordenadas.filter((e) => !e.archived)
  const archivadas = ordenadas.filter((e) => e.archived)

  async function archivar(e: Etiqueta, valor: number) {
    await db.execute("UPDATE tags SET archived = ? WHERE id = ?", [valor, e.id])
  }
  async function borrar(e: Etiqueta) {
    await db.execute("DELETE FROM tags WHERE id = ?", [e.id])
  }

  function alTacho(e: Etiqueta) {
    const n = uso.get(e.id) ?? 0
    if (n > 0) {
      setAviso(
        `No se puede eliminar: hay ${n} movimiento${n === 1 ? "" : "s"} con esta etiqueta. Archivala en su lugar.`,
      )
      return
    }
    setAccion({ tipo: "eliminar", e })
  }
  function alArchivar(e: Etiqueta) {
    if (e.archived) archivar(e, 0) // desarchivar es reversible: directo
    else setAccion({ tipo: "archivar", e })
  }

  function fila(e: Etiqueta) {
    const n = uso.get(e.id) ?? 0
    const eliminable = n === 0
    return (
      <FilaInset key={e.id}>
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: e.color ?? SIN_COLOR }}
            aria-hidden
          />
          <div className="min-w-0">
            <p className={cn("truncate font-medium", e.archived && "text-muted-foreground")}>
              {e.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {n === 0 ? "Sin movimientos" : `${n} movimiento${n === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditando(e)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={e.archived ? "Desarchivar" : "Archivar"}
            onClick={() => alArchivar(e)}
          >
            {e.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Eliminar"
            aria-disabled={!eliminable}
            className={eliminable ? "text-expense" : "text-muted-foreground/40"}
            onClick={() => alTacho(e)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </FilaInset>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Etiquetas</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        La etiqueta dice a qué <strong>proyecto</strong> pertenece un gasto (un viaje, una
        refacción). Es otra dimensión que la categoría: un gasto puede tener varias o ninguna.
      </p>

      <Button className="w-full" onClick={() => setEditando("nueva")}>
        Nueva etiqueta
      </Button>
      <Hoja
        abierta={editando !== null}
        onOpenChange={(v) => {
          if (!v) setEditando(null)
        }}
        titulo={editando === "nueva" ? "Nueva etiqueta" : "Editar etiqueta"}
      >
        {editando && (
          <FormEtiqueta
            inicial={editando === "nueva" ? null : editando}
            existentes={etiquetas}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Hoja>

      {ordenadas.length === 0 ? (
        <Vacio
          icono={Tags}
          titulo="Sin etiquetas todavía"
          detalle="Creá una para seguir el costo de un proyecto sin ensuciar los informes por categoría."
        />
      ) : (
        <>
          {activas.length > 0 && <ListaInset>{activas.map(fila)}</ListaInset>}
          {archivadas.length > 0 && (
            <section className="space-y-2 pt-2">
              <h2 className="px-1 text-sm font-semibold text-muted-foreground">Archivadas</h2>
              <ListaInset>{archivadas.map(fila)}</ListaInset>
            </section>
          )}
        </>
      )}

      <Confirmar
        abierta={accion !== null}
        onOpenChange={(v) => {
          if (!v) setAccion(null)
        }}
        titulo={accion?.tipo === "eliminar" ? "Eliminar etiqueta" : "Archivar etiqueta"}
        detalle={
          accion?.tipo === "eliminar"
            ? `Se elimina "${accion.e.name}". No tiene movimientos.`
            : accion
              ? `"${accion.e.name}" se oculta de los selectores, pero los movimientos que ya la tienen la conservan.`
              : undefined
        }
        etiqueta={accion?.tipo === "eliminar" ? "Eliminar" : "Archivar"}
        destructivo={accion?.tipo === "eliminar"}
        onConfirmar={() => {
          if (!accion) return
          if (accion.tipo === "eliminar") borrar(accion.e)
          else archivar(accion.e, 1)
        }}
      />
      <Aviso
        abierta={aviso !== null}
        onOpenChange={(v) => {
          if (!v) setAviso(null)
        }}
        titulo="No se puede eliminar"
        detalle={aviso ?? ""}
      />
    </div>
  )
}

function FormEtiqueta({
  inicial,
  existentes,
  onCerrar,
}: {
  inicial: Etiqueta | null
  existentes: Etiqueta[]
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const [name, setName] = useState(inicial?.name ?? "")
  const [color, setColor] = useState(inicial?.color ?? PALETA[0])
  const [error, setError] = useState("")

  async function guardar() {
    setError("")
    const limpio = name.trim()
    if (!limpio) return setError("Poné un nombre")
    // El duplicado se valida ACA: la escritura es local y el 422 del servidor
    // llegaria despues, cuando el conector ya descarto la subida en silencio.
    const choca = existentes.some(
      (e) => e.id !== inicial?.id && e.name.toLowerCase() === limpio.toLowerCase(),
    )
    if (choca) return setError("Ya existe una etiqueta con ese nombre")

    try {
      if (inicial) {
        await db.execute("UPDATE tags SET name = ?, color = ? WHERE id = ?", [
          limpio,
          color,
          inicial.id,
        ])
      } else {
        await db.execute("INSERT INTO tags (id, name, color, archived) VALUES (?, ?, ?, 0)", [
          uuidv4(),
          limpio,
          color,
        ])
      }
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Viaje 2027, Refacción…"
        />
      </Campo>
      <Campo etiqueta="Color">
        <div className="flex flex-wrap gap-2">
          {PALETA.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn(
                "h-8 w-8 rounded-full transition-transform duration-100 ease-salida",
                color === c
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                  : "motion-safe:active:scale-95",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </Campo>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={guardar}>
          Guardar
        </Button>
        <Button variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
