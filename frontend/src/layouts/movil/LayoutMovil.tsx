import { Plus } from "lucide-react"
import { Link, NavLink, Outlet } from "react-router-dom"

import { DESTINOS_MOVIL } from "@/componentes/navegacion"
import { cn } from "@/lib/utils"

// Layout movil: contenido a pantalla completa y barra inferior con dos destinos,
// el boton "+" (nuevo movimiento) elevado al centro y otros dos (DESIGN.md 2,
// 0022). Ajustes vive en el header de Inicio.
//
// Cinco columnas iguales: el "+" cae en la del medio, que es el centro exacto
// de la pantalla. La grilla es fija a proposito; si DESTINOS_MOVIL dejara de
// tener cuatro, lo frena el test de navegacion antes de que se vea torcido.
const IZQ = DESTINOS_MOVIL.slice(0, 2)
const DER = DESTINOS_MOVIL.slice(2)

function Tab({ to, etiqueta, icono: Icono, end }: (typeof DESTINOS_MOVIL)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-xs tracking-tight",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          isActive ? "font-semibold text-foreground" : "text-muted-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* El activo se marca con la pastilla de marca detras del icono y el
              peso de la etiqueta, no solo con color (DESIGN.md 9). El amarillo
              va de FONDO: como texto sobre blanco no llega al contraste minimo. */}
          <span
            className={cn(
              "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
              isActive && "bg-primary text-primary-foreground",
            )}
          >
            <Icono className="h-5 w-5" aria-hidden />
          </span>
          <span className="max-w-full truncate">{etiqueta}</span>
        </>
      )}
    </NavLink>
  )
}

export function LayoutMovil() {
  return (
    <div className="flex h-full flex-col">
      {/* `pb-barra`: el alto de la barra mas el borde seguro del telefono; el
          final de cada pantalla nunca queda tapado. */}
      <main className="flex-1 overflow-auto pb-barra">
        <Outlet />
      </main>

      {/* z-40: por encima de todo lo que scrollea debajo. Sin z-index, cualquier
          control con z propio (la pildora de `Segmentado`, z-10) se dibujaba
          encima de la barra. Las hojas modales van mas arriba (z-50). */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card pb-seguro"
      >
        {IZQ.map((d) => (
          <Tab key={d.to} {...d} />
        ))}
        <div className="flex h-16 items-center justify-center">
          <Link
            to="/nuevo"
            aria-label="Nuevo movimiento"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform duration-100 ease-salida focus-visible:outline-none focus-visible:ring-ring motion-safe:active:scale-95"
          >
            <Plus className="h-6 w-6" aria-hidden />
          </Link>
        </div>
        {DER.map((d) => (
          <Tab key={d.to} {...d} />
        ))}
      </nav>
    </div>
  )
}
