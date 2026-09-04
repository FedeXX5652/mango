// Formateo de montos guardados en centavos (enteros). Nunca se opera en float:
// se separan parte entera y centavos con aritmetica entera y se agrupan miles.
// La direccion (gasto/ingreso) la comunica el signo, nunca solo el color
// (DESIGN.md 3, advertencia de accesibilidad).

const agrupador = new Intl.NumberFormat("es-AR")

export type Direccion = "gasto" | "ingreso" | "neutro"

export function formatearCentavos(centavos: number): string {
  const abs = Math.abs(centavos)
  const entero = Math.trunc(abs / 100)
  const dec = abs % 100
  return `${agrupador.format(entero)},${dec.toString().padStart(2, "0")}`
}

export function formatearMonto(
  centavos: number,
  opciones: { moneda?: string; direccion?: Direccion } = {},
): string {
  const { moneda, direccion = "neutro" } = opciones
  const signo = direccion === "gasto" ? "-" : direccion === "ingreso" ? "+" : ""
  const simbolo = moneda && moneda !== "ARS" ? `${moneda} ` : "$ "
  return `${signo}${simbolo}${formatearCentavos(centavos)}`
}

// Saldo: muestra el signo negativo cuando la cuenta esta en rojo (ej: deuda de
// tarjeta). formatearCentavos usa magnitud, asi que el signo se antepone aca.
export function formatearSaldo(centavos: number, moneda?: string): string {
  const simbolo = moneda && moneda !== "ARS" ? `${moneda} ` : "$ "
  return `${centavos < 0 ? "-" : ""}${simbolo}${formatearCentavos(centavos)}`
}

// Version compacta para tarjetas chicas de resumen ($ 1,2 M, $ 150 mil): en
// esos espacios el monto completo se corta. La division por 100 es solo para
// mostrar, no es una operacion monetaria. El monto exacto va en el `title`.
const compacto = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatearCompacto(centavos: number, moneda?: string): string {
  const simbolo = moneda && moneda !== "ARS" ? `${moneda} ` : "$ "
  const abs = Math.abs(centavos)
  // Por debajo de mil no vale abreviar: se muestra completo. Intl separa con
  // espacio no-separable (U+00A0); se normaliza para que el texto sea estable.
  const cuerpo =
    abs < 100_000
      ? formatearCentavos(abs)
      : compacto.format(Math.trunc(abs / 100)).replace(/ /g, " ")
  return `${centavos < 0 ? "-" : ""}${simbolo}${cuerpo}`
}

// Formatea la entrada de la calculadora (string en curso) con separador de
// miles, conservando la coma decimal tal como se tipea (incluida la coma sola).
export function formatearEntrada(entrada: string): string {
  const [ent, dec] = entrada.split(",")
  const entero = agrupador.format(Number(ent || "0"))
  return entrada.includes(",") ? `${entero},${dec ?? ""}` : entero
}

// Convierte lo tipeado por el usuario ("2302,72" o "2302.72") a centavos.
export function aCentavos(texto: string): number | null {
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
  return Math.round(num * 100)
}
