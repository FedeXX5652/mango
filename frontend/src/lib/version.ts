// Version de la app (0025): la que esta corriendo en ESTE dispositivo. Con la PWA
// en cache, es la forma de saber si ya tomo la ultima: el commit tiene que ser
// el ultimo de GitHub.
//
//   - version: SemVer (MAYOR.MENOR.PARCHE), de frontend/package.json.
//   - commit:  el commit corto del que salio la compilacion (el mismo tag que
//              las imagenes de release.sh). Vacio si no se pudo saber.
//   - compilada: cuando se armo el bundle.
export const VERSION = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  compilada: __APP_BUILD__,
}

// "Mango 1.0.0 · 1b6e277 · 01/10/2026". Lo que no se sabe no se muestra.
export function textoVersion(v = VERSION): string {
  const fecha = v.compilada ? new Date(v.compilada) : null
  const dia =
    fecha && !Number.isNaN(fecha.getTime())
      ? fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
      : null
  return ["Mango " + v.version, v.commit || null, dia].filter(Boolean).join(" · ")
}
