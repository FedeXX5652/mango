import { PresupuestoGrupo } from "@/componentes/PresupuestoGrupo"
import { EncabezadoEspacio } from "@/componentes/SelectorEspacio"
import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

// Presupuesto de un grupo (0026): los topes del mes por categoria del grupo.
export function PresupuestoDelGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()
  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <EncabezadoEspacio />
      <h1 className="text-2xl font-semibold">Presupuesto</h1>
      <PresupuestoGrupo groupId={id} />
    </div>
  )
}
