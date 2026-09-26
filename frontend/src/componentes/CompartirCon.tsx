import { useQuery } from "@powersync/react"
import { useMemo } from "react"

import { Campo } from "@/componentes/ui/campo"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"

// Elegir si un movimiento es privado o se comparte con un grupo (fase 3b.2).
//
// `valor` es el group_id o "" (privado). Si no pertenecés a ningún grupo, no se
// dibuja nada: no hay con quién compartir.
//
// Lo que se comparte es el movimiento con su categoría y tags; la cuenta y el
// medio de pago quedan privados, siempre (eso lo garantiza el stream de sync, no
// esta pantalla).
export function CompartirCon({
  valor,
  onCambio,
}: {
  valor: string
  onCambio: (groupId: string) => void
}) {
  const { data: grupos } = useQuery<{ id: string; name: string }>(
    "SELECT id, name FROM groups WHERE deleted_at IS NULL ORDER BY name",
  )
  const opciones = useMemo(() => grupos.map((g) => ({ id: g.id, nombre: g.name })), [grupos])

  if (grupos.length === 0) return null

  return (
    <Campo etiqueta="Compartir">
      <SelectorEntidad
        titulo="Compartir con"
        placeholder="Privado (solo vos)"
        vacio="Privado (solo vos)"
        opciones={opciones}
        valor={valor}
        onCambio={onCambio}
      />
    </Campo>
  )
}
