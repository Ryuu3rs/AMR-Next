import { fileURLToPath } from "node:url"
import { Pool } from "pg"
import { runMigrations } from "./migration-runner.js"
import { resolveDatabaseUrl } from "./postgres-store.js"

const migrationsDir = fileURLToPath(new URL("../db/migrations", import.meta.url))
const databaseUrl = resolveDatabaseUrl()
const pool = new Pool({ connectionString: databaseUrl })

try {
    const result = await runMigrations(pool, migrationsDir)
    console.log(`[db:init] migrations applied=${result.applied.length} skipped=${result.skipped.length}`)
    if (result.applied.length) {
        console.log(`[db:init] applied: ${result.applied.join(", ")}`)
    }
} finally {
    await pool.end()
}
