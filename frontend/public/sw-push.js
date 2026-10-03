// Avisos push de Mango (1.4.0). Lo importa el service worker que genera
// vite-plugin-pwa (vite.config.ts, `workbox.importScripts`).
//
// El servidor manda {titulo, cuerpo, link, tag, icono, insignia}. Cada aviso dice
// a que pertenece (el titulo trae el grupo: "Casa · Te registraron un pago") y
// usa el logo con fondo transparente: `icon` el logo y `badge` el monocromo de
// la barra de Android. El `tag` agrupa por origen: uno nuevo del mismo origen
// reemplaza al anterior en vez de apilarse.

self.addEventListener("push", (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { cuerpo: event.data ? event.data.text() : "" }
  }
  event.waitUntil(
    self.registration.showNotification(d.titulo || "Mango", {
      body: d.cuerpo || "",
      icon: d.icono || "/icons/png/mango-512.png",
      badge: d.insignia || "/icons/png/mango-mono-96.png",
      tag: d.tag,
      data: { link: d.link || "/" },
      lang: "es-AR",
    }),
  )
})

// Tocar el aviso: si la app esta abierta, la trae al frente y le pide que vaya a
// la pantalla del aviso (sin recargar: la navegacion la hace la app). Si no,
// abre la app ahi mismo.
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

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const link = rutaInterna(event.notification.data && event.notification.data.link)
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin) {
          await v.focus()
          v.postMessage({ tipo: "abrir", link })
          return
        }
      }
      await self.clients.openWindow(new URL(link, self.location.origin).href)
    })(),
  )
})
