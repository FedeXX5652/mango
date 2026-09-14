import { createContext, useContext, useEffect, useState } from "react"

import { observarPreferencias } from "@/lib/preferencias"
import { configurarMonedaBase } from "@/lib/dinero"

// Moneda base del usuario (`users.base_currency`). Vive en la base local y
// viaja por la sync; localStorage queda como copia para el primer pintado,
// antes de que la base este lista.
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

  useEffect(
    () =>
      observarPreferencias((p) => {
        if (!p.base_currency) return
        const cur = p.base_currency.toUpperCase()
        localStorage.setItem(LS_MONEDA, cur)
        // El setState re-renderiza el arbol, que es lo que hace que los montos
        // ya dibujados se rearmen con la moneda nueva.
        setMoneda(cur)
      }),
    [],
  )

  // Aplica una moneda base nueva en el dispositivo. Quien la cambia escribe la
  // fila; esto solo refleja el cambio sin esperar a que vuelva por la sync.
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
