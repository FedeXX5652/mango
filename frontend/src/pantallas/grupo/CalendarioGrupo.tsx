import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { CalendarioPagos } from "@/pantallas/CalendarioPagos"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

// El calendario de pagos de un grupo (1.6.0, ver 0030, G1): `/grupos/<grupo>/calendario`.
// Los recordatorios del grupo avisan a todos los miembros, y cualquiera los
// responde: la pantalla dice quien.
export function CalendarioGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()
  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  return <CalendarioPagos grupo={{ id, nombre: grupo.name, color: grupo.color }} />
}
