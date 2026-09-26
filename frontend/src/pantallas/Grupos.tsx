import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, ChevronRight, UserPlus, Users, X } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { ApiError, api } from "@/lib/api"
import { PALETA } from "@/lib/paleta"
import { usuarioActualId } from "@/lib/sesion"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

// Grupos (fase 3b.1): crear un grupo, ver los miembros, y —si sos el dueño—
// agregar por username o sacar a alguien. Todo se administra por API (crear
// necesita servidor, agregar es por username) y se lee del SQLite local, que
// baja por la sync.
//
// El nombre de cada miembro todavía no se muestra: `users` solo sincroniza tu
// propia fila. Sincronizar el perfil (username/nombre) de los otros miembros del
// grupo es parte de 3b.2, junto con lo que se comparte de un movimiento.

interface Grupo {
  id: string
  name: string
  base_currency: string
  color: string | null
  created_by: string
}

interface Miembro {
  id: string
  group_id: string
  user_id: string
  role: string
}

export function Grupos() {
  const navigate = useNavigate()
  const miId = usuarioActualId() ?? ""

  const { data: grupos } = useQuery<Grupo>(
    "SELECT id, name, base_currency, color, created_by FROM groups WHERE deleted_at IS NULL ORDER BY name",
  )
  const { data: miembros } = useQuery<Miembro>(
    "SELECT id, group_id, user_id, role FROM group_members WHERE deleted_at IS NULL",
  )

  const [nuevoNombre, setNuevoNombre] = useState("")
  const [nuevoColor, setNuevoColor] = useState<string>(PALETA[6]) // azul por defecto
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState("")

  async function crear() {
    if (!nuevoNombre.trim()) return
    setCreando(true)
    setError("")
    try {
      await api.crearGrupo(uuidv4(), nuevoNombre.trim(), "ARS", nuevoColor)
      setNuevoNombre("")
    } catch {
      setError("No se pudo crear. ¿Hay conexión?")
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/ajustes")}
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Grupos</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        Un grupo comparte gastos entre varias personas. Lo que marques como compartido lo ven todos
        los miembros; tus cuentas y medios de pago siguen siendo privados.
      </p>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre del grupo (ej: Casa)"
          />
          <Button onClick={crear} disabled={creando || !nuevoNombre.trim()}>
            Crear
          </Button>
        </div>
        <PaletaColor valor={nuevoColor} onCambio={setNuevoColor} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {grupos.length === 0 ? (
        <Vacio icono={Users} titulo="Sin grupos" detalle="Creá uno para compartir gastos." />
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <TarjetaGrupo
              key={g.id}
              grupo={g}
              miembros={miembros.filter((m) => m.group_id === g.id)}
              soyDueño={g.created_by === miId}
              miId={miId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Fila de swatches de la paleta compartida (lib/paleta). El elegido queda con un
// anillo. Se usa al crear un grupo y al recolorearlo.
function PaletaColor({
  valor,
  onCambio,
  className,
}: {
  valor?: string
  onCambio: (color: string) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {PALETA.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          onClick={() => onCambio(c)}
          className={cn(
            "h-6 w-6 rounded-full transition-transform",
            valor === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : "hover:scale-110",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

function TarjetaGrupo({
  grupo,
  miembros,
  soyDueño,
  miId,
}: {
  grupo: Grupo
  miembros: Miembro[]
  soyDueño: boolean
  miId: string
}) {
  const db = usePowerSync()
  const navigate = useNavigate()
  const [agregando, setAgregando] = useState(false)
  const [username, setUsername] = useState("")
  const [error, setError] = useState("")
  const [trabajando, setTrabajando] = useState(false)
  const [aQuitar, setAQuitar] = useState<Miembro | null>(null)

  async function agregar() {
    if (!username.trim()) return
    setTrabajando(true)
    setError("")
    try {
      await api.agregarMiembro(grupo.id, username.trim())
      setUsername("")
      setAgregando(false)
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 422
          ? e.detalle
          : "No se pudo agregar. ¿Hay conexión?",
      )
    } finally {
      setTrabajando(false)
    }
  }

  async function quitar(m: Miembro) {
    await api.quitarMiembro(grupo.id, m.user_id)
    setAQuitar(null)
    // El borrado baja por la sync; nada que tocar local. `db` queda por si más
    // adelante hace falta una escritura local.
    void db
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(`/grupos/${grupo.id}`)}
          className="flex min-w-0 items-center gap-2 font-medium hover:underline"
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: grupo.color || "#9CA3AF" }}
            aria-hidden
          />
          <span className="truncate">{grupo.name}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        {soyDueño && (
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setAgregando(true)}>
            <UserPlus className="h-4 w-4" />
            Agregar
          </Button>
        )}
      </div>

      {/* Cualquier miembro cambia el color: es la marca de origen del grupo en
          toda la app (3b.2c). Se guarda al toque por API. */}
      <PaletaColor
        valor={grupo.color ?? undefined}
        onCambio={(c) => void api.editarGrupo(grupo.id, { color: c })}
        className="mt-3"
      />

      <ListaInset className="mt-3">
        {miembros.map((m) => (
          <FilaInset key={m.id}>
            <span className="min-w-0 truncate text-sm">
              {m.user_id === miId ? "Vos" : m.user_id.slice(0, 8)}
              {m.role === "owner" && (
                <span className="ml-2 text-xs text-muted-foreground">dueño</span>
              )}
            </span>
            {soyDueño && m.role !== "owner" && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Quitar del grupo"
                onClick={() => setAQuitar(m)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </FilaInset>
        ))}
      </ListaInset>

      <Hoja abierta={agregando} onOpenChange={setAgregando} titulo={`Agregar a ${grupo.name}`}>
        <div className="space-y-3">
          <Campo etiqueta="Nombre de usuario">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="El username de la persona"
              autoCapitalize="none"
              autoFocus
            />
          </Campo>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={agregar} disabled={trabajando || !username.trim()}>
            {trabajando ? "Agregando…" : "Agregar al grupo"}
          </Button>
        </div>
      </Hoja>

      <Confirmar
        abierta={aQuitar !== null}
        onOpenChange={(v) => !v && setAQuitar(null)}
        titulo="Quitar del grupo"
        detalle="Deja de ver los gastos compartidos del grupo. Sus datos privados no se tocan."
        etiqueta="Quitar"
        destructivo
        onConfirmar={() => aQuitar && quitar(aQuitar)}
      />
    </section>
  )
}
