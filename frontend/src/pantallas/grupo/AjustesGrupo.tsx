import { useQuery } from "@powersync/react"
import { Pencil, UserPlus, X } from "lucide-react"
import { useState } from "react"

import { EncabezadoPantalla } from "@/componentes/EncabezadoPantalla"
import { GrupoCategorias } from "@/componentes/GrupoCategorias"
import { PaletaColor } from "@/componentes/PaletaColor"
import { GrupoEtiquetas } from "@/componentes/grupo/GrupoEtiquetas"
import { PlantillasDelGrupo } from "@/componentes/grupo/PlantillasDelGrupo"
import { RepartoDelGrupo } from "@/componentes/grupo/RepartoDelGrupo"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useConexion } from "@/hooks/conexion"
import { useGrupo } from "@/hooks/useGrupo"
import { useIrAAncla } from "@/hooks/useIrAAncla"
import { useVolver } from "@/hooks/useVolver"
import { anunciar } from "@/lib/anuncios"
import { ApiError, api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

interface Membresia {
  user_id: string
  role: string
  // Como se llama en el grupo (0035) y su nombre de Mango, para decir quien es.
  alias: string | null
  nombre_mango: string | null
}

// Ajustes de un grupo (0026): lo que se ADMINISTRA, fuera de las pantallas de
// uso. Nombre, color, miembros y la taxonomia del grupo. Se escribe por API
// (crear y administrar grupos necesita servidor) y baja por la sync.
export function AjustesGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()
  const { miembros, nombre, miId } = useGrupo(id)
  const volver = useVolver(`/grupos/${id}`)
  const { data: membresias } = useQuery<Membresia>(
    `SELECT gm.user_id, gm.role, gm.alias, u.display_name AS nombre_mango
     FROM group_members gm LEFT JOIN member_profiles u ON u.id = gm.user_id
     WHERE gm.group_id = ? AND gm.deleted_at IS NULL`,
    [id],
  )
  const [nombreNuevo, setNombreNuevo] = useState<string | null>(null)
  // Lo que se mando al servidor y todavia no bajo por la sync, con el valor que
  // habia al mandarlo. Mientras el grupo siga con ese valor viejo se muestra lo
  // mandado: antes el campo volvia al nombre anterior unos segundos y parecia
  // que no se habia guardado. Cuando cambia (llego esto u otra cosa), manda el
  // grupo.
  const [nombreEnviado, setNombreEnviado] = useState<{ valor: string; antes: string } | null>(null)
  const [colorEnviado, setColorEnviado] = useState<{
    valor: string
    antes: string | null
  } | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [username, setUsername] = useState("")
  const [aQuitar, setAQuitar] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [errorAgregar, setErrorAgregar] = useState("")
  const [trabajando, setTrabajando] = useState(false)
  // Mi nombre en este grupo (0035). Lo mandado se muestra hasta que baja por la
  // sync, igual que el nombre del grupo.
  const [editandoAlias, setEditandoAlias] = useState(false)
  const [aliasTexto, setAliasTexto] = useState("")
  const [aliasEnviado, setAliasEnviado] = useState<{
    valor: string | null
    antes: string | null
  } | null>(null)
  const [errorAlias, setErrorAlias] = useState("")
  const [guardandoAlias, setGuardandoAlias] = useState(false)
  // Nombre, color y miembros los cambia el servidor: sin conexion se apagan y
  // se dice por que (DESIGN.md 7, "Estado sin conexion").
  const hayConexion = useConexion()

  // Los accesos del Inicio del grupo llegan a una seccion (`#miembros`,
  // `#categorias`).
  useIrAAncla(!cargando)

  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />

  const rolDe = new Map(membresias.map((m) => [m.user_id, m.role]))
  // Agregar y sacar gente es del dueño del grupo (regla del servidor).
  const soyDueño = rolDe.get(miId) === "owner"
  const nombreActual =
    nombreEnviado && grupo.name === nombreEnviado.antes ? nombreEnviado.valor : grupo.name
  const colorActual =
    colorEnviado && grupo.color === colorEnviado.antes ? colorEnviado.valor : grupo.color
  const editando = nombreNuevo ?? nombreActual
  const miFila = membresias.find((m) => m.user_id === miId)
  const miNombreMango = miFila?.nombre_mango ?? ""
  const miAlias =
    aliasEnviado && (miFila?.alias ?? null) === aliasEnviado.antes
      ? aliasEnviado.valor
      : (miFila?.alias ?? null)
  const aliasDe = (uid: string) =>
    uid === miId ? miAlias : (membresias.find((m) => m.user_id === uid)?.alias ?? null)

  function abrirAlias() {
    setAliasTexto(miAlias ?? "")
    setErrorAlias("")
    setEditandoAlias(true)
  }

  async function guardarAlias() {
    const limpio = aliasTexto.trim()
    setGuardandoAlias(true)
    setErrorAlias("")
    try {
      await api.editarMiAlias(id, limpio || null)
      setAliasEnviado({ valor: limpio || null, antes: miFila?.alias ?? null })
      setEditandoAlias(false)
      anunciar(
        limpio
          ? `En ${nombreActual} ahora te llamás «${limpio}». Los demás lo ven en unos segundos.`
          : `En ${nombreActual} volvés a figurar con tu nombre de Mango, ${miNombreMango}.`,
      )
    } catch (e) {
      setErrorAlias(
        e instanceof ApiError && e.status === 422
          ? e.detalle
          : "No se pudo guardar. ¿Hay conexión?",
      )
    } finally {
      setGuardandoAlias(false)
    }
  }

  async function guardarNombre() {
    const limpio = editando.trim()
    if (!limpio || limpio === nombreActual) return setNombreNuevo(null)
    if (!hayConexion) return
    try {
      await api.editarGrupo(id, { name: limpio })
      setNombreEnviado({ valor: limpio, antes: grupo?.name ?? "" })
      setNombreNuevo(null)
      setError("")
      anunciar("Nombre guardado")
    } catch {
      setError("No se pudo cambiar el nombre. ¿Hay conexión?")
    }
  }

  async function cambiarColor(c: string) {
    try {
      await api.editarGrupo(id, { color: c })
      setColorEnviado({ valor: c, antes: grupo?.color ?? null })
    } catch {
      anunciar("No se pudo cambiar el color. Revisá la conexión.", { importante: true })
    }
  }

  async function agregar() {
    const quien = username.trim()
    if (!quien) return
    setTrabajando(true)
    setErrorAgregar("")
    try {
      await api.agregarMiembro(id, quien)
      setUsername("")
      setAgregando(false)
      // Llega a la lista con la sync: sin esto la hoja se cerraba y no pasaba
      // nada a la vista por unos segundos.
      anunciar(`Se sumó a ${quien} al grupo.`)
    } catch (e) {
      setErrorAgregar(
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
      <EncabezadoPantalla titulo="Ajustes del grupo" volver={volver} />

      <section className="space-y-3">
        {/* `fieldset disabled` apaga de una el campo, el boton y la paleta. */}
        <fieldset disabled={!hayConexion} className="min-w-0 space-y-3">
          <Campo etiqueta="Nombre">
            <div className="flex gap-2">
              <Input
                value={editando}
                onChange={(e) => setNombreNuevo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") guardarNombre()
                }}
              />
              {nombreNuevo !== null && nombreNuevo.trim() !== nombreActual && (
                <Button onClick={guardarNombre}>Guardar</Button>
              )}
            </div>
          </Campo>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Color</p>
            {/* Cualquier miembro lo cambia: es la marca de origen del grupo en toda
                la app (3b.2c). Se guarda al toque. */}
            <PaletaColor
              valor={colorActual ?? undefined}
              onCambio={(c) => void cambiarColor(c)}
              className={cn(!hayConexion && "opacity-50")}
            />
          </div>
        </fieldset>
        {!hayConexion && (
          <p className="text-xs text-muted-foreground">
            Cambiar el nombre o el color necesita conexión: lo hace el servidor.
          </p>
        )}
      </section>

      <section id="miembros" className="scroll-mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Miembros</h2>
          {soyDueño && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setErrorAgregar("")
                setAgregando(true)
              }}
              disabled={!hayConexion}
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              Agregar
            </Button>
          )}
        </div>
        {soyDueño && !hayConexion && (
          <p className="text-xs text-muted-foreground">
            Agregar o sacar miembros necesita conexión: lo hace el servidor.
          </p>
        )}
        <ListaInset>
          {miembros.map((m) => (
            <FilaInset key={m.user_id} className="min-h-16">
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  {m.user_id === miId
                    ? miAlias || miNombreMango || nombre(m.user_id)
                    : nombre(m.user_id)}
                  {m.user_id === miId && (
                    <span className="ml-2 text-xs text-muted-foreground">vos</span>
                  )}
                  {rolDe.get(m.user_id) === "owner" && (
                    <span className="ml-2 text-xs text-muted-foreground">dueño</span>
                  )}
                </span>
                {/* Con alias, quien es en Mango: si no, "Fefi" no le dice nada a
                    quien recien entra. */}
                {aliasDe(m.user_id) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    En Mango: {membresias.find((x) => x.user_id === m.user_id)?.nombre_mango ?? ""}
                  </span>
                )}
              </span>
              {m.user_id === miId && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Cambiar tu nombre en ${nombreActual}`}
                  onClick={abrirAlias}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
              )}
              {soyDueño && rolDe.get(m.user_id) !== "owner" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  aria-label={`Sacar a ${nombre(m.user_id)} del grupo`}
                  onClick={() => setAQuitar(m.user_id)}
                  disabled={!hayConexion}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </FilaInset>
          ))}
        </ListaInset>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <RepartoDelGrupo groupId={id} miembros={miembros} nombre={nombre} />

      <div id="plantillas" className="scroll-mt-4">
        <PlantillasDelGrupo groupId={id} moneda={grupo.base_currency} />
      </div>

      <div id="etiquetas" className="scroll-mt-4">
        <GrupoEtiquetas groupId={id} />
      </div>

      <div id="categorias" className="scroll-mt-4">
        <GrupoCategorias groupId={id} />
      </div>

      <Hoja abierta={agregando} onOpenChange={setAgregando} titulo={`Agregar a ${grupo.name}`}>
        <div className="space-y-3">
          <Campo etiqueta="Nombre de usuario">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="El nombre de usuario con el que entra a Mango"
              autoCapitalize="none"
            />
          </Campo>
          {/* El error va en la hoja: abajo, en la pantalla, quedaba tapado. */}
          {errorAgregar && (
            <p role="alert" className="text-sm text-destructive">
              {errorAgregar}
            </p>
          )}
          {!hayConexion && (
            <p className="text-sm text-muted-foreground">Necesita conexión: lo hace el servidor.</p>
          )}
          <Button
            className="w-full"
            onClick={agregar}
            disabled={trabajando || !username.trim() || !hayConexion}
          >
            {trabajando ? "Agregando…" : "Agregar al grupo"}
          </Button>
        </div>
      </Hoja>

      <Hoja
        abierta={editandoAlias}
        onOpenChange={setEditandoAlias}
        titulo={`Tu nombre en ${nombreActual}`}
      >
        <div className="space-y-3">
          <Campo etiqueta="Cómo te llaman en este grupo">
            <Input
              value={aliasTexto}
              onChange={(e) => setAliasTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hayConexion && !guardandoAlias) void guardarAlias()
              }}
              placeholder={miNombreMango}
              maxLength={40}
            />
          </Campo>
          <p className="text-sm text-muted-foreground">
            Lo ven todos en {nombreActual}: en los gastos, el balance y los avisos. En tus otros
            grupos no cambia. Vacío, se usa tu nombre de Mango
            {miNombreMango ? ` (${miNombreMango})` : ""}.
          </p>
          {errorAlias && (
            <p role="alert" className="text-sm text-destructive">
              {errorAlias}
            </p>
          )}
          {!hayConexion && (
            <p className="text-sm text-muted-foreground">
              Necesita conexión: lo guarda el servidor.
            </p>
          )}
          <Button
            className="w-full"
            onClick={() => void guardarAlias()}
            disabled={guardandoAlias || !hayConexion || aliasTexto.trim() === (miAlias ?? "")}
          >
            {guardandoAlias ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </Hoja>

      <Confirmar
        abierta={aQuitar !== null}
        onOpenChange={(v) => !v && setAQuitar(null)}
        titulo={aQuitar ? `Sacar a ${nombre(aQuitar)} del grupo` : "Sacar del grupo"}
        detalle="Deja de ver el grupo. Sus gastos y lo que debe o le deben quedan en la historia."
        etiqueta="Sacar"
        destructivo
        deshabilitado={!hayConexion}
        nota={hayConexion ? undefined : "Necesita conexión: lo hace el servidor."}
        // Si falla, Confirmar muestra el error y queda abierta.
        onConfirmar={async () => {
          if (!aQuitar) return
          const quien = nombre(aQuitar)
          await api.quitarMiembro(id, aQuitar)
          anunciar(`Se quitó a ${quien} del grupo.`)
        }}
      />
    </div>
  )
}
