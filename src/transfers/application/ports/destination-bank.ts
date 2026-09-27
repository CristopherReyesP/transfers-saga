import type { Money } from '../../domain/money.js';

export interface DestinationBankPort {
  /** Idempotent by reference; throws CreditRejected or CreditTimeout. */
  credit(request: {
    reference: string;
    destinationAccount: string;
    amount: Money;
  }): Promise<void>;
  getCreditStatus(
    reference: string,
  ): Promise<'CREDITED' | 'REJECTED' | 'UNKNOWN'>;
}
