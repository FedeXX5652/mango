// Como entra una version nueva de la app (PWA). Ver decision 0028.
//
// En Android la PWA no se cierra de verdad: al "cerrarla y abrirla" vuelve la
// misma pagina, sin navegar, y el navegador no busca un service worker nuevo.
// Cuando lo encontraba, el worker nuevo tomaba el control pero la pagina abierta
// seguia con el codigo viejo hasta la proxima apertura de cero. Tardaba una o dos
// aperturas en verse un deploy.
//
// Ahora: se busca version nueva al volver a primer plano y cada media hora con la
// app a la vista, y cuando el worker nuevo toma el control la pagina se recarga
// **solo cuando no se pierde nada**: con la app oculta o en la pantalla del PIN.
// Nunca con la app desbloqueada a la vista: ahi puede haber un alta a medio
// cargar. En ese caso espera a que la persona salga.
//
// El worker sigue en `autoUpdate` (se activa solo): asi un telefono con la
// version vieja de esta logica recibe la nueva sin trabarse.

const CADA_MS = 30 * 60 * 1000

let pendiente = false
// Arranca bloqueada (con PIN la app abre en la pantalla de desbloqueo); el
// proveedor del bloqueo avisa los cambios.
let bloqueada = true

// La regla, pura: hay una version esperando y recargar no interrumpe nada.
export function debeRecargar(estado: {
  pendiente: boolean
  oculta: boolean
  bloqueada: boolean
}): boolean {
  return estado.pendiente && (estado.oculta || estado.bloqueada)
}

function aplicarSiConviene(): void {
  if (debeRecargar({ pendiente, oculta: document.visibilityState === "hidden", bloqueada })) {
    window.location.reload()
  }
}

// Lo llama el bloqueo (hooks/bloqueo.tsx): en la pantalla del PIN no hay nada
// que perder, asi que una version que estaba esperando entra ahi.
export function marcarBloqueo(b: boolean): void {
  bloqueada = b
  if (b) aplicarSiConviene()
}

export function iniciarActualizacion(): void {
  // En desarrollo no hay service worker (vite.config.ts, devOptions).
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return

  // La primera vez que un worker toma el control no es una version nueva: es la
  // instalacion. Solo los cambios de controlador posteriores lo son.
  let controlada = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!controlada) {
      controlada = true
      return
    }
    pendiente = true
    aplicarSiConviene()
  })

  const registrar = async () => {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    const buscar = () => void reg.update().catch(() => {})
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") buscar()
      else aplicarSiConviene()
    })
    window.setInterval(() => {
      if (document.visibilityState === "visible") buscar()
    }, CADA_MS)
  }
  if (document.readyState === "complete") void registrar()
  else window.addEventListener("load", () => void registrar(), { once: true })
}
