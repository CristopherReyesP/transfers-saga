import {
  AccountLocked,
  DuplicateIdempotencyKey,
} from '../../application/application-errors.js';

export const IDEMPOTENCY_KEY_CONSTRAINT = 'TRANSFERS_IDEMPOTENCY_KEY_UK';

const ORA_UNIQUE_CONSTRAINT = 1;
const ORA_RESOURCE_BUSY_NOWAIT = 54;

/**
 * Rethrows an oracledb error as the matching application error, or unchanged.
 * `subject` is the locked account id or the duplicated idempotency key.
 */
export function rethrowOracleError(error: unknown, subject: string): never {
  if (error instanceof Error && 'errorNum' in error) {
    if (error.errorNum === ORA_RESOURCE_BUSY_NOWAIT) {
      throw new AccountLocked(subject);
    }
    // ORA-00001 names the violated constraint; only the key constraint means a replay race.
    if (
      error.errorNum === ORA_UNIQUE_CONSTRAINT &&
      error.message.includes(IDEMPOTENCY_KEY_CONSTRAINT)
    ) {
      throw new DuplicateIdempotencyKey(subject);
    }
  }
  throw error;
}
