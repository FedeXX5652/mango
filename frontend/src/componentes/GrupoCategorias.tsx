import { usePowerSync, useQuery } from "@powersync/react"
import { Archive, ArchiveRestore, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Select } from "@/componentes/ui/select"
import { SelectorIcono } from "@/componentes/SelectorIcono"
import { ordenarJerarquico } from "@/lib/categorias"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

// Categorias DEL GRUPO (fase 3b.2b, ver 0014). Las ve y edita cualquier miembro;
// un gasto compartido se categoriza con estas. Es una version acotada del gestor
// personal (Categorias.tsx): crear, archivar y eliminar-si-no-esta-en-uso. La
// reasignacion al eliminar una en uso queda para cuando haga falta (3b.3): por
// ahora una categoria de grupo en uso se archiva, no se borra.

interface Categoria {
  id: string
  name: string
  kind: string
  parent_id: string | null
  archived: number
  icon: string | null
}

export function GrupoCategorias({ groupId }: { groupId: string }) {
  const db = usePowerSync()
  const { data: categorias } = useQuery<Categoria>(
    "SELECT id, name, kind, parent_id, archived, icon FROM categories" +
      " WHERE group_id = ? AND deleted_at IS NULL ORDER BY sort_order, name",
    [groupId],
  )
  const [mostrarForm, setMostrarForm] = useState(false)
  const [accion, setAccion] = useState<{ tipo: "archivar" | "eliminar"; c: Categoria } | null>(null)

  const principales = categorias.filter((c) => !c.parent_id)

  // En uso = referenciada por un movimiento compartido del grupo, o con hijas.
  // (Presupuestos/reglas de grupo son 3b.3: todavia no existen.)
  const { data: enUsoRows } = useQuery<{ id: string }>(
    "SELECT category_id AS id FROM transactions" +
      " WHERE group_id = ? AND deleted_at IS NULL AND category_id IS NOT NULL" +
      " UNION SELECT parent_id FROM categories" +
      " WHERE group_id = ? AND deleted_at IS NULL AND parent_id IS NOT NULL",
    [groupId, groupId],
  )
  const enUso = useMemo(() => new Set(enUsoRows.map((r) => r.id)), [enUsoRows])

  async function archivar(c: Categoria, valor: number) {
    await db.execute("UPDATE categories SET archived = ? WHERE id = ?", [valor, c.id])
  }
  async function alIcono(c: Categoria, clave: string | null) {
    await db.execute("UPDATE categories SET icon = ? WHERE id = ?", [clave, c.id])
  }
  async function borrar(c: Categoria) {
    await db.execute("DELETE FROM categories WHERE id = ?", [c.id])
  }

  function alTacho(c: Categoria) {
    // En uso no se borra: se archiva (la reasignacion es 3b.3). Fuera de uso, se
    // borra directo.
    setAccion({ tipo: enUso.has(c.id) ? "archivar" : "eliminar", c })
  }
  function alArchivar(c: Categoria) {
    if (c.archived) archivar(c, 0)
    else setAccion({ tipo: "archivar", c })
  }

  const activas = categorias.filter((c) => !c.archived)
  const archivadas = categorias.filter((c) => c.archived)

  const fila = (c: Categoria) => (
    <Fila
      key={c.id}
      c={c}
      onArchivar={alArchivar}
      onEliminar={alTacho}
      onIcono={alIcono}
    />
  )

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Categorías del grupo</h2>
        <Button variant="outline" size="sm" onClick={() => setMostrarForm(true)}>
          Nueva
        </Button>
      </div>
      <Hoja abierta={mostrarForm} onOpenChange={setMostrarForm} titulo="Nueva categoría del grupo">
        <FormularioCategoria
          groupId={groupId}
          principales={principales}
          onCerrar={() => setMostrarForm(false)}
        />
      </Hoja>

      {(["expense", "income"] as const).map((kind) => {
        const filas = ordenarJerarquico(activas.filter((c) => c.kind === kind)).map(fila)
        if (filas.length === 0) return null
        return (
          <div key={kind}>
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">
              {kind === "expense" ? "Gasto" : "Ingreso"}
            </h3>
            <ListaInset>{filas}</ListaInset>
          </div>
        )
      })}

      {archivadas.length > 0 && (
        <div className="pt-1">
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Archivadas</h3>
          <ListaInset>{ordenarJerarquico(archivadas).map(fila)}</ListaInset>
        </div>
      )}

      <Confirmar
        abierta={accion !== null}
        onOpenChange={(v) => {
          if (!v) setAccion(null)
        }}
        titulo={accion?.tipo === "eliminar" ? "Eliminar categoría" : "Archivar categoría"}
        detalle={
          accion?.tipo === "eliminar"
            ? `Se elimina "${accion.c.name}". No está en uso.`
            : accion
              ? `"${accion.c.name}" se oculta de los selectores. Está en uso o tiene subcategorías; podés desarchivarla cuando quieras.`
              : undefined
        }
        etiqueta={accion?.tipo === "eliminar" ? "Eliminar" : "Archivar"}
        destructivo={accion?.tipo === "eliminar"}
        onConfirmar={() => {
          if (!accion) return
          if (accion.tipo === "eliminar") borrar(accion.c)
          else archivar(accion.c, 1)
        }}
      />
    </section>
  )
}

function Fila({
  c,
  onArchivar,
  onEliminar,
  onIcono,
}: {
  c: Categoria
  onArchivar: (c: Categoria) => void
  onEliminar: (c: Categoria) => void
  onIcono: (c: Categoria, clave: string | null) => void
}) {
  const sangria = Boolean(c.parent_id)
  return (
    <FilaInset>
      <span className={cn("flex min-w-0 items-center gap-2.5", sangria && "pl-6")}>
        <SelectorIcono variante="fila" valor={c.icon} onCambio={(clave) => onIcono(c, clave)} />
        <span
          className={cn(
            "truncate",
            sangria && "text-sm",
            c.archived && "text-muted-foreground line-through",
          )}
        >
          {c.name}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={c.archived ? "Desarchivar" : "Archivar"}
          onClick={() => onArchivar(c)}
        >
          {c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Eliminar"
          className="text-expense"
          onClick={() => onEliminar(c)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </FilaInset>
  )
}

function FormularioCategoria({
  groupId,
  principales,
  onCerrar,
}: {
  groupId: string
  principales: Categoria[]
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const [name, setName] = useState("")
  const [kind, setKind] = useState<"expense" | "income">("expense")
  const [parentId, setParentId] = useState("")
  const [icono, setIcono] = useState<string | null>(null)
  const [error, setError] = useState("")

  const posiblesPadres = useMemo(
    () => principales.filter((p) => p.kind === kind && !p.archived),
    [principales, kind],
  )

  async function guardar() {
    if (!name.trim()) return setError("Poné un nombre")
    try {
      // group_id fija el ambito: es una categoria DEL grupo (owner_id queda NULL,
      // lo pone el backend al validar la membresia, ver 0014).
      await db.execute(
        "INSERT INTO categories (id, group_id, name, kind, parent_id, icon, archived, sort_order)" +
          " VALUES (?, ?, ?, ?, ?, ?, 0, 0)",
        [uuidv4(), groupId, name.trim(), kind, parentId || null, icono],
      )
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre">
        <div className="flex items-center gap-2">
          <SelectorIcono valor={icono} onCambio={setIcono} />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Supermercado" />
        </div>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Tipo">
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as "expense" | "income")
              setParentId("")
            }}
          >
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </Select>
        </Campo>
        <Campo etiqueta="Categoría padre (opcional)">
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Ninguna (nivel 1) —</option>
            {posiblesPadres.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
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
