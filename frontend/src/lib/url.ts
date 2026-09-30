// Direccion de un servicio -> URL absoluta y sin barra final.
//
// En produccion la PWA habla con la API y con PowerSync por su MISMO origen:
// nginx hace de proxy (ver 0020), asi que la config es relativa (`/powersync`) y
// la imagen sirve para cualquier host. El SDK de PowerSync, en cambio, la
// necesita absoluta: la concatena con la ruta (`endpoint + "/sync/stream"`), la
// usa desde un worker y la pasa a `new WebSocket`, y ahi una relativa no sirve.
// Tambien exige que no termine en "/" (lo avisa con un error si pasa).
export function urlAbsoluta(valor: string, origen: string): string {
  const v = valor.trim()
  if (!v) return ""
  const absoluta = /^https?:\/\//i.test(v) ? v : new URL(v, origen).toString()
  return absoluta.replace(/\/+$/, "")
}
