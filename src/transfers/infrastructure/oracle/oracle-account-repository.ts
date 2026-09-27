import type { Connection } from 'oracledb';
import { AccountNotFound } from '../../application/application-errors.js';
import type { AccountRepository } from '../../application/ports/account-repository.js';
import { Account } from '../../domain/account.js';
import { Money } from '../../domain/money.js';
import { rethrowOracleError } from './oracle-error-mapper.js';
import { OBJECT_ROWS, toMinorUnits } from './oracle-rows.js';

interface AccountRow {
  ID: string;
  BALANCE_MINOR: number;
  CURRENCY: string;
}

export class OracleAccountRepository implements AccountRepository {
  constructor(private readonly connection: Connection) {}

  /** Locks the row with `SELECT ... FOR UPDATE NOWAIT` so a busy row fails fast. */
  async getForUpdate(id: string): Promise<Account> {
    const result = await this.connection
      .execute<AccountRow>(
        `SELECT id, balance_minor, currency
           FROM accounts
          WHERE id = :id
            FOR UPDATE NOWAIT`,
        { id },
        OBJECT_ROWS,
      )
      .catch((error: unknown) => rethrowOracleError(error, id));
    const row = result.rows?.[0];
    if (!row) throw new AccountNotFound(id);
    return new Account(
      row.ID,
      Money.of(toMinorUnits(row.BALANCE_MINOR), row.CURRENCY),
    );
  }

  async save(account: Account): Promise<void> {
    await this.connection.execute(
      `UPDATE accounts
          SET balance_minor = :balanceMinor, updated_at = SYSTIMESTAMP
        WHERE id = :id`,
      { id: account.id, balanceMinor: account.balance.minorUnits },
    );
  }
}
