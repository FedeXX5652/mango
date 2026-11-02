import { createContext, useContext, useId, useLayoutEffect } from "react"

// Los bloques de una `PantallaLista` (componentes/ui/cargando, 1.12.0) avisan
// por aca si todavia cargan. Aparte del componente: un archivo de componentes
// que exporta hooks rompe el recargado en caliente de Vite.

export const ContextoBloques = createContext<((id: string, cargando: boolean) => void) | null>(null)

/** Un bloque de una `PantallaLista` avisa si todavia carga. Fuera de una, no
 *  hace nada: el mismo componente sirve en cualquier pantalla. */
export function useBloqueListo(cargando: boolean): void {
  const registrar = useContext(ContextoBloques)
  const id = useId()
  useLayoutEffect(() => {
    registrar?.(id, cargando)
  }, [registrar, id, cargando])
  useLayoutEffect(() => () => registrar?.(id, false), [registrar, id])
}
