import pg from 'pg';
const globalDb = globalThis as unknown as { atlasPool?: pg.Pool };
export const pool = globalDb.atlasPool ?? new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/curieus_atlas', max: 8, connectionTimeoutMillis: 10000 });
if (process.env.NODE_ENV !== 'production') globalDb.atlasPool = pool;
export const query = (sql: string, params: unknown[] = []) => pool.query(sql, params);
