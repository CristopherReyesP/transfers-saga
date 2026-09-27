import {
  AccountLocked,
  AccountNotFound,
  CreditTimeout,
  DuplicateIdempotencyKey,
  IdempotencyKeyReused,
  TransferInProgress,
  TransferNotFound,
} from './application-errors.js';

// These messages become the `detail` of HTTP problem responses, so they must
// read as sentences, not as bare identifiers.
describe('application errors', () => {
  it.each([
    [
      new AccountLocked('acc-1'),
      'Account acc-1 is locked by another operation',
    ],
    [new AccountNotFound('acc-1'), 'Account acc-1 does not exist'],
    [
      new DuplicateIdempotencyKey('key-1'),
      'A transfer with idempotency key key-1 already exists',
    ],
    [
      new IdempotencyKeyReused('key-1'),
      'Idempotency key key-1 was already used with a different payload',
    ],
    [
      new TransferInProgress('key-1'),
      'The transfer for idempotency key key-1 is still in progress',
    ],
    [new TransferNotFound('tr-1'), 'Transfer tr-1 does not exist'],
    [new CreditTimeout('tr-1'), 'The credit for reference tr-1 timed out'],
  ])('%o describes itself', (error, message) => {
    expect(error.message).toBe(message);
  });

  it('keeps the identifiers as typed properties', () => {
    expect(new AccountLocked('acc-1').accountId).toBe('acc-1');
    expect(new AccountNotFound('acc-1').accountId).toBe('acc-1');
    expect(new DuplicateIdempotencyKey('key-1').idempotencyKey).toBe('key-1');
    expect(new IdempotencyKeyReused('key-1').idempotencyKey).toBe('key-1');
    expect(new TransferInProgress('key-1').idempotencyKey).toBe('key-1');
    expect(new TransferNotFound('tr-1').transferId).toBe('tr-1');
    expect(new CreditTimeout('tr-1').reference).toBe('tr-1');
  });
});
