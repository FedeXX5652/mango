import { useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

// Contenido que se despliega en el lugar (un acordeon). El alto se anima con
// grid-rows 0fr -> 1fr, sin medir nada, y la opacidad acompaña: 200 ms con la
// curva de salida (DESIGN.md 8). Con "reducir movimiento", cambia sin
// transicion. Cerrado queda `inert`: lo que no se ve no recibe el foco con Tab
// ni lo lee el lector de pantalla. (React 18 no conoce `inert` como prop: va
// por la ref, antes del primer pintado para que no haya un cuadro sin el.)
export function Desplegable({
  abierto,
  id,
  className,
  children,
}: {
  abierto: boolean
  // Para el `aria-controls` del boton que lo abre.
  id?: string
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    ref.current?.toggleAttribute("inert", !abierto)
  }, [abierto])
  return (
    <div
      ref={ref}
      id={id}
      className={cn(
        "grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-200 motion-safe:ease-salida",
        abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

// Sacar una fila de una lista sin que lo de abajo salte (1.9.0): primero se
// cierra (un Desplegable con `abierto={!saliendo}`, 200 ms) y recien despues se
// escribe lo que la saca de la consulta. Con "reducir movimiento", enseguida.
// Si la escritura falla, la fila vuelve.
export function useSalida(): [boolean, (accion: () => Promise<unknown>) => Promise<void>] {
  const [saliendo, setSaliendo] = useState(false)
  async function salir(accion: () => Promise<unknown>) {
    setSaliendo(true)
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      await new Promise((r) => setTimeout(r, 200))
    try {
      await accion()
    } catch (e) {
      setSaliendo(false)
      throw e
    }
  }
  return [saliendo, salir]
}
