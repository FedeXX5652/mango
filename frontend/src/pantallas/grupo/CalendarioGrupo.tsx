import { useQuery } from "@powersync/react"

import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { usuarioActualId } from "@/lib/sesion"
import { CalendarioPagos } from "@/pantallas/CalendarioPagos"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

// El calendario de pagos de un grupo (1.6.0, ver 0030, G1): `/grupos/<grupo>/calendario`.
// Los recordatorios del grupo avisan a todos los miembros, y cualquiera los
// responde: la pantalla dice quien.
export function CalendarioGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()
  // Tambien los que se fueron: lo que respondieron queda en la historia.
  const { data: miembros } = useQuery<{ user_id: string; display_name: string | null }>(
    `SELECT gm.user_id, u.display_name FROM group_members gm
     LEFT JOIN member_profiles u ON u.id = gm.user_id WHERE gm.group_id = ?`,
    [id],
  )
  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  const yo = usuarioActualId()
  const nombre = (uid: string) =>
    uid === yo ? "Vos" : (miembros.find((m) => m.user_id === uid)?.display_name ?? "Otro")
  return (
    <CalendarioPagos
      grupo={{ id, nombre: grupo.name, color: grupo.color }}
      nombreMiembro={nombre}
    />
  )
}
