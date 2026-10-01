import { useQuery } from "@powersync/react"
import { ArrowLeft, UserPlus, X } from "lucide-react"
import { useState } from "react"

import { GrupoCategorias } from "@/componentes/GrupoCategorias"
import { PaletaColor } from "@/componentes/PaletaColor"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useGrupo } from "@/hooks/useGrupo"
import { useVolver } from "@/hooks/useVolver"
import { ApiError, api } from "@/lib/api"
import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

interface Membresia {
  user_id: string
  role: string
}

// Ajustes de un grupo (0026): lo que se ADMINISTRA, fuera de las pantallas de
// uso. Nombre, color, miembros y la taxonomia del grupo. Se escribe por API
// (crear y administrar grupos necesita servidor) y baja por la sync.
export function AjustesGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()
  const { miembros, nombre, miId } = useGrupo(id)
  const volver = useVolver(`/grupos/${id}`)
  const { data: membresias } = useQuery<Membresia>(
    "SELECT user_id, role FROM group_members WHERE group_id = ? AND deleted_at IS NULL",
    [id],
  )
  const [nombreNuevo, setNombreNuevo] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [username, setUsername] = useState("")
  const [aQuitar, setAQuitar] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [trabajando, setTrabajando] = useState(false)

  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />

  const rolDe = new Map(membresias.map((m) => [m.user_id, m.role]))
  // Agregar y sacar gente es del dueño del grupo (regla del servidor).
  const soyDueño = rolDe.get(miId) === "owner"
  const editando = nombreNuevo ?? grupo.name

  async function guardarNombre() {
    const limpio = editando.trim()
    if (!limpio || limpio === grupo?.name) return setNombreNuevo(null)
    try {
      await api.editarGrupo(id, { name: limpio })
      setNombreNuevo(null)
    } catch {
      setError("No se pudo cambiar el nombre. ¿Hay conexión?")
    }
  }

  async function agregar() {
    if (!username.trim()) return
    setTrabajando(true)
    setError("")
    try {
      await api.agregarMiembro(id, username.trim())
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

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 truncate text-2xl font-semibold">Ajustes del grupo</h1>
      </header>

      <section className="space-y-3">
        <Campo etiqueta="Nombre">
          <div className="flex gap-2">
            <Input
              value={editando}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") guardarNombre()
              }}
            />
            {nombreNuevo !== null && nombreNuevo.trim() !== grupo.name && (
              <Button onClick={guardarNombre}>Guardar</Button>
            )}
          </div>
        </Campo>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Color</p>
          {/* Cualquier miembro lo cambia: es la marca de origen del grupo en toda
              la app (3b.2c). Se guarda al toque. */}
          <PaletaColor
            valor={grupo.color ?? undefined}
            onCambio={(c) => void api.editarGrupo(id, { color: c })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Miembros</h2>
          {soyDueño && (
            <Button variant="outline" size="sm" onClick={() => setAgregando(true)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              Agregar
            </Button>
          )}
        </div>
        <ListaInset>
          {miembros.map((m) => (
            <FilaInset key={m.user_id} className="min-h-16">
              <span className="min-w-0 truncate text-sm">
                {nombre(m.user_id)}
                {rolDe.get(m.user_id) === "owner" && (
                  <span className="ml-2 text-xs text-muted-foreground">dueño</span>
                )}
              </span>
              {soyDueño && rolDe.get(m.user_id) !== "owner" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  aria-label={`Sacar a ${nombre(m.user_id)} del grupo`}
                  onClick={() => setAQuitar(m.user_id)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </FilaInset>
          ))}
        </ListaInset>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <GrupoCategorias groupId={id} />

      <Hoja abierta={agregando} onOpenChange={setAgregando} titulo={`Agregar a ${grupo.name}`}>
        <div className="space-y-3">
          <Campo etiqueta="Nombre de usuario">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="El username de la persona"
              autoCapitalize="none"
            />
          </Campo>
          <Button className="w-full" onClick={agregar} disabled={trabajando || !username.trim()}>
            {trabajando ? "Agregando…" : "Agregar al grupo"}
          </Button>
        </div>
      </Hoja>

      <Confirmar
        abierta={aQuitar !== null}
        onOpenChange={(v) => !v && setAQuitar(null)}
        titulo="Sacar del grupo"
        detalle="Deja de ver los gastos compartidos del grupo. Sus datos privados no se tocan."
        etiqueta="Sacar"
        destructivo
        onConfirmar={async () => {
          if (aQuitar) await api.quitarMiembro(id, aQuitar)
          setAQuitar(null)
        }}
      />
    </div>
  )
}
