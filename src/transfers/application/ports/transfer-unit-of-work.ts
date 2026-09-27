import type { AccountRepository } from './account-repository.js';
import type { TransferRepository } from './transfer-repository.js';

export interface TransferUnitOfWork {
  /** All writes commit together on resolution and roll back on rejection. */
  run<T>(
    work: (repos: {
      accounts: AccountRepository;
      transfers: TransferRepository;
    }) => Promise<T>,
  ): Promise<T>;
}
