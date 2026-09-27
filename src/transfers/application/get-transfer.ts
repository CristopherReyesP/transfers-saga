import type { Transfer } from '../domain/transfer.js';
import { TransferNotFound } from './application-errors.js';
import type { TransferUnitOfWork } from './ports/transfer-unit-of-work.js';

export class GetTransfer {
  constructor(private readonly uow: TransferUnitOfWork) {}

  async execute(id: string): Promise<Transfer> {
    return this.uow.run(async ({ transfers }) => {
      const transfer = await transfers.findById(id);
      if (!transfer) throw new TransferNotFound(id);
      return transfer;
    });
  }
}
