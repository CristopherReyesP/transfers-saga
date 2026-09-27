import {
  seedAccount,
  useOracleTestDb,
} from '../../../../test/oracle/oracle-test-db.js';
import { Money } from '../../domain/money.js';
import { Transfer } from '../../domain/transfer.js';
import { OracleTransferUnitOfWork } from './oracle-transfer-unit-of-work.js';

const debitedTransfer = (): Transfer => {
  const transfer = Transfer.request({
    id: 'transfer-1',
    sourceAccountId: 'source-1',
    destinationAccount: 'destination-1',
    amount: Money.of(300, 'USD'),
  });
  transfer.markDebited();
  return transfer;
};

const fieldsOf = (transfer: Transfer | null) =>
  transfer && {
    id: transfer.id,
    sourceAccountId: transfer.sourceAccountId,
    destinationAccount: transfer.destinationAccount,
    minorUnits: transfer.amount.minorUnits,
    currency: transfer.amount.currency,
    status: transfer.status,
    failureReason: transfer.failureReason,
  };

describe('OracleTransferRepository', () => {
  const db = useOracleTestDb();
  let uow: OracleTransferUnitOfWork;

  beforeEach(async () => {
    await seedAccount(db.pool, 'source-1', 1000, 'USD');
    uow = new OracleTransferUnitOfWork(db.pool);
  });

  it('finds an inserted transfer by id as an equal transfer', async () => {
    const transfer = debitedTransfer();
    await uow.run(({ transfers }) => transfers.insert(transfer, 'key-1'));
    const found = await uow.run(({ transfers }) =>
      transfers.findById('transfer-1'),
    );
    expect(found).toBeInstanceOf(Transfer);
    expect(fieldsOf(found)).toStrictEqual(fieldsOf(transfer));
  });

  it('finds an inserted transfer by its idempotency key', async () => {
    const transfer = debitedTransfer();
    await uow.run(({ transfers }) => transfers.insert(transfer, 'key-1'));
    const found = await uow.run(({ transfers }) =>
      transfers.findByIdempotencyKey('key-1'),
    );
    expect(fieldsOf(found)).toStrictEqual(fieldsOf(transfer));
  });

  it('saves a new status and failure reason', async () => {
    const transfer = debitedTransfer();
    await uow.run(({ transfers }) => transfers.insert(transfer, 'key-1'));
    transfer.startCompensation('Account closed');
    await uow.run(({ transfers }) => transfers.save(transfer));
    const found = await uow.run(({ transfers }) =>
      transfers.findById('transfer-1'),
    );
    expect(found?.status).toBe('COMPENSATING');
    expect(found?.failureReason).toBe('Account closed');
    expect(fieldsOf(found)).toStrictEqual(fieldsOf(transfer));
  });

  it('returns null for an unknown id or idempotency key', async () => {
    const found = await uow.run(async ({ transfers }) => [
      await transfers.findById('missing'),
      await transfers.findByIdempotencyKey('missing'),
    ]);
    expect(found).toEqual([null, null]);
  });
});
