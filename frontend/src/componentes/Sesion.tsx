import { useState } from "react"

import { useSesion } from "@/hooks/sesion"
import { CambioForzado, Login } from "@/pantallas/Login"

// Compuerta de sesión: decide qué se muestra según el estado de auth.
//
//   sin token            -> Login
//   token + must_change  -> CambioForzado (clave temporal del admin)
//   token, todo en orden -> la app (children)
//
// Va por FUERA de PowerSync (ver App): sin sesión no tiene sentido conectar la
// sync ni montar la base. Cuando `useSesion` deja de tener token —logout o un
// 401 en cualquier request— este componente vuelve a Login solo.
export function Sesion({ children }: { children: React.ReactNode }) {
  const { hayToken } = useSesion()
  // El login de una cuenta con clave temporal deja el token puesto pero exige
  // cambiarla antes de entrar. Se recuerda entre el login y el cambio.
  const [debeCambiar, setDebeCambiar] = useState(false)

  if (!hayToken) {
    return <Login onEntrar={setDebeCambiar} />
  }
  if (debeCambiar) {
    return <CambioForzado onListo={() => setDebeCambiar(false)} />
  }
  return <>{children}</>
}
