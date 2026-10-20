import { usePowerSync, useQuery } from "@powersync/react"
import { Lock } from "lucide-react"
import { useMemo, useState } from "react"

import { AccionesEdicion, AccionesFila } from "@/componentes/AccionesEdicion"
import { BotonNuevo, EncabezadoPantalla } from "@/componentes/EncabezadoPantalla"
import { HojaReasignar } from "@/componentes/HojaReasignar"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Select } from "@/componentes/ui/select"
import { planCategoria } from "@/lib/reasignar"
import { uuidv4 } from "@/lib/uuid"
import { SelectorIcono } from "@/componentes/SelectorIcono"
import { useVolver } from "@/hooks/useVolver"
import { ordenarJerarquico } from "@/lib/categorias"
import { iconoDe } from "@/lib/iconos"
import { cn } from "@/lib/utils"

interface Categoria {
  id: string
  name: string
  kind: string
  parent_id: string | null
  archived: number
  icon: string | null
  // Del sistema (0026): no se archiva ni se borra.
  system_key: string | null
}

export function Categorias() {
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver("/ajustes")
  const db = usePowerSync()
  const { data: categorias } = useQuery<Categoria>(
    "SELECT id, name, kind, parent_id, archived, icon, system_key FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name",
  )
  const [mostrarForm, setMostrarForm] = useState(false)
  // Tocar una fila la edita (nombre e icono; archivar y eliminar, al pie). Se
  // cierra sola si la categoria ya no esta (se elimino desde ahi).
  const [editando, setEditando] = useState<Categoria | null>(null)
  const editandoVigente = editando !== null && categorias.some((c) => c.id === editando.id)
  const [accion, setAccion] = useState<{ tipo: "archivar" | "eliminar"; c: Categoria } | null>(null)
  // Eliminar y mover: el fallback para borrar una categoria ya usada sin tocar
  // los movimientos a mano (ESPECIFICACION 3.3).
  const [reasignando, setReasignando] = useState<Categoria | null>(null)

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
    // Si no la usa nadie, se borra directo.
    if (!enUso.has(c.id)) {
      setAccion({ tipo: "eliminar", c })
      return
    }
    // Si esta en uso, se ofrece mover lo que la referencia a otra. Si no hay
    // otra posible, la hoja lo dice y sugiere archivar.
    setReasignando(c)
  }

  // Destinos validos: del mismo tipo (un gasto no se mueve a una categoria de
  // ingreso) y, si la que se elimina tiene subcategorias, solo raices: el
  // arbol tiene dos niveles y colgarlas de una hija haria tres.
  function destinosDe(c: Categoria) {
    const tieneHijas = categorias.some((x) => x.parent_id === c.id)
    return categorias
      .filter(
        (x) =>
          x.id !== c.id &&
          x.kind === c.kind &&
          !x.archived &&
          x.parent_id !== c.id &&
          (!tieneHijas || !x.parent_id),
      )
      .map((x) => ({
        id: x.id,
        nombre: x.parent_id
          ? `${categorias.find((p) => p.id === x.parent_id)?.name ?? "—"} › ${x.name}`
          : x.name,
      }))
  }
  function alArchivar(c: Categoria) {
    if (c.archived)
      archivar(c, 0) // desarchivar es reversible: directo
    else setAccion({ tipo: "archivar", c })
  }

  const activas = categorias.filter((c) => !c.archived)
  const archivadas = categorias.filter((c) => c.archived)

  const fila = (c: Categoria, sangria?: boolean) => (
    <Fila
      key={c.id}
      c={c}
      sangria={sangria}
      onEditar={setEditando}
      onArchivar={alArchivar}
      onEliminar={alTacho}
    />
  )

  // Mismo orden que en el resto de la app: padres alfabeticos y, dentro de cada
  // uno, sus hijas alfabeticas. Se usa `ordenarJerarquico` y no el ORDER BY de
  // la consulta porque el de SQL usa la colacion de Postgres, que no es la
  // española: con eso, "Ñandu" o los acentos caen donde no va.
  function filasActivas(kind: string) {
    return ordenarJerarquico(activas.filter((c) => c.kind === kind)).map((c) =>
      fila(c, Boolean(c.parent_id)),
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <EncabezadoPantalla
        titulo="Categorías"
        volver={volver}
        acciones={<BotonNuevo etiqueta="Nueva categoría" onClick={() => setMostrarForm(true)} />}
      />

      <Hoja abierta={mostrarForm} onOpenChange={setMostrarForm} titulo="Nueva categoría">
        <FormularioCategoria principales={principales} onCerrar={() => setMostrarForm(false)} />
      </Hoja>
      <Hoja
        abierta={editandoVigente}
        onOpenChange={(v) => !v && setEditando(null)}
        titulo="Editar categoría"
      >
        {editando && (
          <FormularioCategoria
            key={editando.id}
            principales={principales}
            inicial={editando}
            onCerrar={() => setEditando(null)}
          />
        )}
        {/* Las del sistema (0026) se renombran, pero no se archivan ni se borran. */}
        {editando && !editando.system_key && (
          <AccionesEdicion
            archivada={editando.archived === 1}
            onArchivar={() => {
              alArchivar(editando)
              // Desarchivar es directo: la edicion ya no tiene nada que hacer.
              if (editando.archived) setEditando(null)
            }}
            onEliminar={() => alTacho(editando)}
          />
        )}
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
            <ListaInset>
              {ordenarJerarquico(archivadas).map((c) => fila(c, Boolean(c.parent_id)))}
            </ListaInset>
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
          setEditando(null)
        }}
      />
      {reasignando && (
        <HojaReasignar
          abierta
          onOpenChange={(v) => {
            if (!v) setReasignando(null)
          }}
          titulo="Eliminar y mover"
          nombre={reasignando.name}
          detalle={(() => {
            const n = movs.get(reasignando.id) ?? 0
            return n > 0
              ? `sus ${n} movimiento${n === 1 ? "" : "s"} y todo lo que la use`
              : "todo lo que la use"
          })()}
          destinos={destinosDe(reasignando)}
          plan={(destino) => planCategoria(reasignando.id, destino)}
        />
      )}
    </div>
  )
}

function Fila({
  c,
  sangria,
  onEditar,
  onArchivar,
  onEliminar,
}: {
  c: Categoria
  sangria?: boolean
  onEditar: (c: Categoria) => void
  onArchivar: (c: Categoria) => void
  onEliminar: (c: Categoria) => void
}) {
  // `iconoDe` devuelve un componente de un Map estatico (ver SelectorIcono).
  const Icono = iconoDe(c.icon)
  return (
    <FilaInset
      onClick={() => onEditar(c)}
      chevron
      acciones={
        c.system_key ? undefined : (
          <AccionesFila
            nombre={c.name}
            archivada={c.archived === 1}
            onArchivar={() => onArchivar(c)}
            onEliminar={() => onEliminar(c)}
          />
        )
      }
    >
      <span className={cn("flex min-w-0 items-center gap-3", sangria && "pl-6")}>
        {/* eslint-disable-next-line react-hooks/static-components */}
        <Icono className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
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
      {c.system_key && (
        // La crea y la usa la app (los cobros de un grupo): se puede renombrar
        // o cambiarle el icono, pero no archivar ni borrar.
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden />
          Del sistema
        </span>
      )}
    </FilaInset>
  )
}

// Alta o edicion (`inicial`) de una categoria. Al editar cambian el nombre y el
// icono: el tipo no (convertiria gastos en ingresos ya clasificados) y mover
// de padre es "eliminar y mover".
function FormularioCategoria({
  principales,
  inicial,
  onCerrar,
}: {
  principales: Categoria[]
  inicial?: Categoria
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const [name, setName] = useState(inicial?.name ?? "")
  const [kind, setKind] = useState<"expense" | "income">("expense")
  const [parentId, setParentId] = useState("")
  const [icono, setIcono] = useState<string | null>(inicial?.icon ?? null)
  const [error, setError] = useState("")

  // Si es subcategoria, hereda el kind del padre.
  const posiblesPadres = useMemo(
    () => principales.filter((p) => p.kind === kind && !p.archived),
    [principales, kind],
  )

  async function guardar() {
    if (!name.trim()) return setError("Poné un nombre")
    try {
      if (inicial) {
        await db.execute("UPDATE categories SET name = ?, icon = ? WHERE id = ?", [
          name.trim(),
          icono,
          inicial.id,
        ])
      } else {
        await db.execute(
          "INSERT INTO categories (id, name, kind, parent_id, icon, archived, sort_order) VALUES (?, ?, ?, ?, ?, 0, 0)",
          [uuidv4(), name.trim(), kind, parentId || null, icono],
        )
      }
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
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Transporte" />
        </div>
      </Campo>
      {!inicial && (
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
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={guardar}>
          Guardar
        </Button>
        <Button variant="secondary" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
