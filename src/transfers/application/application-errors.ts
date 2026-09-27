import { DomainError } from '../domain/domain-errors.js';

export class AccountLocked extends DomainError {
  constructor(readonly accountId: string) {
    super(`Account ${accountId} is locked by another operation`);
  }
}

export class AccountNotFound extends DomainError {
  constructor(readonly accountId: string) {
    super(`Account ${accountId} does not exist`);
  }
}

export class DuplicateIdempotencyKey extends DomainError {
  constructor(readonly idempotencyKey: string) {
    super(`A transfer with idempotency key ${idempotencyKey} already exists`);
  }
}

export class IdempotencyKeyReused extends DomainError {
  constructor(readonly idempotencyKey: string) {
    super(
      `Idempotency key ${idempotencyKey} was already used with a different payload`,
    );
  }
}

export class TransferInProgress extends DomainError {
  constructor(readonly idempotencyKey: string) {
    super(
      `The transfer for idempotency key ${idempotencyKey} is still in progress`,
    );
  }
}

export class TransferNotFound extends DomainError {
  constructor(readonly transferId: string) {
    super(`Transfer ${transferId} does not exist`);
  }
}

export class CreditRejected extends DomainError {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export class CreditTimeout extends DomainError {
  constructor(readonly reference: string) {
    super(`The credit for reference ${reference} timed out`);
  }
}
