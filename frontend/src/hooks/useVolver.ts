import { useLocation, useNavigate } from "react-router-dom"

// Volver a donde se vino. Una pantalla se abre desde varios lugares (Ajustes, el
// panel de Accesos, un atajo del icono), y un destino fijo mandaba a Ajustes
// aunque se hubiera entrado desde Inicio. Sin historial propio —la pantalla se
// abrio directo, desde un atajo o un enlace—, `navigate(-1)` no hace nada y se
// va al `respaldo`.
export function useVolver(respaldo: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (location.key === "default") navigate(respaldo, { replace: true })
    else navigate(-1)
  }
}
