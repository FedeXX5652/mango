// Tipos minimos de `node:sqlite` (viene con Node 22.13+ / 24) para probar el SQL
// que corre en el SQLite del dispositivo (lib/lente, lib/saldos) contra un
// SQLite de verdad. El proyecto no trae @types/node y para esto no hace falta:
// solo lo que usan los tests.
declare module "node:sqlite" {
  interface StatementSync {
    all(...params: unknown[]): Record<string, unknown>[]
    get(...params: unknown[]): Record<string, unknown> | undefined
    run(...params: unknown[]): unknown
  }
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
