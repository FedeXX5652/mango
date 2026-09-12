import { factorDe } from "@/lib/dinero"

// Los tres campos de una compra en otra moneda (ver decision 0005). Espeja la
// regla del servidor (`services/conversion.py`) para poder completar el
// formulario en vivo, sin ida y vuelta.
//
//   monto          en la moneda del hecho (15,80 USD)
//   montoCuenta    lo que salio de la cuenta, en SU moneda (27.412,60 ARS)
//   cotizacion     montoCuenta / monto, derivada
//
// **El monto debitado manda.** Los dos caminos no dan lo mismo —27.412,60 con
// cotizacion 1734,9747 contra 1735,10 con 27.414,58— y el que figura en el
// resumen del banco es el monto. La cotizacion se deduce.
//
// La cuenta se hace sobre unidades MAYORES: `monto` esta en unidades menores de
// su moneda y `montoCuenta` en las de la cuenta, y no todas tienen dos
// decimales (JPY y CLP tienen cero).

// Cotizacion implicita, como string con hasta 10 decimales (la escala de la
// columna). String y no number: es lo que se guarda, y asi no se arrastra el
// error binario del float mas alla del calculo.
export function cotizacionDe(
  monto: number,
  moneda: string,
  montoCuenta: number,
  monedaCuenta: string,
): string | null {
  if (monto <= 0 || montoCuenta <= 0) return null
  const mayores = monto / factorDe(moneda)
  const mayoresCuenta = montoCuenta / factorDe(monedaCuenta)
  return recortar(mayoresCuenta / mayores)
}

// Monto debitado que implica una cotizacion, en unidades menores de la moneda
// de la cuenta. Redondeado: es plata, no puede quedar en fracciones.
export function montoCuentaDe(
  monto: number,
  moneda: string,
  cotizacion: number,
  monedaCuenta: string,
): number | null {
  if (monto <= 0 || !(cotizacion > 0)) return null
  const mayores = monto / factorDe(moneda)
  return Math.round(mayores * cotizacion * factorDe(monedaCuenta))
}

// 10 decimales como maximo y sin ceros de relleno: "1734.9746835443", "1735.1".
function recortar(valor: number): string {
  const fijo = valor.toFixed(10)
  return fijo.includes(".") ? fijo.replace(/0+$/, "").replace(/\.$/, "") : fijo
}

// La cotizacion para leer, no para guardar: separador decimal local y sin los
// diez decimales de la columna, que en pantalla son ruido (ver 0006). Se
// muestra tal cual esta guardada, solo con menos cola: el dato exacto es el
// monto debitado, la cotizacion es informativa.
export function cotizacionLegible(valor: string | number): string {
  const n = typeof valor === "string" ? Number(valor) : valor
  if (!Number.isFinite(n)) return String(valor)
  // Debajo de 1 hacen falta mas decimales para que el numero diga algo.
  return n.toLocaleString("es-AR", { maximumFractionDigits: n >= 1 ? 4 : 6 })
}
