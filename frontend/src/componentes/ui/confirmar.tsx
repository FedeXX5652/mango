import { useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"

// Confirmacion de una accion (archivar, eliminar…). Se apoya en Hoja: en movil
// es un action sheet desde abajo, en escritorio un alert dialog centrado.
// `destructivo` pinta el boton principal en rojo (borrado).
//
// Espera a `onConfirmar` (1.12.0): antes cerraba en el acto y si la accion
// fallaba (quitar un miembro sin conexion, por ejemplo) no se enteraba nadie.
// Ahora el boton dice que esta trabajando y, si falla, el error queda en la hoja.
export function Confirmar({
  abierta,
  onOpenChange,
  titulo,
  detalle,
  etiqueta = "Confirmar",
  destructivo,
  deshabilitado,
  nota,
  children,
  onConfirmar,
}: {
  abierta: boolean
  onOpenChange: (v: boolean) => void
  titulo: string
  detalle?: string
  etiqueta?: string
  destructivo?: boolean
  // Para las pocas acciones que NO se pueden hacer sin conexion (ver DESIGN 7):
  // el boton queda apagado y `nota` dice por que. Es la excepcion, no la regla:
  // todo lo que se escribe local se puede hacer siempre.
  deshabilitado?: boolean
  nota?: React.ReactNode
  // Detalle mas largo que una frase: una lista de consecuencias, por ejemplo.
  children?: React.ReactNode
  onConfirmar: () => unknown
}) {
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState("")

  function cambiar(v: boolean) {
    if (!v) setError("")
    onOpenChange(v)
  }

  async function confirmar() {
    setError("")
    setTrabajando(true)
    try {
      await onConfirmar()
      cambiar(false)
    } catch (e) {
      // El motivo del servidor si lo hay (lib/api lo trae en espanol); si no,
      // que no se hizo y que probar.
      setError(
        e instanceof Error && e.message
          ? `No se pudo: ${e.message}`
          : "No se pudo hacer. Probá de nuevo en un momento.",
      )
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Hoja abierta={abierta} onOpenChange={cambiar} titulo={titulo}>
      {detalle && <p className="mb-4 text-sm text-muted-foreground">{detalle}</p>}
      {children}
      {nota && <p className="mb-3 text-sm text-muted-foreground">{nota}</p>}
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button
          variant={destructivo ? "destructive" : "default"}
          disabled={deshabilitado || trabajando}
          onClick={() => void confirmar()}
        >
          {trabajando ? "Un momento…" : etiqueta}
        </Button>
        <Button variant="secondary" onClick={() => cambiar(false)}>
          Cancelar
        </Button>
      </div>
    </Hoja>
  )
}

// Aviso informativo (una sola accion): "no se puede eliminar porque…".
export function Aviso({
  abierta,
  onOpenChange,
  titulo,
  detalle,
}: {
  abierta: boolean
  onOpenChange: (v: boolean) => void
  titulo: string
  detalle: string
}) {
  return (
    <Hoja abierta={abierta} onOpenChange={onOpenChange} titulo={titulo}>
      <p className="mb-4 text-sm text-muted-foreground">{detalle}</p>
      <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
        Entendido
      </Button>
    </Hoja>
  )
}
