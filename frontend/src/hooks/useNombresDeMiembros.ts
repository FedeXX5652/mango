import { useQuery } from "@powersync/react"
import { useCallback } from "react"

import { EX_MIEMBRO, NOMBRE_EN_GRUPO } from "@/lib/grupo"
import { usuarioActualId } from "@/lib/sesion"

// Como se llama un miembro en un grupo (su alias ahi, 0035): para decir quien
// respondio un vencimiento. De todos mis grupos a la vez, porque el calendario
// personal muestra tambien los del grupo (1.13.0).
export type NombreMiembro = (userId: string, groupId: string) => string

export function useNombresDeMiembros(): NombreMiembro {
  // Tambien los que se fueron: lo que respondieron queda en la historia.
  const { data: miembros } = useQuery<{
    group_id: string
    user_id: string
    display_name: string | null
    username: string | null
  }>(
    `SELECT gm.group_id, gm.user_id, ${NOMBRE_EN_GRUPO} AS display_name, u.username
     FROM group_members gm LEFT JOIN member_profiles u ON u.id = gm.user_id`,
  )
  const yo = usuarioActualId()
  // Sin perfil a mano (se fue y la sync ya no lo trae), "Ex miembro".
  return useCallback(
    (uid: string, gid: string) => {
      if (uid === yo) return "Vos"
      const m = miembros.find((x) => x.user_id === uid && x.group_id === gid)
      return m?.display_name || m?.username || EX_MIEMBRO
    },
    [miembros, yo],
  )
}
