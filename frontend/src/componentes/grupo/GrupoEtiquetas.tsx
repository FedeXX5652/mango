import { GestorEtiquetas } from "@/componentes/GestorEtiquetas"

// Etiquetas DEL GRUPO (1.7.0): las usa y las administra cualquier miembro. Un
// gasto del grupo lleva etiquetas del grupo.
export function GrupoEtiquetas({ groupId }: { groupId: string }) {
  return (
    <section>
      <GestorEtiquetas grupo={groupId} titulo="Etiquetas del grupo" />
    </section>
  )
}
