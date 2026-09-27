import type { Account } from '../../domain/account.js';

export interface AccountRepository {
  /** Throws AccountLocked for a busy row, or AccountNotFound for a missing row. */
  getForUpdate(id: string): Promise<Account>;
  save(account: Account): Promise<void>;
}
