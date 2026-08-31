import { Plus } from "lucide-react"
import { Link, NavLink, Outlet } from "react-router-dom"

import { DESTINOS } from "@/componentes/navegacion"
import { cn } from "@/lib/utils"

// Layout movil: contenido a pantalla completa, barra inferior de 4 destinos y
// boton flotante para el alta (DESIGN.md 2).
export function LayoutMovil() {
  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-auto pb-16">
        <Outlet />
      </main>

      <Link
        to="/nuevo"
        aria-label="Nuevo movimiento"
        className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
      >
        <Plus className="h-6 w-6" />
      </Link>

      <nav
        className="fixed inset-x-0 bottom-0 grid h-16 border-t border-border bg-card"
        style={{ gridTemplateColumns: `repeat(${DESTINOS.length}, minmax(0, 1fr))` }}
      >
        {DESTINOS.map((d) => (
          <NavLink
            key={d.to}
            to={d.to}
            end={d.end}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 text-xs",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            <d.icono className="h-5 w-5" />
            {d.etiqueta}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
