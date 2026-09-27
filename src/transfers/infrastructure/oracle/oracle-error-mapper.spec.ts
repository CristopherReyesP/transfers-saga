import {
  AccountLocked,
  DuplicateIdempotencyKey,
} from '../../application/application-errors.js';
import { rethrowOracleError } from './oracle-error-mapper.js';

const oracleError = (errorNum: number, message: string) =>
  Object.assign(new Error(message), {
    errorNum,
    code: `ORA-${String(errorNum).padStart(5, '0')}`,
  });

const thrownBy = (error: unknown): unknown => {
  try {
    rethrowOracleError(error, 'subject-1');
  } catch (thrown) {
    return thrown;
  }
  throw new Error('Expected rethrowOracleError to throw');
};

describe('rethrowOracleError', () => {
  it('maps ORA-00054 to AccountLocked', () => {
    const thrown = thrownBy(
      oracleError(
        54,
        'ORA-00054: resource busy and acquire with NOWAIT specified or timeout expired',
      ),
    );
    expect(thrown).toBeInstanceOf(AccountLocked);
    expect((thrown as Error).message).toBe('subject-1');
  });

  it('maps ORA-00001 on the idempotency key constraint to DuplicateIdempotencyKey', () => {
    const thrown = thrownBy(
      oracleError(
        1,
        'ORA-00001: unique constraint (SAGA.TRANSFERS_IDEMPOTENCY_KEY_UK) violated on table SAGA.TRANSFERS columns (IDEMPOTENCY_KEY)',
      ),
    );
    expect(thrown).toBeInstanceOf(DuplicateIdempotencyKey);
    expect((thrown as Error).message).toBe('subject-1');
  });

  it.each([
    [
      'ORA-00001 on another constraint',
      oracleError(
        1,
        'ORA-00001: unique constraint (SAGA.TRANSFERS_PK) violated on table SAGA.TRANSFERS columns (ID)',
      ),
    ],
    [
      'another Oracle error',
      oracleError(942, 'ORA-00942: table or view does not exist'),
    ],
    ['a plain error', new Error('Connection closed')],
    ['a non-error value', 'boom'],
  ])('rethrows %s unchanged', (_label, error) => {
    expect(thrownBy(error)).toBe(error);
  });
});
