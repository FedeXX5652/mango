import { useQuery } from "@powersync/react"
import { Coins } from "lucide-react"
import { useMemo, useState } from "react"

import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { useConexion } from "@/hooks/conexion"
import { useCambiarMonedaBase, useMonedaBase } from "@/hooks/monedaBase"
import { api } from "@/lib/api"
import { type MonedaListada, filtrarMonedas, listarMonedas } from "@/lib/monedas"

// Cambiar la moneda base: la de LECTURA. Es lo que hace falta al mudarse de
// pais — las cuentas y los movimientos quedan tal cual, con su moneda, y lo que
// cambia es en que moneda se leen los totales.
//
// No confundir con la moneda de una CUENTA, que no se puede cambiar a
// proposito: los movimientos de una cuenta en pesos estan en pesos, y darla
// vuelta a euros no convierte nada, reinterpreta el historial. Mudarse es
// abrir una cuenta nueva en la moneda nueva, como en la vida real.
//
// **Necesita conexion**, y es una de las pocas cosas que no: `users` no se
// sincroniza, asi que la preferencia la guarda el servidor (ver ESPECIFICACION
// 3.11). Por eso el boton de confirmar se apaga sin conexion en vez de fallar
// despues de que la persona ya dijo que si.
export function CambiarMonedaBase() {
  const base = useMonedaBase()
  const aplicar = useCambiarMonedaBase()
  const hayConexion = useConexion()

  const [abierta, setAbierta] = useState(false)
  const [elegida, setElegida] = useState<MonedaListada | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [error, setError] = useState("")

  // Las monedas que ya usas van arriba de la lista.
  const { data: cuentas } = useQuery<{ currency: string }>(
    "SELECT DISTINCT currency FROM accounts WHERE deleted_at IS NULL",
  )
  const enUso = useMemo(() => cuentas.map((c) => c.currency), [cuentas])
  const todas = useMemo(() => listarMonedas(enUso), [enUso])
  const visibles = useMemo(() => filtrarMonedas(todas, busqueda), [todas, busqueda])

  const actual = todas.find((m) => m.codigo === base)

  // La señal combinada de hooks/conexion: `status.connected` solo tardaba
  // demasiado en enterarse. Aun asi el boton habilitado es una prediccion, no
  // una garantia (puede haber red y estar caido el server), asi que el fallo
  // del PATCH se informa igual.
  const sinConexion = !hayConexion

  async function confirmar() {
    if (!elegida) return
    setError("")
    try {
      await api.updateMe({ base_currency: elegida.codigo })
      aplicar(elegida.codigo)
      // Las cotizaciones ahora se piden contra la base nueva. No se espera:
      // llegan por la sync y la pantalla ya sabe componer las que hay.
      api.refrescarCotizaciones().catch(() => {})
      setElegida(null)
      setAbierta(false)
    } catch {
      setError("No se pudo cambiar. Probá de nuevo cuando haya conexión.")
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setBusqueda("")
          setAbierta(true)
        }}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
          <Coins className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            Moneda base: {base}
            {actual && actual.nombre !== base && (
              <span className="font-normal text-muted-foreground"> · {actual.nombre}</span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">
            En qué moneda se leen los totales. La guarda el servidor.
          </span>
        </span>
      </button>

      <Hoja abierta={abierta} onOpenChange={setAbierta} titulo="Moneda base">
        <div className="space-y-3">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código o nombre"
            aria-label="Buscar moneda"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {/* Alto fijo: la lista ISO tiene 150 monedas y sin tope la hoja se
              come la pantalla. */}
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {visibles.map((m) => (
              <li key={m.codigo}>
                <button
                  type="button"
                  onClick={() => setElegida(m)}
                  disabled={m.codigo === base}
                  className="flex w-full items-baseline gap-3 p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <span className="tabular w-12 shrink-0 text-sm font-medium">{m.codigo}</span>
                  <span className="min-w-0 truncate text-sm text-muted-foreground">
                    {m.nombre}
                    {m.codigo === base && " · actual"}
                  </span>
                </button>
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="p-3 text-sm text-muted-foreground">Ninguna coincide.</li>
            )}
          </ul>
        </div>
      </Hoja>

      <Confirmar
        abierta={elegida !== null}
        onOpenChange={(v) => !v && setElegida(null)}
        titulo={`Leer todo en ${elegida?.codigo ?? ""}`}
        etiqueta={`Cambiar a ${elegida?.codigo ?? ""}`}
        deshabilitado={sinConexion}
        nota={
          sinConexion
            ? "Sin conexión no se puede: esta preferencia la guarda el servidor."
            : undefined
        }
        onConfirmar={confirmar}
      >
        <ul className="mb-4 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground">
              Tus cuentas y movimientos no cambian.
            </strong>{" "}
            Cada uno sigue en su moneda.
          </li>
          <li>
            Cambia en qué moneda se leen el patrimonio, el resumen y las estadísticas en Global.
          </li>
          <li>
            Los presupuestos siguen siendo por moneda: los sobres en {base} siguen en {base}.
          </li>
          <li>Las cotizaciones pasan a traerse contra {elegida?.codigo}.</li>
        </ul>
      </Confirmar>
    </>
  )
}
