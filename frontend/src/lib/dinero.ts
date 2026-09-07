// Formateo de montos guardados en unidades menores (enteros). Nunca se opera en
// float: la division por el factor de la moneda es solo para mostrar.
//
// El simbolo, su posicion, los separadores y la cantidad de decimales los
// resuelve `Intl.NumberFormat` a partir del locale y el codigo ISO 4217. No hay
// tabla de simbolos propia: se desactualiza y no maneja la posicion.
//
// La direccion (gasto/ingreso) la comunica el signo, nunca solo el color
// (DESIGN.md 3, advertencia de accesibilidad).

// Locale unico por ahora. `users.locale` existe en el esquema; cuando se use,
// entra por aca. El armado de `<Monto>` asume simbolo antes del numero, que es
// lo que hace es-AR.
const LOCALE = "es-AR"

// Intl separa con espacio no-separable (U+00A0). Se normaliza para que el texto
// sea estable en pruebas y en el DOM.
const NBSP = / /g

// Moneda base: la del usuario (`users.base_currency`). La configura una sola vez
// el proveedor de moneda base al arrancar (hooks/monedaBase.tsx); las funciones
// de formateo la usan cuando no se les pasa una. Es un modulo y no un contexto
// porque el formateo se llama desde JSX en decenas de lugares, no desde hooks.
let base = "ARS"

export function configurarMonedaBase(moneda: string): void {
  base = moneda.trim().toUpperCase()
}

export function monedaBase(): string {
  return base
}

export type Direccion = "gasto" | "ingreso" | "neutro"

// Un monto partido en piezas, para que `<Monto>` pueda dibujar el simbolo
// atenuado y los decimales mas chicos (DESIGN.md 7, decision 0006).
export interface PartesMonto {
  signo: string
  simbolo: string
  entero: string
  // Separador decimal ("," en es-AR). Vacio en monedas sin decimales.
  separador: string
  // Decimales sin separador. Vacio en monedas sin decimales (JPY, CLP).
  fraccion: string
  // `entero + separador + fraccion`, para donde el monto va como texto plano.
  numero: string
}

const agrupador = new Intl.NumberFormat(LOCALE)

// Decimales de la moneda segun ISO 4217: 2 para ARS, USD o BRL; 0 para JPY o
// CLP. De ahi sale el factor entre unidad mayor y menor: no siempre es 100.
const cacheDecimales = new Map<string, number>()

export function decimalesDe(moneda: string): number {
  const cur = moneda.toUpperCase()
  const guardado = cacheDecimales.get(cur)
  if (guardado !== undefined) return guardado
  let dec = 2
  try {
    dec =
      new Intl.NumberFormat(LOCALE, { style: "currency", currency: cur }).resolvedOptions()
        .maximumFractionDigits ?? 2
  } catch {
    // Codigo desconocido: se asume el caso comun antes que romper la pantalla.
    dec = 2
  }
  cacheDecimales.set(cur, dec)
  return dec
}

// Cuantas unidades menores tiene una unidad mayor: 100 en ARS, 1 en JPY.
export function factorDe(moneda: string): number {
  return 10 ** decimalesDe(moneda)
}

function simboloDe(moneda: string, display: "narrowSymbol" | "symbol" | "code"): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: moneda,
    currencyDisplay: display,
  })
    .formatToParts(0)
    .filter((p) => p.type === "currency")
    .map((p) => p.value)
    .join("")
}

// La moneda base se muestra con su simbolo corto ($ 2.302,72): es la moneda de
// casi todo y el codigo seria ruido. Las demas con simbolo desambiguado, que en
// es-AR convierte USD en "US$", la convencion local. Si el simbolo de la otra
// moneda coincide igual con el de la base (pasa si la base es USD y la otra
// ARS: las dos usan "$"), se cae al codigo ISO.
function displayDe(moneda: string): "narrowSymbol" | "symbol" | "code" {
  if (moneda === base) return "narrowSymbol"
  try {
    return simboloDe(moneda, "symbol") === simboloDe(base, "narrowSymbol") ? "code" : "symbol"
  } catch {
    return "code"
  }
}

const cacheFmt = new Map<string, Intl.NumberFormat>()

function formateador(moneda: string): Intl.NumberFormat {
  const cur = moneda.toUpperCase()
  const clave = `${cur}|${base}`
  const guardado = cacheFmt.get(clave)
  if (guardado) return guardado
  const fmt = new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: cur,
    currencyDisplay: displayDe(cur),
    // El signo lo pone Mango, que usa "+" tambien en los ingresos.
    signDisplay: "never",
  })
  cacheFmt.set(clave, fmt)
  return fmt
}

function signoDe(direccion: Direccion): string {
  return direccion === "gasto" ? "-" : direccion === "ingreso" ? "+" : ""
}

// Solo el numero, sin simbolo: para donde el simbolo se dibuja aparte (la
// calculadora, `<Monto>`) o no va.
export function formatearCentavos(centavos: number, moneda: string = base): string {
  const dec = decimalesDe(moneda)
  const factor = 10 ** dec
  const abs = Math.abs(centavos)
  const entero = agrupador.format(Math.trunc(abs / factor))
  if (dec === 0) return entero
  return `${entero},${(abs % factor).toString().padStart(dec, "0")}`
}

// Arma el texto desde las partes de Intl: `simbolo espacio numero`. Se arma a
// mano para tener un unico espaciado en toda la app, sin depender de como lo
// separe cada locale.
function armar(centavos: number, moneda: string, direccion: Direccion): string {
  const { signo, simbolo, numero } = descomponer(centavos, moneda, direccion)
  return `${signo}${simbolo} ${numero}`
}

function descomponer(centavos: number, moneda: string, direccion: Direccion): PartesMonto {
  const partes = formateador(moneda).formatToParts(Math.abs(centavos) / factorDe(moneda))
  const tomar = (...tipos: Intl.NumberFormatPartTypes[]) =>
    partes
      .filter((p) => tipos.includes(p.type))
      .map((p) => p.value)
      .join("")
      .replace(NBSP, " ")
  const simbolo = tomar("currency").trim()
  const entero = tomar("integer", "group").trim()
  const fraccion = tomar("fraction")
  // El separador viaja con los decimales: en `<Monto>` los decimales van mas
  // chicos, y una coma sola pegada al numero grande parece un error de tipeo.
  const separador = fraccion ? tomar("decimal") : ""
  const numero = `${entero}${separador}${fraccion}`
  return { signo: signoDe(direccion), simbolo, entero, separador, fraccion, numero }
}

export function formatearMonto(
  centavos: number,
  opciones: { moneda?: string; direccion?: Direccion } = {},
): string {
  const { moneda = base, direccion = "neutro" } = opciones
  return armar(centavos, moneda, direccion)
}

// Saldo: muestra el signo negativo cuando la cuenta esta en rojo (ej: deuda de
// tarjeta). El signo positivo no se muestra: un saldo en positivo es lo normal.
export function formatearSaldo(centavos: number, moneda: string = base): string {
  return formatearMonto(centavos, { moneda, direccion: centavos < 0 ? "gasto" : "neutro" })
}

// Simbolo y numero por separado, para alinear columnas de monto en una lista:
// el simbolo tiene ancho variable ("$" contra "US$" contra "R$") y si comparte
// caja con el numero las columnas quedan dentadas (DESIGN.md 7).
export function partesMonto(
  centavos: number,
  opciones: { moneda?: string; direccion?: Direccion } = {},
): PartesMonto {
  const { moneda = base, direccion = "neutro" } = opciones
  return descomponer(centavos, moneda, direccion)
}

// Formatea la entrada de la calculadora (string en curso) con separador de
// miles, conservando la coma decimal tal como se tipea (incluida la coma sola).
export function formatearEntrada(entrada: string): string {
  const [ent, dec] = entrada.split(",")
  const entero = agrupador.format(Number(ent || "0"))
  return entrada.includes(",") ? `${entero},${dec ?? ""}` : entero
}

// Convierte lo tipeado por el usuario ("2302,72" o "2302.72") a unidades
// menores de la moneda.
export function aCentavos(texto: string, moneda: string = base): number | null {
  const s = texto.trim()
  if (s === "") return null
  const tieneComa = s.includes(",")
  const tienePunto = s.includes(".")
  let normal: string
  if (tieneComa && tienePunto) {
    // Formato local "2.302,72": punto de miles, coma decimal.
    normal = s.replace(/\./g, "").replace(",", ".")
  } else if (tieneComa) {
    // Solo coma: decimal.
    normal = s.replace(",", ".")
  } else {
    // Solo punto o sin separadores: el punto se toma como decimal.
    normal = s
  }
  const num = Number(normal)
  if (Number.isNaN(num)) return null
  return Math.round(num * factorDe(moneda))
}
