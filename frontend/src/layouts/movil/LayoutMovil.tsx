import { Plus } from "lucide-react"
import { Link, NavLink, Outlet } from "react-router-dom"

import { DESTINOS_MOVIL } from "@/componentes/navegacion"
import { cn } from "@/lib/utils"

// Layout movil: contenido a pantalla completa y barra inferior con dos destinos
// a cada lado y el boton "+" (nuevo movimiento) elevado al centro (DESIGN.md 2).
// Ajustes vive en el header de Inicio.
const IZQ = DESTINOS_MOVIL.slice(0, 2)
const DER = DESTINOS_MOVIL.slice(2)

function Tab({ to, etiqueta, icono: Icono, end }: (typeof DESTINOS_MOVIL)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center gap-1 text-xs",
          isActive ? "text-primary" : "text-muted-foreground",
        )
      }
    >
      <Icono className="h-5 w-5" />
      {etiqueta}
    </NavLink>
  )
}

export function LayoutMovil() {
  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 grid h-16 grid-cols-5 border-t border-border bg-card">
        {IZQ.map((d) => (
          <Tab key={d.to} {...d} />
        ))}
        <div className="flex items-center justify-center">
          <Link
            to="/nuevo"
            aria-label="Nuevo movimiento"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform duration-100 ease-salida motion-safe:active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </Link>
        </div>
        {DER.map((d) => (
          <Tab key={d.to} {...d} />
        ))}
      </nav>
    </div>
  )
}
