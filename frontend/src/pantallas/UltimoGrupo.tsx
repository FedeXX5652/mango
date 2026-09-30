import { useQuery } from "@powersync/react"
import { Navigate } from "react-router-dom"

import { LS_ULTIMO_GRUPO, destinoUltimoGrupo } from "@/lib/atajos"

// `/grupos/ultimo`, el atajo "Último grupo" del icono (0023). El manifiesto no
// puede listar los grupos de cada persona, asi que la URL es fija y el destino
// se resuelve aca, en el dispositivo (ver `destinoUltimoGrupo`).
//
// Espera la consulta: con la lista todavia vacia, mandaria siempre a la lista
// de grupos aunque el ultimo siguiera existiendo.
export function UltimoGrupo() {
  const { data: grupos, isLoading } = useQuery<{ id: string }>(
    "SELECT id FROM groups WHERE deleted_at IS NULL ORDER BY name",
  )
  if (isLoading) return null

  let guardado: string | null = null
  try {
    guardado = localStorage.getItem(LS_ULTIMO_GRUPO)
  } catch {
    // Sin storage (modo privado): cae al unico grupo o a la lista.
  }
  return (
    <Navigate
      to={destinoUltimoGrupo(
        guardado,
        grupos.map((g) => g.id),
      )}
      replace
    />
  )
}
