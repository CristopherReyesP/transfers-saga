import {
  seedAccount,
  useOracleTestDb,
} from '../../../../test/oracle/oracle-test-db.js';
import {
  AccountLocked,
  AccountNotFound,
} from '../../application/application-errors.js';
import { Money } from '../../domain/money.js';
import { OracleTransferUnitOfWork } from './oracle-transfer-unit-of-work.js';

describe('OracleAccountRepository', () => {
  const db = useOracleTestDb();
  let uow: OracleTransferUnitOfWork;

  beforeEach(async () => {
    await seedAccount(db.pool, 'source-1', 1000, 'USD');
    uow = new OracleTransferUnitOfWork(db.pool);
  });

  it('loads the account with its balance', async () => {
    const account = await uow.run(({ accounts }) =>
      accounts.getForUpdate('source-1'),
    );
    expect(account.id).toBe('source-1');
    expect(account.balance.equals(Money.of(1000, 'USD'))).toBe(true);
  });

  it('throws AccountLocked right away while another connection holds the row lock', async () => {
    const holder = await db.pool.getConnection();
    try {
      await holder.execute(
        'SELECT id FROM accounts WHERE id = :id FOR UPDATE',
        { id: 'source-1' },
      );
      const started = performance.now();
      await expect(
        uow.run(({ accounts }) => accounts.getForUpdate('source-1')),
      ).rejects.toThrow(AccountLocked);
      // NOWAIT fails at once; a waiting lock would block until the holder ends.
      expect(performance.now() - started).toBeLessThan(1000);
    } finally {
      await holder.rollback();
      await holder.close();
    }
  });

  it('throws AccountNotFound for a missing account', async () => {
    await expect(
      uow.run(({ accounts }) => accounts.getForUpdate('missing')),
    ).rejects.toThrow(AccountNotFound);
  });
});
