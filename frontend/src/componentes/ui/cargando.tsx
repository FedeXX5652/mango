import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

// Estados de carga (decision 0008).
//
// El problema que resuelven: cada pantalla corre varias consultas y cada una
// resuelve por separado. Mientras no resolvieron, `data` es `[]`, y si eso se
// dibuja como "no hay datos" la pantalla **afirma algo falso** ("Sin gastos
// este mes", "$ 0,00") y despues salta cuando llegan los datos.
//
// La regla es: mientras `isLoading`, no se afirma nada.

// Son TRES estados, no dos:
//
//   1. cargando y antes del umbral -> **nada**, ni contenido ni esqueleto
//   2. cargando y paso el umbral   -> esqueleto
//   3. con datos                   -> contenido
//
// El estado 1 existe porque las consultas van al SQLite local y suelen volver
// en decenas de milisegundos: un esqueleto que aparece 40 ms y se va molesta
// mas que la espera. Pero durante esos 40 ms **tampoco** se dibuja el
// contenido, o se ve el estado vacio falso que justamente queremos evitar.
const UMBRAL_MS = 120

export function useDemora(activo: boolean, ms: number = UMBRAL_MS): boolean {
  const [paso, setPaso] = useState(false)
  useEffect(() => {
    if (!activo) {
      setPaso(false)
      return
    }
    const t = setTimeout(() => setPaso(true), ms)
    return () => clearTimeout(t)
  }, [activo, ms])
  return activo && paso
}

// Tres puntos que laten, para la espera **indeterminada** (no sabemos cuanto
// falta, y no hay progreso que mostrar: inventar un porcentaje seria mentir).
// Usa `currentColor`, asi toma el color del contexto y por lo tanto el token
// del tema activo sin configurar nada.
export function Puntos({ className, etiqueta = "Cargando" }: { className?: string; etiqueta?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-current opacity-35 motion-safe:animate-latido"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
      <span className="sr-only">{etiqueta}</span>
    </span>
  )
}

// Bloque gris con el tamano de lo que va a aparecer. Es mejor que un spinner
// donde la forma se conoce: reserva el lugar, asi el contenido no empuja nada
// al llegar. Va `aria-hidden`: quien anuncia la espera es el `role="status"`
// del contenedor.
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
    />
  )
}

// Contenedor de una pantalla que todavia no tiene datos: anuncia la espera una
// sola vez y dibuja los esqueletos que le pasen.
export function Cargando({
  children,
  visible = true,
  className,
  etiqueta = "Cargando",
}: {
  children?: React.ReactNode
  // `false` mientras no paso el umbral: la espera se anuncia igual para el
  // lector de pantalla, pero no se dibuja nada.
  visible?: boolean
  className?: string
  etiqueta?: string
}) {
  return (
    <div role="status" aria-busy className={cn("motion-safe:animate-fundir", className)}>
      <span className="sr-only">{etiqueta}</span>
      {!visible
        ? null
        : (children ?? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Puntos etiqueta={etiqueta} />
            </div>
          ))}
    </div>
  )
}
