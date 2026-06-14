import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { Pool } from "pg"

export type MigrationRunResult = {
    applied: string[]
    skipped: string[]
}

const ensureMigrationsTable = async (pool: Pool): Promise<void> => {
    await pool.query(
        `create table if not exists schema_migration (
      name text primary key,
      applied_at timestamptz not null default now()
    )`
    )
}

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<MigrationRunResult> {
    await ensureMigrationsTable(pool)
    const files = (await readdir(migrationsDir))
        .filter(name => /^\d+.*\.sql$/i.test(name))
        .sort((a, b) => a.localeCompare(b))

    const applied: string[] = []
    const skipped: string[] = []

    for (const fileName of files) {
        const alreadyApplied = await pool.query("select 1 from schema_migration where name = $1 limit 1", [fileName])
        if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
            skipped.push(fileName)
            continue
        }

        const sql = await readFile(join(migrationsDir, fileName), "utf8")
        const client = await pool.connect()

        try {
            await client.query("begin")
            await client.query(sql)
            await client.query("insert into schema_migration (name) values ($1)", [fileName])
            await client.query("commit")
            applied.push(fileName)
        } catch (error) {
            await client.query("rollback")
            throw error
        } finally {
            client.release()
        }
    }

    return { applied, skipped }
}
