// El saldo de una cuenta en SQL: la UNICA formula (0005, 0017, 0021). Antes
// estaba copiada en Inicio, Metas y la cuenta conjunta, y las copias ya
// divergian.
//
// Del lado `account_id` sale lo debitado (`amount_account` si la compra fue en
// otra moneda; si no, `amount`). Del lado `transfer_account_id` entra `amount`,
// que ya esta en la moneda de la cuenta que recibe. Los pagos REALES de deudas
// (0017) salen de la cuenta del que paga: esa cuenta es privada y llega aparte,
// a `settlement_accounts`; mientras un pago mio no subio, esta en la propia fila
// de `settlements`.
//
// `fuente`: de donde salen los movimientos. Para mis cuentas, `transactions`
// (solo lo mio). Para una cuenta conjunta, el lente del grupo (`TX_GRUPO`), que
// tiene los movimientos de todos los miembros con esa cuenta.
//
// Espera la cuenta con el alias `a`: `SELECT a.id, ${saldoCuenta()} AS balance
// FROM accounts a`.
export function saldoCuenta(fuente = "transactions"): string {
  return `a.opening_balance
    + COALESCE((SELECT SUM(COALESCE(amount_account, amount)) FROM ${fuente}
        WHERE account_id = a.id AND kind = 'income' AND status = 'confirmed' AND deleted_at IS NULL), 0)
    - COALESCE((SELECT SUM(COALESCE(amount_account, amount)) FROM ${fuente}
        WHERE account_id = a.id AND kind = 'expense' AND status = 'confirmed' AND deleted_at IS NULL), 0)
    + COALESCE((SELECT SUM(amount) FROM ${fuente}
        WHERE transfer_account_id = a.id AND kind = 'transfer' AND status = 'confirmed' AND deleted_at IS NULL), 0)
    - COALESCE((SELECT SUM(COALESCE(amount_account, amount)) FROM ${fuente}
        WHERE account_id = a.id AND kind = 'transfer' AND status = 'confirmed' AND deleted_at IS NULL), 0)
    - COALESCE((SELECT SUM(s.amount) FROM settlements s
        LEFT JOIN settlement_accounts sa ON sa.id = s.id
        WHERE COALESCE(s.account_id, sa.account_id) = a.id AND s.deleted_at IS NULL), 0)`
}
