import { Check, CreditCard, Files, Landmark, Repeat, Tags } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Segmentado } from "@/componentes/ui/segmentado"
import { TEMAS } from "@/config/temas"
import { type ColorScheme, useTema } from "@/hooks/tema"
import { useBloqueo } from "@/hooks/bloqueo"
import {
  activarBiometria,
  biometriaActivada,
  biometriaDisponible,
  desactivarBiometria,
} from "@/lib/biometria"
import { cn } from "@/lib/utils"

const MODOS: { valor: ColorScheme; etiqueta: string }[] = [
  { valor: "light", etiqueta: "Claro" },
  { valor: "dark", etiqueta: "Oscuro" },
  { valor: "system", etiqueta: "Sistema" },
]

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{titulo}</h2>
      {children}
    </section>
  )
}

export function Ajustes() {
  const { temaId, colorScheme, setTema, setColorScheme } = useTema()
  const { bloquear } = useBloqueo()
  const [bioDisponible, setBioDisponible] = useState(false)
  const [bioActiva, setBioActiva] = useState(biometriaActivada())

  useEffect(() => {
    biometriaDisponible().then(setBioDisponible)
  }, [])

  async function toggleBiometria() {
    if (bioActiva) {
      desactivarBiometria()
      setBioActiva(false)
    } else if (await activarBiometria()) {
      setBioActiva(true)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>

      <Seccion titulo="Gestión">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { to: "/cuentas", etiqueta: "Cuentas", icono: Landmark },
            { to: "/categorias", etiqueta: "Categorías", icono: Tags },
            { to: "/medios", etiqueta: "Medios de pago", icono: CreditCard },
            { to: "/plantillas", etiqueta: "Plantillas", icono: Files },
            { to: "/recurrentes", etiqueta: "Recurrentes", icono: Repeat },
          ].map((i) => (
            <Link
              key={i.to}
              to={i.to}
              className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-primary">
                <i.icono className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium">{i.etiqueta}</span>
            </Link>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Tema">
        <div className="grid grid-cols-3 gap-3">
          {TEMAS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTema(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
                temaId === t.id ? "border-primary bg-accent" : "border-border hover:bg-muted",
              )}
            >
              <span
                className="h-5 w-5 rounded-full border border-border"
                style={{ backgroundColor: t.muestra }}
              />
              {t.nombre}
              {temaId === t.id && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Apariencia">
        <Segmentado opciones={MODOS} valor={colorScheme} onCambio={setColorScheme} />
      </Seccion>

      <Seccion titulo="Seguridad">
        {bioDisponible ? (
          <Button variant="outline" className="w-full justify-between" onClick={toggleBiometria}>
            Desbloqueo biométrico
            <span className={cn("text-sm", bioActiva ? "text-income" : "text-muted-foreground")}>
              {bioActiva ? "Activado" : "Desactivado"}
            </span>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este dispositivo no ofrece desbloqueo biométrico.
          </p>
        )}
        <Button variant="secondary" className="w-full" onClick={bloquear}>
          Bloquear ahora
        </Button>
      </Seccion>
    </div>
  )
}
