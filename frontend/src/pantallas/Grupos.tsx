import { useQuery } from "@powersync/react"
import { ChevronRight, Users } from "lucide-react"
import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { PaletaColor } from "@/componentes/PaletaColor"
import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { Input } from "@/componentes/ui/input"
import { ListaInset } from "@/componentes/ui/listaInset"
import { api } from "@/lib/api"
import { PALETA, SIN_COLOR } from "@/lib/paleta"
import { uuidv4 } from "@/lib/uuid"

// Mis grupos (0026): la lista para entrar a cada uno —cada grupo es un espacio,
// con sus propias pantallas en /grupos/<id>— y crear uno nuevo. Administrar un
// grupo (nombre, color, miembros, categorias) esta en sus Ajustes.
//
// Crear necesita servidor (lo hace la API); lo demas se lee del SQLite local.

interface Grupo {
  id: string
  name: string
  color: string | null
  miembros: number
}

export function Grupos() {
  const [params] = useSearchParams()
  const { data: grupos } = useQuery<Grupo>(
    `SELECT g.id, g.name, g.color,
            (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.deleted_at IS NULL) AS miembros
     FROM groups g WHERE g.deleted_at IS NULL ORDER BY g.name`,
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
      {/* Sin "Volver": Grupos es un destino de la barra, como Movimientos. */}
      <header className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Grupos</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        Un grupo comparte gastos entre varias personas. Lo que marques como compartido lo ven todos
        los miembros; tus cuentas y medios de pago siguen siendo privados.
      </p>

      {grupos.length === 0 ? (
        <Vacio icono={Users} titulo="Sin grupos" detalle="Creá uno para compartir gastos." />
      ) : (
        <ListaInset>
          {grupos.map((g) => (
            <Link
              key={g.id}
              to={`/grupos/${g.id}`}
              className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: g.color || SIN_COLOR }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{g.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {g.miembros} {g.miembros === 1 ? "miembro" : "miembros"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </ListaInset>
      )}

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Nuevo grupo</h2>
        <div className="flex gap-2">
          <Input
            aria-label="Nombre del grupo nuevo"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre del grupo (ej: Casa)"
            // Desde "Nuevo grupo" del selector de espacio, el campo ya esta listo.
            autoFocus={params.get("nuevo") === "1"}
          />
          <Button onClick={crear} disabled={creando || !nuevoNombre.trim()}>
            Crear
          </Button>
        </div>
        <PaletaColor valor={nuevoColor} onCambio={setNuevoColor} />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>
    </div>
  )
}
