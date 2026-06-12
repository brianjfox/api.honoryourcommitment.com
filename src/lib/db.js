import pg from 'pg'
import { config } from '../config.js'

// Single shared connection pool. Postgres should be bound to localhost
// in production and never exposed to the public internet.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
})

export const query = (text, params) => pool.query(text, params)

export async function closePool() {
  await pool.end()
}
