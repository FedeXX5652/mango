import { Plus, Settings2 } from "lucide-react"
import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"

import { HERRAMIENTAS_ESCRITORIO, acceso } from "@/componentes/accesos"
import { DESTINOS, type Destino as DestinoNav } from "@/componentes/navegacion"
import { Notificaciones } from "@/componentes/Notificaciones"
import { SelectorEspacio } from "@/componentes/SelectorEspacio"
import { useEspacio } from "@/hooks/useEspacio"
import { PERSONAL, rutaEspacio } from "@/lib/espacios"
import { botonVariants } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { FormularioMovimiento } from "@/pantallas/Alta"
import { cn } from "@/lib/utils"

// Layout escritorio: barra lateral fija con todos los destinos y accion
// principal en la barra superior (DESIGN.md 2). El alta se abre como modal
// sobre el dashboard (en movil, en cambio, es una pantalla focal).
function Destino({ to, etiqueta, icono: Icono, end, seccion }: DestinoNav) {
  // Los destinos de seccion siguen al espacio actual (0026).
  const { espacio } = useEspacio()
  return (
    <NavLink
      to={seccion !== undefined ? rutaEspacio(espacio, seccion) : to}
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
  const { espacio } = useEspacio()
  const [nuevoAbierto, setNuevoAbierto] = useState(false)

  return (
    // Alto fijo de la ventana: scrollea `main`, no el documento. Sin
    // `grid-rows-1` y `min-h-0`, la fila implicita crecia con el contenido y el
    // panel de detalle (ConPanel) se iba de la vista al bajar por la lista.
    <div className="grid h-full grid-cols-[240px_1fr] grid-rows-1">
      <aside className="flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 px-2">
          <img src="/icons/svg/mango.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold">Mango</span>
        </div>
        {/* El espacio actual, arriba de todo (0026): lo de abajo es de ese espacio. */}
        <SelectorEspacio className="mb-3 w-full justify-between" />
        {/* Landmark de navegacion: sin el <nav>, un lector de pantalla no
            encontraba los destinos como tales (auditoria de 0022). */}
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {DESTINOS.filter((d) => d.seccion !== undefined).map((d) => (
            <Destino key={d.to} {...d} />
          ))}
          {/* En un grupo, sus ajustes son una seccion mas del espacio: en el movil
              estan en el engranaje del Inicio del grupo. */}
          {espacio.tipo === "grupo" && (
            <Destino
              to={rutaEspacio(espacio, "ajustes")}
              etiqueta="Ajustes del grupo"
              icono={Settings2}
            />
          )}
          {DESTINOS.filter((d) => d.seccion === undefined && d.to !== "/ajustes").map((d) => (
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

      <div className="flex min-h-0 min-w-0 flex-col">
        {/* Sin texto de relleno a la izquierda: el titulo de cada pantalla ya es
            su h1, y el espacio esta arriba de la barra lateral. */}
        <header className="flex h-14 items-center justify-end border-b border-border px-6">
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
        {/* `relative`: los `sr-only` (absolutos) se miden contra main y no
            estiran el documento por debajo de la ventana. */}
        <main className="relative min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <Hoja abierta={nuevoAbierto} onOpenChange={setNuevoAbierto} titulo="Nuevo movimiento">
        {/* Carga en el espacio actual (0026) y lleva a Movimientos del espacio
            donde quedo. */}
        <FormularioMovimiento
          key={espacio.tipo === "grupo" ? espacio.id : ""}
          grupoInicial={espacio.tipo === "grupo" ? espacio.id : ""}
          onGuardado={(g) => {
            setNuevoAbierto(false)
            navigate(rutaEspacio(g ? { tipo: "grupo", id: g } : PERSONAL, "movimientos"))
          }}
        />
      </Hoja>
    </div>
  )
}
