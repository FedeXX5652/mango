import { useLocation, useNavigate, useOutlet } from "react-router-dom"

import { PanelContexto } from "@/hooks/usePanel"

// Lista con el detalle al costado (escritorio, DESIGN.md 2: "Panel lateral, la
// lista queda visible"). El detalle es la ruta hija (`movimientos/:id`), asi
// que la direccion sigue diciendo que esta abierto y "volver" del navegador lo
// cierra. En el movil no hay ruta hija (el detalle es una pantalla aparte) y
// esto es solo la lista.
export function ConPanel({ children, etiqueta }: { children: React.ReactNode; etiqueta: string }) {
  const panel = useOutlet()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  // Cerrar = la lista, con el mes y los filtros de la URL.
  const lista = pathname.replace(/\/[^/]+\/?$/, "")
  const cerrar = () => navigate({ pathname: lista, search })

  return (
    <div className="lg:flex lg:h-full">
      <div className="relative min-w-0 flex-1 lg:overflow-y-auto">{children}</div>
      {panel && (
        <aside
          aria-label={etiqueta}
          className="relative hidden shrink-0 overflow-y-auto border-l border-border bg-card lg:block lg:w-96"
        >
          <PanelContexto.Provider value={{ cerrar }}>{panel}</PanelContexto.Provider>
        </aside>
      )}
    </div>
  )
}
