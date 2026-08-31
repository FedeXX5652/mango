// UUID v4 con fallback. crypto.randomUUID solo existe en contextos seguros
// (https o localhost); en http de LAN hay que generarlo con getRandomValues,
// que si esta disponible siempre.
export function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID()
    } catch {
      /* contexto no seguro: sigue al fallback */
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"))
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h
    .slice(8, 10)
    .join("")}-${h.slice(10, 16).join("")}`
}
