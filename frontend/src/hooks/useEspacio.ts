import { useQuery } from "@powersync/react"
import { useMemo } from "react"
import { useLocation } from "react-router-dom"

import { type Espacio, espacioDeRuta } from "@/lib/espacios"

export interface GrupoInfo {
  id: string
  name: string
  color: string | null
  base_currency: string
}

// El espacio actual (0026), leido de la URL. Sirve en cualquier lugar —tambien
// en los layouts, que no ven los parametros de sus rutas hijas— porque mira la
// direccion y no los params.
export function useEspacio(): { espacio: Espacio; grupo: GrupoInfo | null; cargando: boolean } {
  const { pathname } = useLocation()
  const espacio = useMemo(() => espacioDeRuta(pathname), [pathname])
  const id = espacio.tipo === "grupo" ? espacio.id : ""
  const { data, isLoading } = useQuery<GrupoInfo>(
    "SELECT id, name, color, base_currency FROM groups WHERE id = ? AND deleted_at IS NULL",
    [id],
  )
  return { espacio, grupo: data[0] ?? null, cargando: Boolean(id) && isLoading }
}

// Para las pantallas de un grupo: el id de la URL (vacio fuera de un grupo).
export function useGrupoDeRuta(): { id: string; grupo: GrupoInfo | null; cargando: boolean } {
  const { espacio, grupo, cargando } = useEspacio()
  return { id: espacio.tipo === "grupo" ? espacio.id : "", grupo, cargando }
}
