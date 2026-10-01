import { Plus } from "lucide-react"
import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"

import { HERRAMIENTAS_ESCRITORIO, acceso } from "@/componentes/accesos"
import { DESTINOS, type Destino as DestinoNav } from "@/componentes/navegacion"
import { Notificaciones } from "@/componentes/Notificaciones"
import { botonVariants } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { FormularioMovimiento } from "@/pantallas/Alta"
import { cn } from "@/lib/utils"

// Layout escritorio: barra lateral fija con todos los destinos y accion
// principal en la barra superior (DESIGN.md 2). El alta se abre como modal
// sobre el dashboard (en movil, en cambio, es una pantalla focal).
function Destino({ to, etiqueta, icono: Icono, end }: DestinoNav) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "bg-accent font-medium text-accent-foreground"
            : "text-muted-foreground hover:bg-muted",
        )
      }
    >
      <Icono className="h-5 w-5" aria-hidden />
      {etiqueta}
    </NavLink>
  )
}

export function LayoutEscritorio() {
  const navigate = useNavigate()
  const [nuevoAbierto, setNuevoAbierto] = useState(false)

  return (
    <div className="grid h-full grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-1 border-r border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2 px-2">
          <img src="/icons/svg/mango.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold">Mango</span>
        </div>
        {/* Landmark de navegacion: sin el <nav>, un lector de pantalla no
            encontraba los destinos como tales (auditoria de 0022). */}
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {DESTINOS.filter((d) => d.to !== "/ajustes").map((d) => (
            <Destino key={d.to} {...d} />
          ))}
          {/* Herramientas (0024): lo que salio de Ajustes. En el movil estan en
              los accesos de Inicio; aca, a la vista como el resto. */}
          <p className="mt-4 px-3 pb-1 text-xs font-semibold text-muted-foreground">Herramientas</p>
          {HERRAMIENTAS_ESCRITORIO.map((id) => acceso(id))
            .filter((a) => a !== undefined)
            .map((a) => (
              <Destino key={a.id} to={a.to} etiqueta={a.etiqueta} icono={a.icono} />
            ))}
          <div className="mt-4">
            {DESTINOS.filter((d) => d.to === "/ajustes").map((d) => (
              <Destino key={d.to} {...d} />
            ))}
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-6">
          <span className="text-sm text-muted-foreground">Finanzas</span>
          <div className="flex items-center gap-2">
            <Notificaciones />
            <button
              type="button"
              className={cn(botonVariants({ size: "sm" }))}
              onClick={() => setNuevoAbierto(true)}
            >
              <Plus className="h-4 w-4" />
              Nuevo movimiento
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <Hoja abierta={nuevoAbierto} onOpenChange={setNuevoAbierto} titulo="Nuevo movimiento">
        <FormularioMovimiento
          onGuardado={() => {
            setNuevoAbierto(false)
            navigate("/movimientos")
          }}
        />
      </Hoja>
    </div>
  )
}
