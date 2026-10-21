// Ajuste de saldo (0033), como en Money Manager: cuando la cuenta se descuadra
// por algo que no se puede identificar, se escribe el saldo que de verdad hay y
// la diferencia queda como un movimiento "Ajuste de cuenta". Sube: un ingreso;
// baja: un egreso; igual: nada que anotar. En centavos, con signo (el saldo de
// una tarjeta es negativo).
export function ajusteDeSaldo(
  actual: number,
  nuevo: number,
): { kind: "income" | "expense"; amount: number } | null {
  const diferencia = nuevo - actual
  if (diferencia === 0) return null
  return diferencia > 0
    ? { kind: "income", amount: diferencia }
    : { kind: "expense", amount: -diferencia }
}
