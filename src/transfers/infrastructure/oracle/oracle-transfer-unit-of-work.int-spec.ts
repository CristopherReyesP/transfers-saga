import {
  readBalance,
  seedAccount,
  useOracleTestDb,
} from '../../../../test/oracle/oracle-test-db.js';
import { DuplicateIdempotencyKey } from '../../application/application-errors.js';
import { Money } from '../../domain/money.js';
import { Transfer } from '../../domain/transfer.js';
import { OracleTransferUnitOfWork } from './oracle-transfer-unit-of-work.js';

const debitedTransfer = (id: string): Transfer => {
  const transfer = Transfer.request({
    id,
    sourceAccountId: 'source-1',
    destinationAccount: 'destination-1',
    amount: Money.of(300, 'USD'),
  });
  transfer.markDebited();
  return transfer;
};

describe('OracleTransferUnitOfWork', () => {
  const db = useOracleTestDb();
  let uow: OracleTransferUnitOfWork;

  beforeEach(async () => {
    await seedAccount(db.pool, 'source-1', 1000, 'USD');
    uow = new OracleTransferUnitOfWork(db.pool);
  });

  it('commits the debit and the transfer together on success', async () => {
    await uow.run(async ({ accounts, transfers }) => {
      const account = await accounts.getForUpdate('source-1');
      account.debit(Money.of(300, 'USD'));
      await accounts.save(account);
      await transfers.insert(debitedTransfer('transfer-1'), 'key-1');
    });
    expect(await readBalance(db.pool, 'source-1')).toBe(700);
    const stored = await uow.run(({ transfers }) =>
      transfers.findByIdempotencyKey('key-1'),
    );
    expect(stored?.status).toBe('DEBITED');
  });

  it('rolls back, rethrows the same error, and releases the connection when the work fails', async () => {
    const failure = new Error('work failed');
    await expect(
      uow.run(async ({ accounts }) => {
        const account = await accounts.getForUpdate('source-1');
        account.debit(Money.of(300, 'USD'));
        await accounts.save(account);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await readBalance(db.pool, 'source-1')).toBe(1000);
    expect(db.pool.connectionsInUse).toBe(0);
  });

  it('throws DuplicateIdempotencyKey and rolls back the debit of the same run', async () => {
    await uow.run(({ transfers }) =>
      transfers.insert(debitedTransfer('transfer-1'), 'key-1'),
    );
    await expect(
      uow.run(async ({ accounts, transfers }) => {
        const account = await accounts.getForUpdate('source-1');
        account.debit(Money.of(300, 'USD'));
        await accounts.save(account);
        await transfers.insert(debitedTransfer('transfer-2'), 'key-1');
      }),
    ).rejects.toThrow(DuplicateIdempotencyKey);
    expect(await readBalance(db.pool, 'source-1')).toBe(1000);
    const loser = await uow.run(({ transfers }) =>
      transfers.findById('transfer-2'),
    );
    expect(loser).toBeNull();
  });
});
