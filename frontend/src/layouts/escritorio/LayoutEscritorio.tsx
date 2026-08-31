import { Plus } from "lucide-react"
import { Link, NavLink, Outlet } from "react-router-dom"

import { DESTINOS } from "@/componentes/navegacion"
import { botonVariants } from "@/componentes/ui/button"
import { cn } from "@/lib/utils"

// Layout escritorio: barra lateral fija con todos los destinos y accion
// principal en la barra superior (DESIGN.md 2).
export function LayoutEscritorio() {
  return (
    <div className="grid h-full grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-1 border-r border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2 px-2">
          <img src="/icons/svg/mango.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold">Mango</span>
        </div>
        {DESTINOS.map((d) => (
          <NavLink
            key={d.to}
            to={d.to}
            end={d.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )
            }
          >
            <d.icono className="h-5 w-5" />
            {d.etiqueta}
          </NavLink>
        ))}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-6">
          <span className="text-sm text-muted-foreground">Finanzas</span>
          <Link to="/nuevo" className={cn(botonVariants({ size: "sm" }))}>
            <Plus className="h-4 w-4" />
            Nuevo movimiento
          </Link>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
