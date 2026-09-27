import { InvalidAmount, InvalidTransferTransition } from './domain-errors.js';
import type { Money } from './money.js';

export type TransferStatus =
  'PENDING' | 'DEBITED' | 'COMPLETED' | 'COMPENSATING' | 'REVERSED' | 'FAILED';

export interface TransferRequest {
  id: string;
  sourceAccountId: string;
  destinationAccount: string;
  amount: Money;
}

export interface TransferSnapshot extends TransferRequest {
  status: TransferStatus;
  failureReason?: string;
}

export class Transfer {
  private statusValue: TransferStatus = 'PENDING';
  private failureReasonValue: string | undefined;

  private constructor(
    private readonly idValue: string,
    private readonly sourceAccountIdValue: string,
    private readonly destinationAccountValue: string,
    private readonly amountValue: Money,
  ) {}

  static request(request: TransferRequest): Transfer {
    if (request.amount.isZero()) {
      throw new InvalidAmount('Transfer amount must be greater than zero');
    }
    return new Transfer(
      request.id,
      request.sourceAccountId,
      request.destinationAccount,
      request.amount,
    );
  }

  /** Restores a persisted transfer without replaying its transitions. */
  static rehydrate(snapshot: TransferSnapshot): Transfer {
    const transfer = Transfer.request(snapshot);
    transfer.statusValue = snapshot.status;
    transfer.failureReasonValue = snapshot.failureReason;
    return transfer;
  }

  markDebited(): void {
    this.transition('PENDING', 'DEBITED');
  }

  markCompleted(): void {
    this.transition('DEBITED', 'COMPLETED');
  }

  startCompensation(reason: string): void {
    this.transition('DEBITED', 'COMPENSATING');
    this.failureReasonValue = reason;
  }

  markReversed(): void {
    this.transition('COMPENSATING', 'REVERSED');
  }

  markFailed(reason: string): void {
    this.transition('PENDING', 'FAILED');
    this.failureReasonValue = reason;
  }

  isTerminal(): boolean {
    return (
      this.status === 'COMPLETED' ||
      this.status === 'REVERSED' ||
      this.status === 'FAILED'
    );
  }

  private transition(from: TransferStatus, to: TransferStatus): void {
    if (this.status !== from) {
      throw new InvalidTransferTransition(this.status, to);
    }
    this.statusValue = to;
  }

  get id(): string {
    return this.idValue;
  }

  get status(): TransferStatus {
    return this.statusValue;
  }

  get amount(): Money {
    return this.amountValue;
  }

  get sourceAccountId(): string {
    return this.sourceAccountIdValue;
  }

  get destinationAccount(): string {
    return this.destinationAccountValue;
  }

  get failureReason(): string | undefined {
    return this.failureReasonValue;
  }
}
