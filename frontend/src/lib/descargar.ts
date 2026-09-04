// Dispara la descarga de un archivo generado en memoria. El object URL se
// revoca siempre: si no, el blob queda retenido hasta recargar la pagina.
export function descargarTexto(contenido: string, nombre: string, tipo = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: `${tipo};charset=utf-8` }))
  try {
    const a = document.createElement("a")
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
