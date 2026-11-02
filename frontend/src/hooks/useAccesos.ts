import { useQuery } from "@powersync/react"
import { useMemo } from "react"

import {
  catalogoDe,
  conAccesosDeGrupo,
  deFabricaDe,
  mapaJson,
  normalizarAccesos,
} from "@/componentes/accesos"
import type { Espacio } from "@/lib/espacios"
import { guardarPreferencias, listaJson } from "@/lib/preferencias"
import { usuarioActualId } from "@/lib/sesion"

// Los accesos del panel de Inicio de un espacio (0024; los de un grupo desde la
// 1.13.0), leidos de mi fila de `users` y reactivos: si los edito en otro
// dispositivo, cambian aca solos. Son de cada persona, tambien en un grupo.
//
// Mientras la fila no bajo (primer arranque) son los de fabrica.
export function useAccesos(espacio: Espacio): {
  ids: string[]
  guardar: (ids: string[] | null) => Promise<void>
  // Mientras no bajo la fila, los de fabrica: para no mostrarlos y cambiarlos.
  cargando: boolean
} {
  const mi = usuarioActualId() ?? ""
  const { data, isLoading } = useQuery<{
    home_shortcuts: string | null
    group_shortcuts: string | null
  }>("SELECT home_shortcuts, group_shortcuts FROM users WHERE id = ?", [mi])
  const personales = data[0]?.home_shortcuts ?? null
  const deGrupos = data[0]?.group_shortcuts ?? null
  const grupo = espacio.tipo === "grupo" ? espacio.id : null
  const ids = useMemo(() => {
    const guardado = grupo ? (mapaJson(deGrupos)[grupo] ?? null) : listaJson(personales)
    return normalizarAccesos(guardado, catalogoDe(espacio), deFabricaDe(espacio))
    // `espacio` cambia de identidad en cada render; lo que importa es `grupo`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo, personales, deGrupos])
  return {
    ids,
    // null vuelve a los de fabrica. Escribe local; la sync lo sube.
    guardar: (nuevos) =>
      grupo
        ? guardarPreferencias({
            group_shortcuts: conAccesosDeGrupo(mapaJson(deGrupos), grupo, nuevos),
          })
        : guardarPreferencias({ home_shortcuts: nuevos }),
    cargando: isLoading,
  }
}
