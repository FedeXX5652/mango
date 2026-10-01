import { EncabezadoEspacio } from "@/componentes/SelectorEspacio"
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
      <EncabezadoEspacio />
      <h1 className="text-2xl font-semibold">Estadísticas</h1>
      <ReporteGrupo groupId={id} />
    </div>
  )
}
