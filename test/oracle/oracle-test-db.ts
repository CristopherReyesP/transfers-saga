import oracledb, { type Pool } from 'oracledb';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import type { OracleConnectionInfo } from './global-setup.js';

/** Opens a pool per spec file and empties the tables before every test. */
export function useOracleTestDb(): { readonly pool: Pool } {
  let pool: Pool | undefined;
  beforeAll(async () => {
    const connection: OracleConnectionInfo = inject('oracle');
    pool = await oracledb.createPool({ ...connection, poolMax: 4 });
  });
  beforeEach(async () => {
    await execute(requirePool(), [
      'DELETE FROM transfers',
      'DELETE FROM accounts',
    ]);
  });
  afterAll(async () => {
    await pool?.close(0);
  });
  const requirePool = (): Pool => {
    if (!pool) throw new Error('The Oracle test pool is not open');
    return pool;
  };
  return {
    get pool() {
      return requirePool();
    },
  };
}

async function execute(pool: Pool, statements: string[]): Promise<void> {
  const connection = await pool.getConnection();
  try {
    for (const statement of statements) await connection.execute(statement);
    await connection.commit();
  } finally {
    await connection.close();
  }
}

export async function seedAccount(
  pool: Pool,
  id: string,
  balanceMinor: number,
  currency: string,
): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.execute(
      `INSERT INTO accounts (id, balance_minor, currency)
       VALUES (:id, :balanceMinor, :currency)`,
      { id, balanceMinor, currency },
      { autoCommit: true },
    );
  } finally {
    await connection.close();
  }
}

export async function readBalance(pool: Pool, id: string): Promise<number> {
  const connection = await pool.getConnection();
  try {
    const result = await connection.execute<{ BALANCE_MINOR: number }>(
      'SELECT balance_minor FROM accounts WHERE id = :id',
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    if (!row) throw new Error(`Account ${id} does not exist`);
    return row.BALANCE_MINOR;
  } finally {
    await connection.close();
  }
}
