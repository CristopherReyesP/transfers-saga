import type { TransferStatus } from './transfer.js';

export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidAmount extends DomainError {}
export class InvalidCurrency extends DomainError {}
export class CurrencyMismatch extends DomainError {}
export class InsufficientFunds extends DomainError {}

export class InvalidTransferTransition extends DomainError {
  constructor(from: TransferStatus, to: TransferStatus) {
    super(`Invalid transfer transition from ${from} to ${to}`);
  }
}
