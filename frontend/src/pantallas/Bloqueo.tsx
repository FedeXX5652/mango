import { Fingerprint } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Input } from "@/componentes/ui/input"
import {
  activarBiometria,
  biometriaActivada,
  biometriaDisponible,
  desbloquearConBiometria,
} from "@/lib/biometria"
import { definirPin, verificarPin } from "@/lib/pin"

interface Props {
  modo: "crear" | "desbloquear"
  onListo: () => void
}

const PIN_RE = /^\d{4,6}$/

export function PantallaBloqueo({ modo, onListo }: Props) {
  const [pin, setPin] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [error, setError] = useState("")
  const [bioDisponible, setBioDisponible] = useState(false)

  useEffect(() => {
    biometriaDisponible().then(setBioDisponible)
    // En desbloqueo, si ya esta activada, intentar biometria de una.
    if (modo === "desbloquear" && biometriaActivada()) {
      desbloquearConBiometria().then((ok) => ok && onListo())
    }
  }, [modo, onListo])

  async function crear() {
    if (!PIN_RE.test(pin)) return setError("El PIN debe tener 4 a 6 dígitos")
    if (pin !== confirmar) return setError("Los códigos no coinciden")
    await definirPin(pin)
    if (bioDisponible) await activarBiometria() // best-effort, no bloquea
    onListo()
  }

  async function desbloquear() {
    if (!(await verificarPin(pin))) {
      setError("Código incorrecto")
      setPin("")
      return
    }
    onListo()
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background px-6">
      <img src="/icons/svg/mango.svg" alt="Mango" className="h-20 w-20" />
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Mango</h1>
        <p className="text-sm text-muted-foreground">
          {modo === "crear" ? "Elegí un código de acceso" : "Ingresá tu código"}
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <Input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="Código (4-6 dígitos)"
          className="text-center tabular tracking-[0.3em]"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""))
            setError("")
          }}
          onKeyDown={(e) => e.key === "Enter" && modo === "desbloquear" && desbloquear()}
        />
        {modo === "crear" && (
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="Repetir código"
            className="text-center tabular tracking-[0.3em]"
            value={confirmar}
            onChange={(e) => {
              setConfirmar(e.target.value.replace(/\D/g, ""))
              setError("")
            }}
            onKeyDown={(e) => e.key === "Enter" && crear()}
          />
        )}

        {error && <p className="text-center text-sm text-destructive">{error}</p>}

        <Button className="w-full" onClick={modo === "crear" ? crear : desbloquear}>
          {modo === "crear" ? "Crear código" : "Desbloquear"}
        </Button>

        {modo === "desbloquear" && bioDisponible && biometriaActivada() && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => desbloquearConBiometria().then((ok) => ok && onListo())}
          >
            <Fingerprint className="h-4 w-4" />
            Usar biometría
          </Button>
        )}
      </div>

      {modo === "crear" && bioDisponible && (
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          Si tu dispositivo lo permite, se activará el desbloqueo con huella o rostro.
        </p>
      )}
    </div>
  )
}
