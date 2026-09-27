import type { Transfer } from '../../domain/transfer.js';

export interface TransferRepository {
  /** Throws DuplicateIdempotencyKey when the key is already reserved. */
  insert(transfer: Transfer, idempotencyKey: string): Promise<void>;
  save(transfer: Transfer): Promise<void>;
  findById(id: string): Promise<Transfer | null>;
  findByIdempotencyKey(key: string): Promise<Transfer | null>;
}
