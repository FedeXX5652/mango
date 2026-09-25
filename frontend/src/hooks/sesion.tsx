import { createContext, useContext, useEffect, useState } from "react"

import { alCambiarSesion, borrarToken, guardarToken, tokenActual } from "@/lib/sesion"

// Estado de la sesión de servidor (fase 3a). Gatea la app: sin token, el árbol
// ni se monta —no hay PowerSync ni datos— y se muestra el login.
//
// Es distinto del PIN (hooks/bloqueo): el PIN es lock de dispositivo para el día
// a día; esto es "quién sos" para el servidor. Orden: primero sesión, después
// PIN, después PowerSync (ver App).

interface SesionCtx {
  hayToken: boolean
  entrar: (token: string) => void
  salir: () => void
}

const Ctx = createContext<SesionCtx>({ hayToken: false, entrar: () => {}, salir: () => {} })

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const [hayToken, setHayToken] = useState(() => tokenActual() !== null)

  // Reacciona a cambios del token vengan de donde vengan: del login, o de `api`
  // borrándolo al recibir un 401 en cualquier request.
  useEffect(() => alCambiarSesion((t) => setHayToken(t !== null)), [])

  const valor: SesionCtx = {
    hayToken,
    entrar: (token) => guardarToken(token),
    salir: () => borrarToken(),
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useSesion(): SesionCtx {
  return useContext(Ctx)
}
