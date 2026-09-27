import {
  readBalance,
  seedAccount,
  useOracleTestDb,
} from '../../../../test/oracle/oracle-test-db.js';
import {
  ExecuteTransfer,
  type ExecuteTransferCommand,
} from '../../application/execute-transfer.js';
import { GetTransfer } from '../../application/get-transfer.js';
import { FakeDestinationBank } from '../../application/testing/fake-destination-bank.js';
import type { TransferStatus } from '../../domain/transfer.js';
import { OracleTransferUnitOfWork } from './oracle-transfer-unit-of-work.js';

const command = (): ExecuteTransferCommand => ({
  idempotencyKey: 'key-1',
  sourceAccountId: 'source-1',
  destinationAccount: 'destination-1',
  amount: { minorUnits: 300, currency: 'USD' },
});

describe('ExecuteTransfer on Oracle', () => {
  const db = useOracleTestDb();
  let uow: OracleTransferUnitOfWork;
  let bank: FakeDestinationBank;
  let execute: ExecuteTransfer;

  beforeEach(async () => {
    await seedAccount(db.pool, 'source-1', 1000, 'USD');
    uow = new OracleTransferUnitOfWork(db.pool);
    bank = new FakeDestinationBank();
    execute = new ExecuteTransfer(uow, bank, () => 'transfer-1');
  });

  async function expectCommitted(status: TransferStatus, balance: number) {
    const stored = await new GetTransfer(uow).execute('transfer-1');
    expect(stored.status).toBe(status);
    expect(await readBalance(db.pool, 'source-1')).toBe(balance);
  }

  it('reverses a rejected credit and restores the balance', async () => {
    bank.creditOutcomes.push({ kind: 'rejected', reason: 'Account closed' });
    const result = await execute.execute(command());
    expect(result.status).toBe('REVERSED');
    expect(result.failureReason).toBe('Account closed');
    await expectCommitted('REVERSED', 1000);
  });

  it('completes a timed-out credit that the destination reports as CREDITED with one debit', async () => {
    bank.creditOutcomes.push({ kind: 'timeout' });
    bank.statusOutcomes.push('CREDITED');
    const result = await execute.execute(command());
    expect(result.status).toBe('COMPLETED');
    await expectCommitted('COMPLETED', 700);
    expect(bank.creditCalls).toHaveLength(1);
    expect(bank.statusCalls).toEqual(['transfer-1']);
  });

  it('replays the same key and payload without a second debit', async () => {
    const first = await execute.execute(command());
    const replay = await execute.execute(command());
    expect(replay.id).toBe(first.id);
    expect(replay.status).toBe('COMPLETED');
    await expectCommitted('COMPLETED', 700);
    expect(bank.creditCalls).toHaveLength(1);
  });
});
