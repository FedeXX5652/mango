import { useEffect, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Interruptor } from "@/componentes/ui/interruptor"
import { type EstadoPush, activarPush, desactivarPush, estadoPush, probarPush } from "@/lib/push"

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
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-card px-4">
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
      {estado === "activo" && (
        <Button variant="outline" size="sm" disabled={enviando} onClick={() => void probar()}>
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
