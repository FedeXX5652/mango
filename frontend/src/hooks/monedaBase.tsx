import { createContext, useContext, useEffect, useState } from "react"

import { api } from "@/lib/api"
import { configurarMonedaBase } from "@/lib/dinero"

// Moneda base del usuario (`users.base_currency`). El servidor es la fuente de
// verdad, pero la app tiene que arrancar sin conexion: se guarda en
// localStorage y se reconcilia cuando hay red, igual que el tema.
//
// Ademas de exponerla por contexto, la escribe en el modulo de formateo: las
// funciones de `lib/dinero` se llaman desde JSX en decenas de lugares y no
// pueden depender de un hook.

const LS_MONEDA = "mango.monedaBase"

const Ctx = createContext<string>("ARS")
// Setter aparte para no cambiarle la forma al contexto que ya consumen siete
// pantallas. Solo lo usa la pantalla que cambia la moneda base.
const CtxSet = createContext<(moneda: string) => void>(() => {})

function guardada(): string {
  return localStorage.getItem(LS_MONEDA) ?? "ARS"
}

export function ProveedorMonedaBase({ children }: { children: React.ReactNode }) {
  const [moneda, setMoneda] = useState<string>(() => {
    const inicial = guardada()
    configurarMonedaBase(inicial)
    return inicial
  })

  // Se vuelve a configurar en cada render por si otro modulo la movio: es una
  // asignacion, no tiene costo.
  configurarMonedaBase(moneda)

  useEffect(() => {
    let vigente = true
    api
      .getMe()
      .then((u) => {
        if (!vigente || !u.base_currency) return
        const cur = u.base_currency.toUpperCase()
        localStorage.setItem(LS_MONEDA, cur)
        // El setState re-renderiza el arbol, que es lo que hace que los montos
        // ya dibujados se rearmen con la moneda nueva.
        setMoneda(cur)
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [])

  // Aplica una moneda base nueva en el dispositivo. El servidor sigue siendo la
  // fuente de verdad: esto corre DESPUES de que el PATCH salio bien, no antes.
  function aplicar(nueva: string) {
    const cur = nueva.trim().toUpperCase()
    localStorage.setItem(LS_MONEDA, cur)
    setMoneda(cur)
  }

  return (
    <Ctx.Provider value={moneda}>
      <CtxSet.Provider value={aplicar}>{children}</CtxSet.Provider>
    </Ctx.Provider>
  )
}

export function useMonedaBase(): string {
  return useContext(Ctx)
}

export function useCambiarMonedaBase(): (moneda: string) => void {
  return useContext(CtxSet)
}
