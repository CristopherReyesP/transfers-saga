import { Account } from '../../domain/account.js';
import type { Money } from '../../domain/money.js';
import { Transfer, type TransferStatus } from '../../domain/transfer.js';
import {
  AccountLocked,
  AccountNotFound,
  DuplicateIdempotencyKey,
} from '../application-errors.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { TransferRepository } from '../ports/transfer-repository.js';
import type { TransferUnitOfWork } from '../ports/transfer-unit-of-work.js';

// Stored transfers are snapshot copies, so callers never mutate committed state.
export class InMemoryTransferStore implements TransferUnitOfWork {
  private readonly accounts = new Map<string, Money>();
  private readonly transfers = new Map<string, Transfer>();
  private readonly keys = new Map<string, string>();
  private readonly lockedAccounts = new Set<string>();
  private activeRuns = 0;

  get transactionActive(): boolean {
    return this.activeRuns > 0;
  }

  seedAccount(account: Account): void {
    this.accounts.set(account.id, account.balance);
  }

  lockAccount(id: string): void {
    this.lockedAccounts.add(id);
  }

  getCommittedBalance(id: string): Money | undefined {
    return this.accounts.get(id);
  }

  getCommittedTransferStatus(id: string): TransferStatus | undefined {
    return this.transfers.get(id)?.status;
  }

  async run<T>(
    work: (repos: {
      accounts: AccountRepository;
      transfers: TransferRepository;
    }) => Promise<T>,
  ): Promise<T> {
    const accountWrites = new Map<string, Money>();
    const transferWrites = new Map<string, Transfer>();
    const keyWrites = new Map<string, string>();
    const readTransfer = (id: string): Transfer | null => {
      const transfer = transferWrites.get(id) ?? this.transfers.get(id);
      return transfer ? Transfer.rehydrate(transfer) : null;
    };
    this.activeRuns += 1;
    try {
      const result = await work({
        accounts: {
          getForUpdate: async (id) => {
            if (this.lockedAccounts.has(id)) throw new AccountLocked(id);
            const balance = accountWrites.get(id) ?? this.accounts.get(id);
            if (!balance) throw new AccountNotFound(id);
            return new Account(id, balance);
          },
          save: async (account) => {
            accountWrites.set(account.id, account.balance);
          },
        },
        transfers: {
          insert: async (transfer, key) => {
            if (keyWrites.has(key) || this.keys.has(key)) {
              throw new DuplicateIdempotencyKey(key);
            }
            keyWrites.set(key, transfer.id);
            transferWrites.set(transfer.id, Transfer.rehydrate(transfer));
          },
          save: async (transfer) => {
            transferWrites.set(transfer.id, Transfer.rehydrate(transfer));
          },
          findById: async (id) => readTransfer(id),
          findByIdempotencyKey: async (key) => {
            const id = keyWrites.get(key) ?? this.keys.get(key);
            return id === undefined ? null : readTransfer(id);
          },
        },
      });
      for (const key of keyWrites.keys()) {
        if (this.keys.has(key)) throw new DuplicateIdempotencyKey(key);
      }
      for (const [id, balance] of accountWrites) this.accounts.set(id, balance);
      for (const [id, transfer] of transferWrites)
        this.transfers.set(id, transfer);
      for (const [key, id] of keyWrites) this.keys.set(key, id);
      return result;
    } finally {
      this.activeRuns -= 1;
    }
  }
}
