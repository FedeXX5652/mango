import { usePowerSync, useQuery } from "@powersync/react"
import { Archive, ArchiveRestore, ArrowLeft, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Aviso, Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Select } from "@/componentes/ui/select"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

interface Categoria {
  id: string
  name: string
  kind: string
  parent_id: string | null
  archived: number
}

export function Categorias() {
  const navigate = useNavigate()
  const db = usePowerSync()
  const { data: categorias } = useQuery<Categoria>(
    "SELECT id, name, kind, parent_id, archived FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name",
  )
  const [mostrarForm, setMostrarForm] = useState(false)
  const [accion, setAccion] = useState<{ tipo: "archivar" | "eliminar"; c: Categoria } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const principales = categorias.filter((c) => !c.parent_id)

  // Categorias referenciadas (movimientos, presupuestos, reglas, plantillas) o
  // con subcategorias: no se pueden eliminar, solo archivar.
  const { data: enUsoRows } = useQuery<{ id: string }>(
    // Nota: category_rules (ingesta) no se sincroniza al cliente, no se chequea aca.
    `SELECT category_id AS id FROM transactions WHERE deleted_at IS NULL AND category_id IS NOT NULL
     UNION SELECT category_id FROM budgets WHERE deleted_at IS NULL AND category_id IS NOT NULL
     UNION SELECT category_id FROM budget_rules WHERE deleted_at IS NULL AND category_id IS NOT NULL
     UNION SELECT category_id FROM templates WHERE deleted_at IS NULL AND category_id IS NOT NULL
     UNION SELECT category_id FROM recurring_rules WHERE deleted_at IS NULL AND category_id IS NOT NULL
     UNION SELECT parent_id FROM categories WHERE deleted_at IS NULL AND parent_id IS NOT NULL`,
  )
  const enUso = useMemo(() => new Set(enUsoRows.map((r) => r.id)), [enUsoRows])
  const { data: movsRows } = useQuery<{ id: string; n: number }>(
    "SELECT category_id AS id, COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL AND category_id IS NOT NULL GROUP BY category_id",
  )
  const movs = useMemo(() => new Map(movsRows.map((r) => [r.id, r.n])), [movsRows])

  async function archivar(c: Categoria, valor: number) {
    await db.execute("UPDATE categories SET archived = ? WHERE id = ?", [valor, c.id])
  }
  async function borrar(c: Categoria) {
    await db.execute("DELETE FROM categories WHERE id = ?", [c.id])
  }

  function alTacho(c: Categoria) {
    if (!enUso.has(c.id)) {
      setAccion({ tipo: "eliminar", c })
      return
    }
    const n = movs.get(c.id) ?? 0
    setAviso(
      n > 0
        ? `No se puede eliminar: tiene ${n} movimiento${n === 1 ? "" : "s"} asociado${n === 1 ? "" : "s"}. Archivala en su lugar.`
        : "No se puede eliminar: está en uso (presupuestos, plantillas, recurrentes o subcategorías). Archivala en su lugar.",
    )
  }
  function alArchivar(c: Categoria) {
    if (c.archived) archivar(c, 0) // desarchivar es reversible: directo
    else setAccion({ tipo: "archivar", c })
  }

  const activas = categorias.filter((c) => !c.archived)
  const archivadas = categorias.filter((c) => c.archived)
  const idsPadresActivos = new Set(activas.filter((c) => !c.parent_id).map((c) => c.id))
  const hijasActivasDe = (id: string) => activas.filter((c) => c.parent_id === id)

  const fila = (c: Categoria, sangria?: boolean) => (
    <Fila
      key={c.id}
      c={c}
      sangria={sangria}
      eliminable={!enUso.has(c.id)}
      onArchivar={alArchivar}
      onEliminar={alTacho}
    />
  )

  function filasActivas(kind: string) {
    const padres = activas.filter((c) => !c.parent_id && c.kind === kind)
    const huerfanas = activas.filter(
      (c) => c.parent_id && c.kind === kind && !idsPadresActivos.has(c.parent_id),
    )
    return [
      ...padres.flatMap((p) => [fila(p), ...hijasActivasDe(p.id).map((h) => fila(h, true))]),
      ...huerfanas.map((h) => fila(h)),
    ]
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Categorías</h1>
      </header>

      <Button className="w-full" onClick={() => setMostrarForm(true)}>
        Nueva categoría
      </Button>
      <Hoja abierta={mostrarForm} onOpenChange={setMostrarForm} titulo="Nueva categoría">
        <FormularioCategoria principales={principales} onCerrar={() => setMostrarForm(false)} />
      </Hoja>

      <div className="space-y-4">
        {(["expense", "income"] as const).map((kind) => {
          const filas = filasActivas(kind)
          if (filas.length === 0) return null
          return (
            <section key={kind}>
              <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
                {kind === "expense" ? "Gasto" : "Ingreso"}
              </h2>
              <ListaInset>{filas}</ListaInset>
            </section>
          )
        })}

        {archivadas.length > 0 && (
          <section className="pt-2">
            <h2 className="mb-1 text-sm font-semibold text-muted-foreground">Archivadas</h2>
            <ListaInset>{archivadas.map((c) => fila(c, !!c.parent_id))}</ListaInset>
          </section>
        )}
      </div>

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
              ? `"${accion.c.name}" se oculta de los selectores. Podés desarchivarla cuando quieras.`
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

function Fila({
  c,
  sangria,
  eliminable,
  onArchivar,
  onEliminar,
}: {
  c: Categoria
  sangria?: boolean
  eliminable?: boolean
  onArchivar: (c: Categoria) => void
  onEliminar: (c: Categoria) => void
}) {
  return (
    <FilaInset>
      <span
        className={cn(
          "truncate",
          sangria && "pl-6 text-sm",
          c.archived && "text-muted-foreground line-through",
        )}
      >
        {c.name}
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
          aria-disabled={!eliminable}
          className={eliminable ? "text-expense" : "text-muted-foreground/40"}
          onClick={() => onEliminar(c)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </FilaInset>
  )
}

function FormularioCategoria({
  principales,
  onCerrar,
}: {
  principales: Categoria[]
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const [name, setName] = useState("")
  const [kind, setKind] = useState<"expense" | "income">("expense")
  const [parentId, setParentId] = useState("")
  const [error, setError] = useState("")

  // Si es subcategoria, hereda el kind del padre.
  const posiblesPadres = useMemo(
    () => principales.filter((p) => p.kind === kind && !p.archived),
    [principales, kind],
  )

  async function guardar() {
    if (!name.trim()) return setError("Poné un nombre")
    try {
      await db.execute(
        "INSERT INTO categories (id, name, kind, parent_id, archived, sort_order) VALUES (?, ?, ?, ?, 0, 0)",
        [uuidv4(), name.trim(), kind, parentId || null],
      )
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Transporte" />
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
