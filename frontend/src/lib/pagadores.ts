import type { AbstractPowerSyncDatabase } from "@powersync/web"

import { uuidv4 } from "@/lib/uuid"

// Quien puso plata en un gasto compartido (0032).

export interface Pagador {
  // Un miembro o la cuenta conjunta: uno de los dos.
  user_id: string | null
  account_id: string | null
  amount: number
}

export interface ValorPagadores {
  // Lo que puse yo. null = lo pagué entero (no hay "entre varios").
  mio: number | null
  otros: Pagador[]
  valido: boolean
}

export const LO_PAGUE_YO: ValorPagadores = { mio: null, otros: [], valido: true }

// Una fila guardada de `transaction_payers`.
export interface PagadorGuardado extends Pagador {
  id: string
  status: string
}

function clave(p: Pagador): string {
  return p.user_id ?? `cuenta:${p.account_id}`
}

// Deja `transaction_payers` del gasto como dice `otros`: crea lo nuevo, cambia
// el monto de lo que cambio (el servidor le vuelve a pedir confirmacion a ese
// miembro, Q1) y borra lo que ya no esta (y con eso su pago, Q2). Escritura
// local: sube por la sync.
export async function guardarPagadores(
  db: AbstractPowerSyncDatabase,
  txId: string,
  otros: Pagador[],
  existentes: PagadorGuardado[] = [],
): Promise<void> {
  const nuevos = new Map(otros.filter((p) => p.amount > 0).map((p) => [clave(p), p]))
  for (const e of existentes) {
    const n = nuevos.get(clave(e))
    if (!n) {
      await db.execute("DELETE FROM transaction_payers WHERE id = ?", [e.id])
    } else if (n.amount !== e.amount) {
      await db.execute("UPDATE transaction_payers SET amount = ? WHERE id = ?", [n.amount, e.id])
    }
    nuevos.delete(clave(e))
  }
  for (const p of nuevos.values()) {
    await db.execute(
      `INSERT INTO transaction_payers (id, transaction_id, user_id, account_id, amount, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      // La conjunta es de todos: no confirma nadie.
      [uuidv4(), txId, p.user_id, p.account_id, p.amount, p.account_id ? "confirmed" : "pending"],
    )
  }
}
