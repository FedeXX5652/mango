#!/usr/bin/env node
// Banco de compatibilidad, cara MANUAL: sirve el frontend de una version
// anterior apuntando a la API de hoy, para el smoke ocasional donde el banco de
// payloads (backend/tests/api/test_compat.py) no llega — sobre todo la
// migracion de la base local que hace PowerSync cuando cambia el AppSchema.
//
// El banco de payloads es el verificador de todos los dias (corre en make test).
// Esto es para cuando hace falta ver el cliente viejo ENTERO contra el servidor
// nuevo, no solo la forma de sus payloads. Se corre a mano, rara vez.
//
// Uso:
//   node scripts/banco-compat.mjs <git-ref>
//   node scripts/banco-compat.mjs HEAD~1      # una version atras
//
// Deja el build viejo servido en http://localhost:4180 apuntando a la API de
// localhost:8000 y PowerSync de localhost:8080. Ctrl-C para terminar y limpiar.
//
// Requiere el stack de datos y el backend de HOY corriendo (make dev + uvicorn).

import { execSync, spawn } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ref = process.argv[2]
if (!ref) {
  console.error("Falta el git-ref. Ej: node scripts/banco-compat.mjs HEAD~1")
  process.exit(1)
}

const PUERTO = 4180
const raiz = execSync("git rev-parse --show-toplevel").toString().trim()
const worktree = mkdtempSync(join(tmpdir(), "mango-compat-"))

function sh(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit" })
}

function limpiar() {
  try {
    execSync(`git worktree remove --force "${worktree}"`, { cwd: raiz })
  } catch {
    rmSync(worktree, { recursive: true, force: true })
  }
}

process.on("SIGINT", () => {
  console.log("\nLimpiando worktree…")
  limpiar()
  process.exit(0)
})

try {
  console.log(`Checkout de ${ref} en ${worktree}`)
  sh(`git worktree add --detach "${worktree}" ${ref}`, raiz)

  const front = join(worktree, "frontend")

  // Apunta el build viejo a la API de hoy. `.env.local` gana sobre `.env`.
  writeFileSync(
    join(front, ".env.local"),
    "VITE_API_URL=http://localhost:8000\nVITE_POWERSYNC_URL=http://localhost:8080\n",
  )

  // Install + build del cliente viejo. Es lento: baja sus propias deps, que es
  // justo el punto — es el cliente de esa version, no el de hoy con otro código.
  console.log("Instalando dependencias de esa version (esto tarda)…")
  sh("npm ci", front)
  console.log("Compilando…")
  sh("npm run build", front)

  console.log(`\nCliente viejo servido en http://localhost:${PUERTO}`)
  console.log("Cargá un movimiento ahí, mirá que suba, y verificá en Postgres.")
  console.log("Ctrl-C para terminar.\n")
  const preview = spawn("npm", ["run", "preview", "--", "--port", String(PUERTO)], {
    cwd: front,
    stdio: "inherit",
    shell: true,
  })
  preview.on("exit", () => {
    limpiar()
    process.exit(0)
  })
} catch (e) {
  console.error("Falló:", e.message)
  limpiar()
  process.exit(1)
}
