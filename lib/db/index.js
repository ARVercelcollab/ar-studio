// Conexión a la base de datos.
//
// - En producción (Vercel) usa Postgres con DATABASE_URL (por ejemplo, Neon).
// - En desarrollo, si no hay DATABASE_URL, usa PGlite: un Postgres de verdad que
//   vive en la carpeta .data/pglite, sin instalar nada. Con PGLITE_DIR=memoria
//   se queda en memoria (lo usan las pruebas).
//
// Al primer uso aplica las migraciones que falten (lib/db/migraciones.js).

import { MIGRACIONES } from './migraciones.js'

const CLAVE_BLOQUEO_MIGRACION = 7271001

function normalizar(resultado) {
  return { rows: resultado.rows, rowCount: resultado.rowCount ?? resultado.affectedRows ?? 0 }
}

async function conectarPostgres(url) {
  const { default: pg } = await import('pg')
  const local = /localhost|127\.0\.0\.1/.test(url)
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DB_MAX_CONEXIONES || 3),
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  })
  return {
    tipo: 'postgres',
    async query(texto, valores) {
      return normalizar(await pool.query(texto, valores))
    },
    async exec(texto) {
      await pool.query(texto)
    },
    async transaction(fn) {
      const cliente = await pool.connect()
      try {
        await cliente.query('BEGIN')
        const tx = {
          query: async (t, v) => normalizar(await cliente.query(t, v)),
          exec: async (t) => { await cliente.query(t) },
        }
        const r = await fn(tx)
        await cliente.query('COMMIT')
        return r
      } catch (e) {
        await cliente.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        cliente.release()
      }
    },
    async cerrar() {
      await pool.end()
    },
  }
}

async function conectarPglite() {
  // webpackIgnore: PGlite solo se usa en local; así no entra en el paquete de producción
  const { PGlite } = await import(/* webpackIgnore: true */ '@electric-sql/pglite')
  const dir = process.env.PGLITE_DIR || '.data/pglite'
  const db = dir === 'memoria' ? new PGlite() : new PGlite(dir)
  await db.waitReady
  return {
    tipo: 'pglite',
    async query(texto, valores) {
      return normalizar(await db.query(texto, valores))
    },
    async exec(texto) {
      await db.exec(texto)
    },
    async transaction(fn) {
      return db.transaction((tx) =>
        fn({
          query: async (t, v) => normalizar(await tx.query(t, v)),
          exec: async (t) => { await tx.exec(t) },
        })
      )
    },
    async cerrar() {
      await db.close()
    },
  }
}

async function migrar(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS migraciones (
    version integer PRIMARY KEY,
    nombre text NOT NULL,
    aplicada_en timestamptz NOT NULL DEFAULT now()
  )`)
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [CLAVE_BLOQUEO_MIGRACION])
    const { rows } = await tx.query('SELECT coalesce(max(version), 0) AS v FROM migraciones')
    const actual = Number(rows[0].v)
    for (const m of MIGRACIONES) {
      if (m.version <= actual) continue
      await tx.exec(m.sql)
      await tx.query('INSERT INTO migraciones (version, nombre) VALUES ($1, $2)', [m.version, m.nombre])
    }
  })
}

async function crear() {
  const url = process.env.DATABASE_URL
  let db
  if (url) {
    db = await conectarPostgres(url)
  } else {
    if (process.env.VERCEL_ENV === 'production') {
      throw new Error('Falta DATABASE_URL: las reservas necesitan una base de datos en producción.')
    }
    db = await conectarPglite()
  }
  await migrar(db)
  return db
}

// Una sola conexión por proceso (en desarrollo, Next recarga módulos: se guarda en globalThis)
export function db() {
  if (!globalThis.__arStudioDb) {
    globalThis.__arStudioDb = crear().catch((e) => {
      globalThis.__arStudioDb = null
      throw e
    })
  }
  return globalThis.__arStudioDb
}

export async function query(texto, valores) {
  return (await db()).query(texto, valores)
}

export async function transaction(fn) {
  return (await db()).transaction(fn)
}

// Solo para pruebas y scripts
export async function cerrarDb() {
  if (!globalThis.__arStudioDb) return
  const d = await globalThis.__arStudioDb
  globalThis.__arStudioDb = null
  await d.cerrar()
}
