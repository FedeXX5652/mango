import { useEffect, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Interruptor } from "@/componentes/ui/interruptor"
import {
  type EstadoPush,
  FAMILIAS,
  type Familia,
  activarPush,
  conFamilia,
  desactivarPush,
  elegirFamilias,
  estadoPush,
  probarPush,
  tiposGuardados,
} from "@/lib/push"

// "Avisos en este dispositivo" (1.4.0): prender o apagar el push de ESTE
// navegador, y probar que llega. Sin heimdall no hay push: los avisos se ven en
// la campanita de la app igual.
const TEXTO: Record<EstadoPush, string> = {
  cargando: "",
  "no-soportado": "Este navegador no puede recibir avisos con la app cerrada.",
  "ios-instalar": "En iPhone, instalá Mango desde Safari: Compartir › Agregar a inicio.",
  "no-disponible": "El servidor todavía no tiene los avisos configurados.",
  bloqueado:
    "Los avisos de Mango están bloqueados en este navegador. Habilitalos en los permisos del sitio.",
  inactivo: "Prendelo para que te lleguen los avisos aunque la app esté cerrada.",
  activo: "Te llegan los avisos aunque la app esté cerrada.",
}

export function AvisosDispositivo() {
  const [estado, setEstado] = useState<EstadoPush>("cargando")
  // Suscribirse puede tardar unos segundos (el navegador se registra en su
  // servicio de push): mientras tanto se dice que esta pasando.
  const [trabajando, setTrabajando] = useState<"prender" | "apagar" | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [prueba, setPrueba] = useState("")

  useEffect(() => {
    estadoPush()
      .then(setEstado)
      .catch(() => setEstado("no-disponible"))
  }, [])

  const puedeCambiar = estado === "activo" || estado === "inactivo"

  async function cambiar(prender: boolean) {
    setTrabajando(prender ? "prender" : "apagar")
    setPrueba("")
    try {
      if (prender) setEstado(await activarPush())
      else {
        await desactivarPush()
        setEstado("inactivo")
      }
    } catch (e) {
      // El navegador puede negarse a suscribir (incognito, sin servicio de push):
      // no es un problema de conexion.
      setPrueba(
        e instanceof DOMException
          ? "Este navegador no pudo activar los avisos."
          : "No se pudo cambiar. ¿Hay conexión?",
      )
    } finally {
      setTrabajando(null)
    }
  }

  // Puede tardar unos segundos: con los avisos recien prendidos, el servidor
  // reintenta hasta que el servicio de push conoce este dispositivo.
  async function probar() {
    setPrueba("")
    setEnviando(true)
    try {
      const n = await probarPush()
      // Si el servicio de push ya no reconoce la suscripcion, el servidor la da de
      // baja: apagar y prender saca una nueva.
      setPrueba(
        n > 0
          ? "Enviado: fijate en las notificaciones."
          : "No llegó a este dispositivo. Probá apagar y volver a prender los avisos.",
      )
    } catch {
      setPrueba("No se pudo enviar. ¿Hay conexión?")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-card px-4 py-2 shadow-tarjeta">
        <span className="text-sm font-medium">Avisos en este dispositivo</span>
        <Interruptor
          encendido={estado === "activo"}
          etiqueta="Avisos en este dispositivo"
          disabled={!puedeCambiar || trabajando !== null}
          onCambio={(v) => void cambiar(v)}
        />
      </div>
      {estado !== "cargando" && (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {trabajando === "prender"
            ? "Activando los avisos…"
            : trabajando === "apagar"
              ? "Apagando los avisos…"
              : TEXTO[estado]}
        </p>
      )}
      {estado === "activo" && <Familias />}
      {estado === "activo" && (
        <Button variant="secondary" size="sm" disabled={enviando} onClick={() => void probar()}>
          {enviando ? "Enviando…" : "Mandar un aviso de prueba"}
        </Button>
      )}
      {prueba && (
        <p role="status" className="text-xs text-muted-foreground">
          {prueba}
        </p>
      )}
    </div>
  )
}

// Que avisos le llegan a este dispositivo (1.7.0): uno puede querer los gastos del
// grupo en la compu y no en el celular. Lo que se apaga aca sigue en la campanita.
function Familias() {
  const [tipos, setTipos] = useState<Familia[] | null>(tiposGuardados)
  const [error, setError] = useState("")

  async function cambiar(familia: Familia, prendida: boolean) {
    const antes = tipos
    const nuevos = conFamilia(tipos, familia, prendida)
    setTipos(nuevos)
    setError("")
    try {
      await elegirFamilias(nuevos)
    } catch {
      setTipos(antes)
      setError("No se pudo cambiar. ¿Hay conexión?")
    }
  }

  const prendidas = tipos ?? FAMILIAS.map((f) => f.id)
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm text-muted-foreground">Qué avisos llegan acá</legend>
      <div className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-tarjeta">
        {FAMILIAS.map((f) => {
          const prendida = prendidas.includes(f.id)
          // Apagarlas todas es apagar los avisos: eso es el interruptor de arriba.
          const ultima = prendida && prendidas.length === 1
          return (
            <div key={f.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{f.nombre}</span>
                <span className="block text-xs text-muted-foreground">{f.detalle}</span>
              </span>
              <Interruptor
                encendido={prendida}
                etiqueta={f.nombre}
                disabled={ultima}
                onCambio={(v) => void cambiar(f.id, v)}
              />
            </div>
          )
        })}
      </div>
      {prendidas.length === 1 && (
        <p className="text-xs text-muted-foreground">
          Para no recibir ninguno, apagá los avisos en este dispositivo.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
