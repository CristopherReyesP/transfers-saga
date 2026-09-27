import { randomUUID } from 'node:crypto';
import { InsufficientFunds } from '../domain/domain-errors.js';
import { Money } from '../domain/money.js';
import { Transfer } from '../domain/transfer.js';
import {
  AccountLocked,
  CreditRejected,
  CreditTimeout,
  DuplicateIdempotencyKey,
  IdempotencyKeyReused,
  TransferInProgress,
} from './application-errors.js';
import type { DestinationBankPort } from './ports/destination-bank.js';
import type { TransferUnitOfWork } from './ports/transfer-unit-of-work.js';

export interface ExecuteTransferCommand {
  idempotencyKey: string;
  sourceAccountId: string;
  destinationAccount: string;
  amount: { minorUnits: number; currency: string };
}

export class ExecuteTransfer {
  constructor(
    private readonly uow: TransferUnitOfWork,
    private readonly bank: DestinationBankPort,
    private readonly newId: () => string = randomUUID,
  ) {}

  async execute(command: ExecuteTransferCommand): Promise<Transfer> {
    const existing = await this.replay(command);
    if (existing) return existing;
    const transfer = await this.debit(command);
    return transfer.isTerminal() ? transfer : this.credit(transfer);
  }

  private async replay(
    command: ExecuteTransferCommand,
  ): Promise<Transfer | null> {
    const transfer = await this.uow.run(({ transfers }) =>
      transfers.findByIdempotencyKey(command.idempotencyKey),
    );
    if (!transfer) return null;
    if (
      transfer.sourceAccountId !== command.sourceAccountId ||
      transfer.destinationAccount !== command.destinationAccount ||
      transfer.amount.minorUnits !== command.amount.minorUnits ||
      transfer.amount.currency !== command.amount.currency
    ) {
      throw new IdempotencyKeyReused(command.idempotencyKey);
    }
    if (!transfer.isTerminal()) {
      throw new TransferInProgress(command.idempotencyKey);
    }
    return transfer;
  }

  private async debit(command: ExecuteTransferCommand): Promise<Transfer> {
    try {
      return await this.uow.run(async ({ accounts, transfers }) => {
        const transfer = Transfer.request({
          id: this.newId(),
          sourceAccountId: command.sourceAccountId,
          destinationAccount: command.destinationAccount,
          amount: Money.of(command.amount.minorUnits, command.amount.currency),
        });
        const account = await accounts.getForUpdate(transfer.sourceAccountId);
        try {
          account.debit(transfer.amount);
        } catch (error) {
          if (!(error instanceof InsufficientFunds)) throw error;
          transfer.markFailed(error.message);
          await transfers.insert(transfer, command.idempotencyKey);
          return transfer;
        }
        transfer.markDebited();
        await accounts.save(account);
        await transfers.insert(transfer, command.idempotencyKey);
        return transfer;
      });
    } catch (error) {
      if (error instanceof DuplicateIdempotencyKey) {
        throw new TransferInProgress(command.idempotencyKey);
      }
      throw error;
    }
  }

  private async credit(transfer: Transfer): Promise<Transfer> {
    try {
      await this.bank.credit({
        reference: transfer.id,
        destinationAccount: transfer.destinationAccount,
        amount: transfer.amount,
      });
    } catch (error) {
      if (error instanceof CreditRejected) {
        return this.compensate(transfer, error.reason);
      }
      if (error instanceof CreditTimeout) return this.resolveTimeout(transfer);
      throw error;
    }
    return this.complete(transfer);
  }

  private async complete(transfer: Transfer): Promise<Transfer> {
    return this.uow.run(async ({ transfers }) => {
      transfer.markCompleted();
      await transfers.save(transfer);
      return transfer;
    });
  }

  private async resolveTimeout(transfer: Transfer): Promise<Transfer> {
    const status = await this.bank.getCreditStatus(transfer.id);
    if (status === 'CREDITED') return this.complete(transfer);
    if (status === 'REJECTED') {
      return this.compensate(transfer, 'Destination rejected the credit');
    }
    return transfer;
  }

  private async compensate(
    transfer: Transfer,
    reason: string,
  ): Promise<Transfer> {
    await this.uow.run(async ({ transfers }) => {
      transfer.startCompensation(reason);
      await transfers.save(transfer);
    });
    try {
      return await this.uow.run(async ({ accounts, transfers }) => {
        const account = await accounts.getForUpdate(transfer.sourceAccountId);
        account.credit(transfer.amount);
        transfer.markReversed();
        await accounts.save(account);
        await transfers.save(transfer);
        return transfer;
      });
    } catch (error) {
      // The lock fails before any mutation, so the transfer still matches
      // the committed COMPENSATING state and can be retried later.
      if (error instanceof AccountLocked) return transfer;
      throw error;
    }
  }
}
