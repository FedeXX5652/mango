import { useStatus } from "@powersync/react"
import { useEffect, useState } from "react"

// ¿Hay conexion con el servidor?
//
// Se combinan dos señales porque ninguna sola alcanza, y esto esta medido:
// cortando la red, `navigator.onLine` pasa a false en **2 segundos**, mientras
// que `status.connected` de PowerSync seguia diciendo que si **a los 45**. El
// socket no se entera de que el otro lado no esta hasta que intenta hablarle.
//
//   navigator.onLine === false  -> seguro que no hay: el dispositivo no tiene red
//   status.connected === false  -> la sync se dio cuenta (mas lento, pero
//                                  tambien cubre "hay red pero el server no esta")
//
// Ninguna de las dos garantiza lo contrario: `true` significa "probablemente
// si", nunca "seguro". Quien la use para habilitar un boton tiene que manejar
// igual el fallo del pedido.
export function useConexion(): boolean {
  const status = useStatus()
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const arriba = () => setOnline(true)
    const abajo = () => setOnline(false)
    window.addEventListener("online", arriba)
    window.addEventListener("offline", abajo)
    return () => {
      window.removeEventListener("online", arriba)
      window.removeEventListener("offline", abajo)
    }
  }, [])

  return online && status.connected
}
