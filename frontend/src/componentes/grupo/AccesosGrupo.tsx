import { PanelAccesos } from "@/componentes/PanelAccesos"
import { useAccionesGrupo } from "@/componentes/grupo/useAccionesGrupo"

// Accesos del Inicio de un grupo: el mismo panel que el personal (1.13.0), con
// el catalogo del grupo y sus acciones (saldar, poner y sacar plata).
export function AccesosGrupo({ groupId, className }: { groupId: string; className?: string }) {
  const acciones = useAccionesGrupo(groupId)
  return (
    <>
      <PanelAccesos
        espacio={{ tipo: "grupo", id: groupId }}
        usar={acciones.usar}
        className={className}
      />
      {acciones.hojas}
    </>
  )
}
