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

// UUID v5 (RFC 4122): el mismo nombre en el mismo espacio da siempre el mismo id.
// Los ciclos de los recordatorios lo usan (lib/repeticion.ts, 0030) para que dos
// dispositivos que marcan el mismo ciclo escriban la misma fila. Es sincronico y
// no depende de crypto.subtle, que en http de LAN no existe.
export function uuidv5(espacio: string, nombre: string): string {
  const ns = espacio.replace(/-/g, "")
  const datos = new TextEncoder().encode(nombre)
  const entrada = new Uint8Array(16 + datos.length)
  for (let i = 0; i < 16; i++) entrada[i] = parseInt(ns.slice(i * 2, i * 2 + 2), 16)
  entrada.set(datos, 16)
  const b = sha1(entrada).slice(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50 // version 5
  b[8] = (b[8] & 0x3f) | 0x80 // variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// SHA-1 (FIPS 180-4). Solo para uuidv5: no es para nada de seguridad.
function sha1(mensaje: Uint8Array): Uint8Array {
  const largo = Math.ceil((mensaje.length + 9) / 64) * 64
  const m = new Uint8Array(largo)
  m.set(mensaje)
  m[mensaje.length] = 0x80
  const dv = new DataView(m.buffer)
  const bits = mensaje.length * 8
  dv.setUint32(largo - 8, Math.floor(bits / 2 ** 32))
  dv.setUint32(largo - 4, bits >>> 0)
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const w = new Uint32Array(80)
  for (let bloque = 0; bloque < largo; bloque += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(bloque + t * 4)
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]
      w[t] = (x << 1) | (x >>> 31)
    }
    let [a, b, c, d, e] = h
    for (let t = 0; t < 80; t++) {
      const f =
        t < 20
          ? (b & c) | (~b & d)
          : t < 40
            ? b ^ c ^ d
            : t < 60
              ? (b & c) | (b & d) | (c & d)
              : b ^ c ^ d
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0
      e = d
      d = c
      c = ((b << 30) | (b >>> 2)) >>> 0
      b = a
      a = temp
    }
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
  }
  const salida = new Uint8Array(20)
  const ds = new DataView(salida.buffer)
  h.forEach((v, i) => ds.setUint32(i * 4, v))
  return salida
}
