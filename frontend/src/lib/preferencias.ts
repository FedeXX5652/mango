import { db } from "@/lib/powersync/db"
import { usuarioActualId } from "@/lib/sesion"

// Las preferencias del usuario, leidas y escritas **en la base local**.
//
// Antes vivian solo en el servidor: se leian con `GET /users/me` y se guardaban
// con un PATCH, asi que cambiar el tema o la moneda base sin conexion no se
// podia, y no viajaban entre dispositivos. Desde que `users` entra a la
// sincronizacion —con las columnas contadas, sin el hash de la contraseña— son
// una tabla mas: se escriben local y suben cuando haya red.
//
// La fila es siempre una sola: la sync manda `WHERE id = auth.user_id()`.

export type EsquemaColor = "light" | "dark" | "system"

export interface Preferencias {
  id: string
  display_name: string
  base_currency: string
  theme_id: string
  color_scheme: EsquemaColor
  // Monedas que el usuario carga a mano (ver 0005). En Postgres es JSONB, asi
  // que baja como texto y se parsea aca.
  fx_manual: string[]
}

interface Fila {
  id: string
  display_name: string
  base_currency: string
  theme_id: string
  color_scheme: string
  fx_manual: string | null
}

// SIEMPRE filtrado por mi id: desde 3b la tabla `users` local tiene tambien el
// perfil de los otros miembros del grupo. Sin el WHERE, se leeria (o peor, con
// el UPDATE, se pisaria) la fila de otra persona.
const SQL =
  "SELECT id, display_name, base_currency, theme_id, color_scheme, fx_manual FROM users WHERE id = ?"

function aPreferencias(f: Fila): Preferencias {
  let manuales: string[] = []
  try {
    const x = f.fx_manual ? JSON.parse(f.fx_manual) : []
    if (Array.isArray(x)) manuales = x.map(String)
  } catch {
    // Texto que no es JSON: se trata como "ninguna manual" en vez de romper la
    // pantalla. Es una preferencia, no un dato contable.
  }
  return {
    id: f.id,
    display_name: f.display_name,
    base_currency: f.base_currency,
    theme_id: f.theme_id,
    color_scheme: (["light", "dark", "system"] as const).includes(f.color_scheme as EsquemaColor)
      ? (f.color_scheme as EsquemaColor)
      : "system",
    fx_manual: manuales,
  }
}

// Una lectura suelta. Devuelve null si la fila todavia no bajo (primer arranque
// del dispositivo, antes de la primera sincronizacion) o si no hay sesion.
export async function leerPreferencias(): Promise<Preferencias | null> {
  const mi = usuarioActualId()
  if (!mi) return null
  const filas = await db.getAll<Fila>(SQL, [mi])
  return filas.length > 0 ? aPreferencias(filas[0]) : null
}

// Avisa con las preferencias actuales y cada vez que cambian, vengan de esta
// pantalla o de otro dispositivo. Devuelve la funcion para dejar de escuchar.
export function observarPreferencias(alCambiar: (p: Preferencias) => void): () => void {
  const mi = usuarioActualId()
  if (!mi) return () => {}
  const control = new AbortController()
  db.watch(
    SQL,
    [mi],
    {
      onResult: (r) => {
        const filas = (r.rows?._array ?? []) as Fila[]
        if (filas.length > 0) alCambiar(aPreferencias(filas[0]))
      },
    },
    { tables: ["users"], signal: control.signal },
  )
  return () => control.abort()
}

type Campos = Partial<Pick<Preferencias, "display_name" | "base_currency" | "theme_id">> & {
  color_scheme?: EsquemaColor
  fx_manual?: string[]
}

// Escribe local; la sync lo sube despues. Sin fila todavia no hace nada: crear
// el usuario no es cosa del cliente.
export async function guardarPreferencias(campos: Campos): Promise<void> {
  const mi = usuarioActualId()
  if (!mi) return
  const entradas = Object.entries(campos).filter(([, v]) => v !== undefined)
  if (entradas.length === 0) return

  const sets = entradas.map(([k]) => `${k} = ?`).join(", ")
  const valores = entradas.map(([k, v]) => (k === "fx_manual" ? JSON.stringify(v) : (v as string)))
  // WHERE id = mi: nunca tocar la fila de otro miembro (ver SQL arriba).
  await db.execute(`UPDATE users SET ${sets} WHERE id = ?`, [...valores, mi])
}
