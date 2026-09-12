// Los informes se leen SIEMPRE en una moneda a la vez. Sumar montos de monedas
// distintas da un numero que no significa nada, y convertir exige cotizaciones
// (ver ESPECIFICACION 3.6.1 y decision 0005): hasta que existan, el informe
// elige una moneda y lo dice.

// Monedas presentes en los datos, sin repetir y en orden estable: la base
// primero, porque es la de casi todo, y el resto alfabetico.
export function ordenarMonedas(codigos: (string | null | undefined)[], base: string): string[] {
  const limpias = new Set<string>()
  for (const c of codigos) {
    const cur = c?.trim().toUpperCase()
    if (cur) limpias.add(cur)
  }
  const b = base.trim().toUpperCase()
  const resto = [...limpias].filter((c) => c !== b).sort()
  return limpias.has(b) ? [b, ...resto] : resto
}

// Moneda con la que se abre el informe: la base si tiene datos; si no, la
// primera disponible. Sin datos devuelve la base, que es lo que va a mostrar el
// estado vacio.
export function monedaPorDefecto(disponibles: string[], base: string): string {
  const b = base.trim().toUpperCase()
  if (disponibles.length === 0) return b
  return disponibles.includes(b) ? b : disponibles[0]
}

// --- Elegir la moneda base ---------------------------------------------------
//
// La moneda base es la de LECTURA: ordena los selectores, decide el default de
// los informes y formatea los simbolos. No se guarda en ningun movimiento, asi
// que cambiarla no reescribe nada (ver 0005 y ESPECIFICACION 3.6.2).
//
// Para elegirla hace falta la lista ISO completa, no solo las monedas que ya
// tenés: si te mudas a Portugal, EUR todavia no aparece en ningun dato tuyo.
// `Intl` la trae sin sumar una dependencia.

export interface MonedaListada {
  codigo: string
  nombre: string
}

// Si el navegador no tiene `supportedValuesOf` (es de 2022), al menos que se
// pueda elegir entre las monedas en uso y las mas corrientes.
const CORRIENTES = ["ARS", "USD", "EUR", "BRL", "GBP", "CLP", "UYU", "MXN", "PYG", "COP"]

export function listarMonedas(enUso: string[] = []): MonedaListada[] {
  const usadas = new Set(enUso.map((c) => c.trim().toUpperCase()).filter(Boolean))

  let codigos: string[]
  try {
    codigos = Intl.supportedValuesOf("currency")
  } catch {
    codigos = [...new Set([...usadas, ...CORRIENTES])]
  }

  const nombrar = nombrador()
  // Las que ya usas arriba: son las que vas a buscar el 99% de las veces.
  const propias = codigos.filter((c) => usadas.has(c)).sort()
  const resto = codigos.filter((c) => !usadas.has(c)).sort()
  return [...propias, ...resto].map((codigo) => ({ codigo, nombre: nombrar(codigo) }))
}

function nombrador(): (codigo: string) => string {
  try {
    const dn = new Intl.DisplayNames(["es-AR"], { type: "currency" })
    // `of` puede devolver el mismo codigo si no conoce la moneda; sirve igual.
    return (codigo) => dn.of(codigo) ?? codigo
  } catch {
    return (codigo) => codigo
  }
}

// Busca por codigo o por nombre, sin importar tildes ni mayusculas: "dolar"
// tiene que encontrar "Dólar estadounidense".
export function filtrarMonedas(lista: MonedaListada[], texto: string): MonedaListada[] {
  const q = sinTildes(texto)
  if (!q) return lista
  return lista.filter((m) => sinTildes(m.codigo).includes(q) || sinTildes(m.nombre).includes(q))
}

function sinTildes(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}
