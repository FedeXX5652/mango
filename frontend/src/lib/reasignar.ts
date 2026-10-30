// "Eliminar y reasignar": borrar una entidad en uso moviendo lo que la
// referencia a otra. Es la alternativa a archivar cuando querés que la entidad
// **desaparezca del historial también**: dos categorias que en realidad eran
// una, una cuenta cargada por error.
//
// Todo es local: son sentencias sobre el SQLite del dispositivo, y el conector
// las sube cuando haya red (ESPECIFICACION 3.11). Reasignar 300 movimientos
// genera 300 subidas en vez de un UPDATE del servidor, y esta bien: es una
// accion rara y hacerla por endpoint la volveria imposible sin conexion.
//
// El plan se devuelve como **datos** y no se ejecuta aca: asi se puede probar
// que no falte una tabla, que es el error facil de cometer.

export interface Sentencia {
  sql: string
  params: unknown[]
}

// Lo que se pierde al reasignar, para poder avisarlo antes de confirmar.
export interface Advertencia {
  // Tabla afectada, en palabras del usuario.
  que: string
  // Por que no se puede mover y se elimina.
  porque: string
}

export interface Plan {
  sentencias: Sentencia[]
  advertencias: Advertencia[]
}

// --- Categoria ---------------------------------------------------------------

export function planCategoria(origen: string, destino: string): Plan {
  return {
    sentencias: [
      {
        sql: "UPDATE transactions SET category_id = ? WHERE category_id = ?",
        params: [destino, origen],
      },
      {
        sql: "UPDATE templates SET category_id = ? WHERE category_id = ?",
        params: [destino, origen],
      },
      {
        sql: "UPDATE recurring_rules SET category_id = ? WHERE category_id = ?",
        params: [destino, origen],
      },
      // Las subcategorias pasan a colgar del destino. Se excluye el destino
      // mismo: si era hija de la que se elimina, no puede ser su propio padre.
      {
        sql: "UPDATE categories SET parent_id = ? WHERE parent_id = ? AND id <> ?",
        params: [destino, origen, destino],
      },
      // Y si el destino era hija de la que se elimina, queda como raiz.
      {
        sql: "UPDATE categories SET parent_id = NULL WHERE id = ? AND parent_id = ?",
        params: [destino, origen],
      },
      // El presupuesto NO se mueve: el sobre es categoria + moneda + mes y ya
      // puede existir uno del destino para el mismo mes (ver 0005). Sumarlos en
      // silencio cambiaria lo asignado sin que nadie lo pida.
      { sql: "DELETE FROM budgets WHERE category_id = ?", params: [origen] },
      { sql: "DELETE FROM budget_rules WHERE category_id = ?", params: [origen] },
      { sql: "DELETE FROM categories WHERE id = ?", params: [origen] },
    ],
    advertencias: [
      {
        que: "Las asignaciones de presupuesto de esta categoría",
        porque:
          "el sobre es categoría, moneda y mes: no se pueden sumar a otro sin cambiar lo asignado",
      },
    ],
  }
}

// --- Cuenta ------------------------------------------------------------------

export function planCuenta(origen: string, destino: string): Plan {
  return {
    sentencias: [
      {
        sql: "UPDATE transactions SET account_id = ? WHERE account_id = ?",
        params: [destino, origen],
      },
      {
        sql: "UPDATE transactions SET transfer_account_id = ? WHERE transfer_account_id = ?",
        params: [destino, origen],
      },
      {
        sql: "UPDATE templates SET account_id = ? WHERE account_id = ?",
        params: [destino, origen],
      },
      {
        sql: "UPDATE recurring_rules SET account_id = ? WHERE account_id = ?",
        params: [destino, origen],
      },
      {
        sql: "UPDATE recurring_rules SET transfer_account_id = ? WHERE transfer_account_id = ?",
        params: [destino, origen],
      },
      // El saldo en otra moneda de una tarjeta se va con ella (0034); si tuviera
      // movimientos, Cuentas no ofrece eliminarla.
      { sql: "DELETE FROM accounts WHERE parent_account_id = ?", params: [origen] },
      { sql: "DELETE FROM accounts WHERE id = ?", params: [origen] },
    ],
    advertencias: [],
  }
}
