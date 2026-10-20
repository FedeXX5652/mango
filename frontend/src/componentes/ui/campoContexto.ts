import { createContext, useContext } from "react"

// El id de la etiqueta del `Campo` que envuelve a un control (1.7.0).
//
// Un `<label>` que envuelve a un boton le pone su texto como nombre accesible, y
// tapa el de adentro: el lector de pantalla decia "Cuenta" y nunca el valor
// elegido. Un selector que esta dentro de un `Campo` se nombra con
// `aria-labelledby` = etiqueta + valor ("Cuenta, Efectivo"), como el de la
// repeticion (0030).
export const CampoContexto = createContext<string | undefined>(undefined)

export function useEtiquetaDeCampo(): string | undefined {
  return useContext(CampoContexto)
}
