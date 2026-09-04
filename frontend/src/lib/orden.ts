// Reordenamiento manual de listas con `sort_order` (cuentas, medios de pago).
// Mueve un item y renumera todo de 0 a n-1: los valores quedan compactos y sin
// empates, aunque vinieran todos en 0 (el default del esquema).

interface BaseLocal {
  execute: (sql: string, params: unknown[]) => Promise<unknown>
}

export async function moverEnOrden<T extends { id: string }>(
  db: BaseLocal,
  // p. ej. "UPDATE accounts SET sort_order = ? WHERE id = ?"
  sqlActualizar: string,
  items: T[],
  desde: number,
  delta: -1 | 1,
): Promise<void> {
  const hacia = desde + delta
  if (desde < 0 || hacia < 0 || desde >= items.length || hacia >= items.length) return

  const arr = [...items]
  const [movido] = arr.splice(desde, 1)
  arr.splice(hacia, 0, movido)

  for (let i = 0; i < arr.length; i++) {
    await db.execute(sqlActualizar, [i, arr[i].id])
  }
}
