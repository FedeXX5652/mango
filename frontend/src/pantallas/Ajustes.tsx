import { Check, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
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
        <div className="overflow-hidden rounded-lg border border-border">
          {[
            { to: "/cuentas", etiqueta: "Cuentas" },
            { to: "/categorias", etiqueta: "Categorías" },
            { to: "/medios", etiqueta: "Medios de pago" },
            { to: "/plantillas", etiqueta: "Plantillas" },
            { to: "/recurrentes", etiqueta: "Recurrentes" },
          ].map((i) => (
            <Link
              key={i.to}
              to={i.to}
              className="flex items-center justify-between border-b border-border bg-card px-4 py-3 text-sm last:border-b-0 hover:bg-muted"
            >
              {i.etiqueta}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
        <div className="grid grid-cols-3 gap-3">
          {MODOS.map((m) => (
            <Button
              key={m.valor}
              variant={colorScheme === m.valor ? "default" : "outline"}
              onClick={() => setColorScheme(m.valor)}
            >
              {m.etiqueta}
            </Button>
          ))}
        </div>
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
