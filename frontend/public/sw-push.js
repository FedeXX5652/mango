// Avisos push de Mango (1.4.0). Lo importa el service worker que genera
// vite-plugin-pwa (vite.config.ts, `workbox.importScripts`).
//
// El servidor manda {titulo, cuerpo, link, tag, icono, insignia}. Cada aviso dice
// a que pertenece (el titulo trae el grupo: "Casa · Te registraron un pago") y
// usa el logo con fondo transparente: `icon` el logo y `badge` el monocromo de
// la barra de Android. El `tag` agrupa por origen: uno nuevo del mismo origen
// reemplaza al anterior en vez de apilarse.
//
// Los avisos de un vencimiento (1.5.0, 0030) traen ademas `acciones` y un
// `token` de un solo uso: los botones "Ya lo pagué" y "Más tarde" responden sin
// abrir la app (Android; iPhone no muestra botones).

self.addEventListener("push", (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { cuerpo: event.data ? event.data.text() : "" }
  }
  const opciones = {
    body: d.cuerpo || "",
    icon: d.icono || "/icons/png/mango-512.png",
    badge: d.insignia || "/icons/png/mango-mono-96.png",
    tag: d.tag,
    data: { link: d.link || "/", token: d.token || null },
    lang: "es-AR",
  }
  if (Array.isArray(d.acciones) && d.acciones.length > 0 && d.token) {
    opciones.actions = d.acciones.map((a) => ({ action: a.accion, title: a.titulo }))
    // Pide una respuesta: en la compu queda a la vista hasta responder (en
    // Android queda en la bandeja de todas formas).
    opciones.requireInteraction = true
  }
  event.waitUntil(self.registration.showNotification(d.titulo || "Mango", opciones))
})

// Solo rutas de la app: un link que resuelve a otro origen ("//otro.sitio") se
// cambia por el inicio.
function rutaInterna(pedido) {
  try {
    const u = new URL(pedido || "/", self.location.origin)
    return u.origin === self.location.origin ? u.pathname + u.search + u.hash : "/"
  } catch {
    return "/"
  }
}

// Si la app esta abierta, la trae al frente y le pide que vaya a la pantalla del
// aviso (sin recargar: la navegacion la hace la app). Si no, la abre ahi mismo.
async function abrir(link) {
  const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
  for (const v of ventanas) {
    if (new URL(v.url).origin === self.location.origin) {
      await v.focus()
      v.postMessage({ tipo: "abrir", link })
      return
    }
  }
  await self.clients.openWindow(new URL(link, self.location.origin).href)
}

// Un boton del aviso: lo responde el servidor con el token (el service worker no
// tiene la sesion). La API esta en el mismo origen (nginx, 0020). Si no se pudo
// (sin conexion, el permiso ya se uso o vencio), se abre el vencimiento en la app
// para responderlo ahi. Devuelve si quedo respondido.
async function responderAccion(token, accion) {
  try {
    const r = await fetch("/api/v1/reminder-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, accion }),
    })
    return r.ok
  } catch {
    return false
  }
}
self.responderAccion = responderAccion

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const datos = event.notification.data || {}
  const link = rutaInterna(datos.link)
  event.waitUntil(
    (async () => {
      if (event.action && datos.token) {
        if (await responderAccion(datos.token, event.action)) return
      }
      await abrir(link)
    })(),
  )
})
