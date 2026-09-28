import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import oracledb, { type Pool } from 'oracledb';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import type { DestinationBankPort } from '../../src/transfers/application/ports/destination-bank.js';
import {
  DESTINATION_BANK,
  ORACLE_POOL,
} from '../../src/transfers/transfers.tokens.js';

export const transferBody = (
  overrides: Partial<{
    sourceAccountId: string;
    destinationAccount: string;
    minorUnits: number;
    currency: string;
  }> = {},
) => ({
  sourceAccountId: overrides.sourceAccountId ?? 'source-1',
  destinationAccount: overrides.destinationAccount ?? 'destination-1',
  amount: {
    minorUnits: overrides.minorUnits ?? 300,
    currency: overrides.currency ?? 'USD',
  },
});

/**
 * Boots the real AppModule against the test container. The app gets its own
 * pool because it closes that pool on shutdown, while the spec's pool from
 * useOracleTestDb stays open for seeding and assertions.
 */
export async function startTransfersApp(
  overrides: { bank?: DestinationBankPort } = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ORACLE_POOL)
    .useFactory({
      factory: () => oracledb.createPool({ ...inject('oracle'), poolMax: 8 }),
    });
  if (overrides.bank) {
    builder = builder
      .overrideProvider(DESTINATION_BANK)
      .useValue(overrides.bank);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  // A listening server lets concurrent supertest requests share one port.
  await app.listen(0);
  return app;
}

/**
 * Opens `sessions` idle connections in the app's pool. A cold pool creates a
 * session per request, and that takes longer than a whole transfer, so
 * "concurrent" requests would otherwise run one after the other.
 */
export async function warmAppPool(
  app: INestApplication,
  sessions: number,
): Promise<void> {
  const pool = app.get<Pool>(ORACLE_POOL);
  const connections = await Promise.all(
    Array.from({ length: sessions }, () => pool.getConnection()),
  );
  await Promise.all(connections.map((connection) => connection.close()));
}

export async function countTransfers(pool: Pool): Promise<number> {
  const connection = await pool.getConnection();
  try {
    const result = await connection.execute<{ TOTAL: number }>(
      'SELECT COUNT(*) AS total FROM transfers',
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return result.rows?.[0]?.TOTAL ?? 0;
  } finally {
    await connection.close();
  }
}

/** Locks the account row from another session; call the result to release it. */
export async function holdRowLock(
  pool: Pool,
  accountId: string,
): Promise<() => Promise<void>> {
  const connection = await pool.getConnection();
  await connection.execute(
    'SELECT id FROM accounts WHERE id = :id FOR UPDATE',
    { id: accountId },
  );
  return async () => {
    try {
      await connection.rollback();
    } finally {
      await connection.close();
    }
  };
}
