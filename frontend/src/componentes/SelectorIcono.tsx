import { useMemo, useState } from "react"

import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { GRUPOS_ICONOS, filtrarIconos, iconoDe } from "@/lib/iconos"
import { cn } from "@/lib/utils"

// Elegir el icono de una categoria. Abre una hoja con el catalogo agrupado por
// tema y un buscador por sinonimos en español (ver lib/iconos).
//
// El boton muestra el icono actual, no un texto: es lo que se va a ver despues
// en la lista y en cada movimiento.
export function SelectorIcono({
  valor,
  onCambio,
  variante = "campo",
}: {
  valor: string | null
  onCambio: (clave: string | null) => void
  // "campo": al lado del nombre en el formulario. "fila": el icono de la lista
  // **es** el boton, que es la unica forma de cambiarle el icono a una categoria
  // que ya existe sin inventarle una pantalla de edicion.
  variante?: "campo" | "fila"
}) {
  const [abierta, setAbierta] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  // `iconoDe` no crea un componente: lo busca en un Map estatico de lib/iconos,
  // asi que devuelve la misma referencia entre renders y no hay remontaje. Lo
  // que la regla evita es declarar un componente nuevo en cada render, que no es
  // este caso; de ahi el disable en el JSX de abajo.
  const Actual = iconoDe(valor)

  const resultados = useMemo(() => (busqueda ? filtrarIconos(busqueda) : null), [busqueda])

  function elegir(clave: string) {
    // Tocar el que ya estaba lo saca: no hace falta un boton de "ninguno".
    onCambio(clave === valor ? null : clave)
    setAbierta(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setBusqueda("")
          setAbierta(true)
        }}
        aria-label="Elegir ícono"
        className={cn(
          "flex shrink-0 items-center justify-center transition-colors",
          variante === "campo"
            ? "h-11 w-11 rounded-xl border border-border bg-card text-foreground hover:bg-muted"
            : "-m-1 h-7 w-7 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {/* eslint-disable-next-line react-hooks/static-components */}
        <Actual className={variante === "campo" ? "h-5 w-5" : "h-4 w-4"} />
      </button>

      <Hoja abierta={abierta} onOpenChange={setAbierta} titulo="Ícono">
        <div className="space-y-3">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar: comida, nafta, alquiler…"
            aria-label="Buscar ícono"
          />
          {/* Alto fijo: la hoja no puede crecer con el catalogo. */}
          <div className="max-h-80 space-y-4 overflow-y-auto">
            {resultados ? (
              resultados.length > 0 ? (
                <Grilla iconos={resultados} valor={valor} onElegir={elegir} />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Ninguno coincide.</p>
              )
            ) : (
              GRUPOS_ICONOS.map((g) => (
                <section key={g.grupo} className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">{g.grupo}</h3>
                  <Grilla iconos={g.iconos} valor={valor} onElegir={elegir} />
                </section>
              ))
            )}
          </div>
        </div>
      </Hoja>
    </>
  )
}

function Grilla({
  iconos,
  valor,
  onElegir,
}: {
  iconos: { clave: string; Icono: React.ComponentType<{ className?: string }> }[]
  valor: string | null
  onElegir: (clave: string) => void
}) {
  return (
    <ul className="grid grid-cols-6 gap-2">
      {iconos.map(({ clave, Icono }) => {
        const elegido = clave === valor
        return (
          <li key={clave}>
            <button
              type="button"
              onClick={() => onElegir(clave)}
              // El nombre accesible es la clave: es lo unico que distingue un
              // icono de otro para quien no lo ve.
              aria-label={clave}
              aria-pressed={elegido}
              className={cn(
                "flex aspect-square w-full items-center justify-center rounded-xl border transition-colors",
                elegido
                  ? "border-primary bg-accent text-primary"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              <Icono className="h-5 w-5" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
