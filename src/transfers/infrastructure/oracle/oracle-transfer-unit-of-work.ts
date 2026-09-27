import type { Pool } from 'oracledb';
import type { AccountRepository } from '../../application/ports/account-repository.js';
import type { TransferRepository } from '../../application/ports/transfer-repository.js';
import type { TransferUnitOfWork } from '../../application/ports/transfer-unit-of-work.js';
import { OracleAccountRepository } from './oracle-account-repository.js';
import { OracleTransferRepository } from './oracle-transfer-repository.js';

/**
 * Runs each unit of work on its own pooled connection with autoCommit off:
 * commit on success, roll back on any error, and always release the connection.
 */
export class OracleTransferUnitOfWork implements TransferUnitOfWork {
  constructor(private readonly pool: Pool) {}

  async run<T>(
    work: (repos: {
      accounts: AccountRepository;
      transfers: TransferRepository;
    }) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      const result = await work({
        accounts: new OracleAccountRepository(connection),
        transfers: new OracleTransferRepository(connection),
      });
      await connection.commit();
      return result;
    } catch (error) {
      // The caller needs the original failure, not a rollback error; releasing
      // the connection to the pool rolls back an open transaction anyway.
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      await connection.close();
    }
  }
}
