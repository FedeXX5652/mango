import { CabeceraPestana } from "@/componentes/SelectorEspacio"
import { ReporteGrupo } from "@/componentes/grupo/ReporteGrupo"
import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

// Estadisticas de un grupo (0026): cuanto gasto, en que y quien puso.
export function EstadisticasGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()
  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <CabeceraPestana titulo="Estadísticas" />
      <ReporteGrupo groupId={id} />
    </div>
  )
}
