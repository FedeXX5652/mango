import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { UpdateType } from "@powersync/web"

import { type Subida, subir } from "@/lib/powersync/conector"

// La bandeja de subidas rechazadas: lo que el servidor devolvio con un 4xx y
// que, en vez de descartarse en silencio, queda guardado para reintentar,
// transformar o descartar a mano (ver decision 0011).
//
// La tabla es `localOnly` (esquema.ts): vive solo en este dispositivo. Tiene
// sentido — un rechazo depende del contrato del servidor en ESTE momento y de
// este cliente, no es un dato que otros dispositivos deban ver.

export interface Rechazada {
  id: string
  tabla: string
  op: string
  fila_id: string
  datos: string
  // Lo que se subio la primera vez, si se edito (1.7.0).
  datos_original: string | null
  motivo: string
  rechazada_en: string
}

interface Registro {
  tabla: string
  op: UpdateType
  fila_id: string
  datos: string
  motivo: string
}

// Guarda un rechazo. `id` propio (no el de la fila rechazada): una misma fila
// puede fallar varias veces con motivos distintos y cada intento es una entrada.
//
// `rechazada_en` se pasa como parametro y no se toma de `new Date()` adentro
// para que la funcion sea testeable sin reloj.
export async function registrarRechazo(
  db: AbstractPowerSyncDatabase,
  reg: Registro,
  cuando: string = new Date().toISOString(),
): Promise<void> {
  await db.execute(
    `INSERT INTO subidas_rechazadas (id, tabla, op, fila_id, datos, motivo, rechazada_en)
     VALUES (uuid(), ?, ?, ?, ?, ?, ?)`,
    [reg.tabla, String(reg.op), reg.fila_id, reg.datos, reg.motivo, cuando],
  )
}

export async function listarRechazadas(db: AbstractPowerSyncDatabase): Promise<Rechazada[]> {
  return db.getAll<Rechazada>("SELECT * FROM subidas_rechazadas ORDER BY rechazada_en DESC, id")
}

// Descarta sin reintentar: el usuario decidio que ese cambio no va. A diferencia
// de hoy, es una decision explicita y no una perdida silenciosa.
export async function descartar(db: AbstractPowerSyncDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.execute(
    `DELETE FROM subidas_rechazadas WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids,
  )
}

// Cambia lo que se va a reintentar (1.7.0): el servidor rechazo un dato y la
// persona lo corrige. La primera vez guarda el original, para poder volver a el.
// La tabla es local: editar no sube nada hasta reintentar.
export async function editarRechazada(
  db: AbstractPowerSyncDatabase,
  id: string,
  datos: Record<string, unknown>,
): Promise<void> {
  await db.execute(
    `UPDATE subidas_rechazadas
     SET datos_original = COALESCE(datos_original, datos), datos = ?
     WHERE id = ?`,
    [JSON.stringify(datos), id],
  )
}

// Vuelve a lo que se subio la primera vez.
export async function restaurarOriginal(db: AbstractPowerSyncDatabase, id: string): Promise<void> {
  await db.execute(
    `UPDATE subidas_rechazadas SET datos = datos_original, datos_original = NULL
     WHERE id = ? AND datos_original IS NOT NULL`,
    [id],
  )
}

// El campo que nombra el motivo de un 422 ("amount: debe ser >= 0" -> "amount"),
// para marcarlo al editar. Null si el motivo no nombra un campo de los datos.
export function campoDelMotivo(motivo: string, datos: Record<string, unknown>): string | null {
  const campo = motivo.split(":")[0].trim()
  return campo in datos ? campo : null
}

export interface ResultadoReintento {
  reintentadas: number
  // Volvieron a fallar, con el motivo nuevo (el servidor puede decir otra cosa).
  fallidas: number
}

// Reintenta subir cada rechazada. Es un reintento **en linea**: la fila ya la
// rechazo el servidor una vez, asi que reintentar es preguntar "¿ya se puede?".
// La que entra, se borra de la bandeja; la que vuelve a fallar, actualiza su
// motivo y su fecha y se queda.
//
// Un 5xx o la falta de conexion hacen que `subir` relance: se corta el reintento
// y lo que quedaba sigue en la bandeja para otra vez.
//
// Van en el orden en que se rechazaron, como en la cola (1.7.0): el alta de una
// fila antes que su cambio. La pantalla las muestra al reves (lo ultimo arriba).
// Un reintento que falla cambia el motivo pero no la fecha: si no, el orden se
// perdia.
export async function reintentar(
  db: AbstractPowerSyncDatabase,
  ids: string[],
): Promise<ResultadoReintento> {
  const res: ResultadoReintento = { reintentadas: 0, fallidas: 0 }
  if (ids.length === 0) return res
  const filas = await db.getAll<Rechazada>(
    `SELECT * FROM subidas_rechazadas WHERE id IN (${ids.map(() => "?").join(",")})
     ORDER BY rechazada_en, id`,
    ids,
  )
  for (const fila of filas) {
    const id = fila.id

    const s: Subida = {
      tabla: fila.tabla,
      // `op` se guardo como el string del enum ("PUT"/"PATCH"/"DELETE").
      op: fila.op as UpdateType,
      id: fila.fila_id,
      datos: JSON.parse(fila.datos),
    }
    const r = await subir(s)
    if (r.ok) {
      await db.execute("DELETE FROM subidas_rechazadas WHERE id = ?", [id])
      res.reintentadas++
    } else {
      await db.execute("UPDATE subidas_rechazadas SET motivo = ? WHERE id = ?", [r.motivo, id])
      res.fallidas++
    }
  }
  return res
}
