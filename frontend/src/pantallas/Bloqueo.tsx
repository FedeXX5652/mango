import { Delete, Fingerprint } from "lucide-react"
import { useEffect, useState } from "react"

import {
  activarBiometria,
  biometriaActivada,
  biometriaDisponible,
  desbloquearConBiometria,
} from "@/lib/biometria"
import { definirPin, verificarPin } from "@/lib/pin"
import { cn } from "@/lib/utils"

interface Props {
  modo: "crear" | "desbloquear"
  onListo: () => void
}

const MIN = 4
const MAX = 6

export function PantallaBloqueo({ modo, onListo }: Props) {
  const [pin, setPin] = useState("")
  // En "crear": primer ingreso que hay que repetir para confirmar.
  const [pinInicial, setPinInicial] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [bioDisponible, setBioDisponible] = useState(false)

  const confirmando = modo === "crear" && pinInicial !== null

  useEffect(() => {
    biometriaDisponible().then(setBioDisponible)
    if (modo === "desbloquear" && biometriaActivada()) {
      desbloquearConBiometria().then((ok) => ok && onListo())
    }
  }, [modo, onListo])

  function tecla(d: string) {
    setError("")
    setPin((p) => (p.length < MAX ? p + d : p))
  }
  function borrar() {
    setError("")
    setPin((p) => p.slice(0, -1))
  }

  async function confirmar() {
    if (pin.length < MIN) return
    if (modo === "crear") {
      if (!confirmando) {
        setPinInicial(pin)
        setPin("")
        return
      }
      if (pin !== pinInicial) {
        setError("Los códigos no coinciden")
        setPin("")
        setPinInicial(null)
        return
      }
      await definirPin(pin)
      // Alta de biometria best-effort y SIN bloquear: navigator.credentials
      // .create espera al usuario (hasta 60 s) y no debe demorar el desbloqueo.
      if (bioDisponible) void activarBiometria().catch(() => {})
      onListo()
    } else if (await verificarPin(pin)) {
      onListo()
    } else {
      setError("Código incorrecto")
      setPin("")
    }
  }

  // Teclado fisico. Sin deps: se re-registra cada render para tomar el estado
  // fresco (pantalla efimera, costo despreciable).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) tecla(e.key)
      else if (e.key === "Backspace") borrar()
      else if (e.key === "Enter") confirmar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const subtitulo = confirmando
    ? "Repetí el código"
    : modo === "crear"
      ? "Elegí un código de acceso"
      : "Ingresá tu código"

  const mostrarBio = modo === "desbloquear" && bioDisponible && biometriaActivada()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background px-6">
      <img src="/icons/svg/mango.svg" alt="Mango" className="h-16 w-16" />
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Mango</h1>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </div>

      {/* Puntos como PIN de telefono: uno por digito, centrados como grupo que
          crece, cada uno con fade-in al aparecer. Vacio no muestra ninguno. */}
      <div className="flex h-4 items-center justify-center gap-3" aria-hidden>
        {Array.from({ length: pin.length }).map((_, i) => (
          <span key={i} className="h-3 w-3 rounded-full bg-primary motion-safe:animate-punto" />
        ))}
      </div>

      <p className="h-5 text-center text-sm text-destructive">{error || " "}</p>

      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Tecla key={d} onClick={() => tecla(d)}>
            {d}
          </Tecla>
        ))}
        {mostrarBio ? (
          <Tecla
            onClick={() => desbloquearConBiometria().then((ok) => ok && onListo())}
            aria-label="Usar biometría"
          >
            <Fingerprint className="mx-auto h-6 w-6" />
          </Tecla>
        ) : (
          <div />
        )}
        <Tecla onClick={() => tecla("0")}>0</Tecla>
        <Tecla onClick={borrar} aria-label="Borrar" disabled={pin.length === 0}>
          <Delete className="mx-auto h-6 w-6" />
        </Tecla>
      </div>

      <button
        onClick={confirmar}
        disabled={pin.length < MIN}
        className={cn(
          "h-12 w-full max-w-xs rounded-md bg-primary font-medium text-primary-foreground transition-opacity",
          pin.length < MIN && "opacity-40",
        )}
      >
        {modo === "crear" ? (confirmando ? "Crear código" : "Continuar") : "Desbloquear"}
      </button>

      <p className="text-xs text-muted-foreground">4 a 6 dígitos</p>
    </div>
  )
}

function Tecla({
  children,
  onClick,
  disabled,
  ...props
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-16 rounded-full text-2xl font-medium transition-[background-color,transform] duration-100 ease-salida",
        "hover:bg-muted active:bg-muted motion-safe:active:scale-95 disabled:opacity-30",
      )}
      {...props}
    >
      {children}
    </button>
  )
}
