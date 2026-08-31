import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
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

  const principales = categorias.filter((c) => !c.parent_id)
  const hijasDe = (id: string) => categorias.filter((c) => c.parent_id === id)

  async function archivar(c: Categoria, valor: number) {
    await db.execute("UPDATE categories SET archived = ? WHERE id = ?", [valor, c.id])
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Categorías</h1>
      </header>

      {mostrarForm ? (
        <FormularioCategoria principales={principales} onCerrar={() => setMostrarForm(false)} />
      ) : (
        <Button className="w-full" onClick={() => setMostrarForm(true)}>
          Nueva categoría
        </Button>
      )}

      <div className="space-y-4">
        {(["expense", "income"] as const).map((kind) => (
          <section key={kind}>
            <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
              {kind === "expense" ? "Gasto" : "Ingreso"}
            </h2>
            <ul className="divide-y divide-border">
              {principales
                .filter((c) => c.kind === kind)
                .map((p) => (
                  <li key={p.id} className="py-2">
                    <Fila c={p} onArchivar={archivar} />
                    {hijasDe(p.id).map((h) => (
                      <div key={h.id} className="pl-6">
                        <Fila c={h} onArchivar={archivar} />
                      </div>
                    ))}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function Fila({
  c,
  onArchivar,
}: {
  c: Categoria
  onArchivar: (c: Categoria, valor: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className={cn("truncate", c.archived && "text-muted-foreground line-through")}>
        {c.name}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onArchivar(c, c.archived ? 0 : 1)}>
        {c.archived ? "Desarchivar" : "Archivar"}
      </Button>
    </div>
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
    await db.execute(
      "INSERT INTO categories (id, name, kind, parent_id, archived, sort_order) VALUES (?, ?, ?, ?, 0, 0)",
      [uuidv4(), name.trim(), kind, parentId || null],
    )
    onCerrar()
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
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
