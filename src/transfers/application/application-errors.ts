import { DomainError } from '../domain/domain-errors.js';

export class AccountLocked extends DomainError {}
export class AccountNotFound extends DomainError {}
export class DuplicateIdempotencyKey extends DomainError {}
export class IdempotencyKeyReused extends DomainError {}
export class TransferInProgress extends DomainError {}
export class TransferNotFound extends DomainError {}

export class CreditRejected extends DomainError {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export class CreditTimeout extends DomainError {}
