// El lente del grupo (0014, 0021), armado en SQL.
//
// Un gasto compartido existe en dos tablas locales: completo en `transactions`
// si es mio, y recortado (sin lo privado) en `group_transactions`, para todos
// los miembros. El lente usa MI copia para lo mio —trae la ultima edicion local
// aunque todavia no haya subido, asi el grupo refleja al instante lo que cargo
// sin conexion— y la del grupo para lo de los demas. Cada movimiento aparece una
// sola vez.
//
// Uso: `FROM ${TX_GRUPO} t WHERE t.group_id = ? AND t.visibility = 'shared'`.
// Las pantallas personales NO lo usan: leen `transactions`, que es solo lo mio.

const COLUMNAS =
  "id, owner_id, group_id, visibility, kind, status, occurred_at, category_id, amount," +
  " currency, payee, paid_from_group, account_id, amount_account, transfer_account_id, deleted_at"

export const TX_GRUPO = `(SELECT ${COLUMNAS} FROM transactions
  UNION ALL
  SELECT ${COLUMNAS} FROM group_transactions
  WHERE id NOT IN (SELECT id FROM transactions))`
