import { useQuery } from "@powersync/react"

import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { EX_MIEMBRO } from "@/lib/grupo"
import { usuarioActualId } from "@/lib/sesion"
import { CalendarioPagos } from "@/pantallas/CalendarioPagos"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

// El calendario de pagos de un grupo (1.6.0, ver 0030, G1): `/grupos/<grupo>/calendario`.
// Los recordatorios del grupo avisan a todos los miembros, y cualquiera los
// responde: la pantalla dice quien.
export function CalendarioGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()
  // Tambien los que se fueron: lo que respondieron queda en la historia.
  const { data: miembros } = useQuery<{
    user_id: string
    display_name: string | null
    username: string | null
  }>(
    `SELECT gm.user_id, u.display_name, u.username FROM group_members gm
     LEFT JOIN member_profiles u ON u.id = gm.user_id WHERE gm.group_id = ?`,
    [id],
  )
  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  const yo = usuarioActualId()
  // Sin perfil a mano (se fue y la sync ya no lo trae), "Ex miembro": antes
  // decia "Otro".
  const nombre = (uid: string) => {
    if (uid === yo) return "Vos"
    const m = miembros.find((x) => x.user_id === uid)
    return m?.display_name || m?.username || EX_MIEMBRO
  }
  return (
    <CalendarioPagos
      grupo={{ id, nombre: grupo.name, color: grupo.color }}
      nombreMiembro={nombre}
    />
  )
}
