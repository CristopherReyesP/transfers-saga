import { Account } from '../domain/account.js';
import { Money } from '../domain/money.js';
import { Transfer } from '../domain/transfer.js';
import {
  AccountLocked,
  AccountNotFound,
  DuplicateIdempotencyKey,
  IdempotencyKeyReused,
  TransferInProgress,
} from './application-errors.js';
import {
  ExecuteTransfer,
  type ExecuteTransferCommand,
} from './execute-transfer.js';
import type { TransferUnitOfWork } from './ports/transfer-unit-of-work.js';
import { FakeDestinationBank } from './testing/fake-destination-bank.js';
import { InMemoryTransferStore } from './testing/in-memory-transfer-store.js';

const command = (): ExecuteTransferCommand => ({
  idempotencyKey: 'key-1',
  sourceAccountId: 'source-1',
  destinationAccount: 'destination-1',
  amount: { minorUnits: 300, currency: 'USD' },
});

function setup(balance = 1000) {
  const store = new InMemoryTransferStore();
  store.seedAccount(new Account('source-1', Money.of(balance, 'USD')));
  const bank = new FakeDestinationBank();
  const execute = new ExecuteTransfer(store, bank, () => 'transfer-1');
  return { store, bank, execute };
}

const storedByKey = (store: InMemoryTransferStore) =>
  store.run(({ transfers }) => transfers.findByIdempotencyKey('key-1'));

async function expectCommitted(
  store: InMemoryTransferStore,
  transfer: Transfer,
  status: Transfer['status'],
  balance: number,
) {
  expect(transfer.status).toBe(status);
  expect(store.getCommittedBalance('source-1')?.minorUnits).toBe(balance);
  expect(store.getCommittedTransferStatus(transfer.id)).toBe(status);
  const stored = await storedByKey(store);
  expect(stored?.id).toBe(transfer.id);
  expect(stored?.status).toBe(status);
  expect(stored?.failureReason).toBe(transfer.failureReason);
}

describe('ExecuteTransfer', () => {
  it('commits the locked debit and insertion before crediting, then commits completion', async () => {
    const { store, bank } = setup();
    const operations: string[][] = [];
    const uow: TransferUnitOfWork = {
      run: (work) =>
        store.run(({ accounts, transfers }) => {
          const current: string[] = [];
          operations.push(current);
          return work({
            accounts: {
              getForUpdate: (id) => {
                current.push('lock');
                return accounts.getForUpdate(id);
              },
              save: (account) => {
                current.push('debit');
                expect(account.balance.minorUnits).toBe(700);
                return accounts.save(account);
              },
            },
            transfers: {
              ...transfers,
              insert: (transfer, key) => {
                current.push('insert');
                expect(transfer.status).toBe('DEBITED');
                expect(key).toBe('key-1');
                return transfers.insert(transfer, key);
              },
              save: (transfer) => {
                current.push(transfer.status);
                return transfers.save(transfer);
              },
            },
          });
        }),
    };
    const credit = bank.credit.bind(bank);
    vi.spyOn(bank, 'credit').mockImplementation(async (request) => {
      expect(store.transactionActive).toBe(false);
      expect(store.getCommittedBalance('source-1')?.minorUnits).toBe(700);
      expect(store.getCommittedTransferStatus(request.reference)).toBe(
        'DEBITED',
      );
      expect((await storedByKey(store))?.id).toBe(request.reference);
      await credit(request);
    });

    const result = await new ExecuteTransfer(
      uow,
      bank,
      () => 'transfer-1',
    ).execute(command());

    await expectCommitted(store, result, 'COMPLETED', 700);
    expect(operations.filter((calls) => calls.length > 0)).toEqual([
      ['lock', 'debit', 'insert'],
      ['COMPLETED'],
    ]);
    expect(bank.creditCalls).toEqual([
      {
        reference: 'transfer-1',
        destinationAccount: 'destination-1',
        amount: Money.of(300, 'USD'),
      },
    ]);
    expect(bank.statusCalls).toEqual([]);
  });

  it('persists insufficient funds as FAILED without changing the balance or calling the bank', async () => {
    const { store, bank, execute } = setup(200);
    const result = await execute.execute(command());
    await expectCommitted(store, result, 'FAILED', 200);
    expect(result.failureReason).toEqual(expect.any(String));
    expect(result.failureReason?.length).toBeGreaterThan(0);
    expect(bank.creditCalls).toEqual([]);
    expect(bank.statusCalls).toEqual([]);
  });

  it('propagates AccountLocked without persisting anything or calling the bank', async () => {
    const { store, bank, execute } = setup();
    store.lockAccount('source-1');
    await expect(execute.execute(command())).rejects.toThrow(AccountLocked);
    expect(await storedByKey(store)).toBeNull();
    expect(store.getCommittedBalance('source-1')?.minorUnits).toBe(1000);
    expect(bank.creditCalls).toEqual([]);
    expect(bank.statusCalls).toEqual([]);
  });

  it('propagates AccountNotFound without persisting anything or calling the bank', async () => {
    const { store, bank, execute } = setup();
    await expect(
      execute.execute({ ...command(), sourceAccountId: 'missing' }),
    ).rejects.toThrow(AccountNotFound);
    expect(await storedByKey(store)).toBeNull();
    expect(store.getCommittedBalance('source-1')?.minorUnits).toBe(1000);
    expect(bank.creditCalls).toEqual([]);
    expect(bank.statusCalls).toEqual([]);
  });

  it('reverses a rejected credit, preserves its reason, and restores the committed balance', async () => {
    const { store, bank, execute } = setup();
    bank.creditOutcomes.push({ kind: 'rejected', reason: 'Account closed' });
    const result = await execute.execute(command());
    await expectCommitted(store, result, 'REVERSED', 1000);
    expect(result.failureReason).toBe('Account closed');
    expect(bank.creditCalls).toHaveLength(1);
    expect(bank.statusCalls).toEqual([]);
  });

  it.each([
    ['CREDITED', 'COMPLETED', 700],
    ['REJECTED', 'REVERSED', 1000],
    ['UNKNOWN', 'DEBITED', 700],
  ] as const)(
    'resolves a timeout with %s as %s',
    async (status, expectedStatus, balance) => {
      const { store, bank, execute } = setup();
      bank.creditOutcomes.push({ kind: 'timeout' });
      bank.statusOutcomes.push(status);
      const getStatus = bank.getCreditStatus.bind(bank);
      vi.spyOn(bank, 'getCreditStatus').mockImplementation((reference) => {
        expect(store.transactionActive).toBe(false);
        return getStatus(reference);
      });
      const result = await execute.execute(command());
      await expectCommitted(store, result, expectedStatus, balance);
      expect(bank.creditCalls).toHaveLength(1);
      expect(bank.statusCalls).toEqual(['transfer-1']);
    },
  );

  it('returns committed COMPENSATING when a refund account is locked', async () => {
    const { store, bank, execute } = setup();
    bank.creditOutcomes.push({ kind: 'rejected', reason: 'Account closed' });
    const credit = bank.credit.bind(bank);
    vi.spyOn(bank, 'credit').mockImplementation((request) => {
      expect(store.transactionActive).toBe(false);
      expect(store.getCommittedBalance('source-1')?.minorUnits).toBe(700);
      store.lockAccount('source-1');
      return credit(request);
    });
    const result = await execute.execute(command());
    await expectCommitted(store, result, 'COMPENSATING', 700);
    expect(result.failureReason).toBe('Account closed');
    expect(bank.creditCalls).toHaveLength(1);
  });

  it('replays a completed transfer without another debit or credit', async () => {
    const { store, bank, execute } = setup();
    const first = await execute.execute(command());
    const replay = await execute.execute(command());
    expect(replay.id).toBe(first.id);
    await expectCommitted(store, replay, 'COMPLETED', 700);
    expect(bank.creditCalls).toHaveLength(1);
    expect(bank.statusCalls).toEqual([]);
  });

  it.each([
    ['source', { sourceAccountId: 'source-2' }],
    ['destination', { destinationAccount: 'destination-2' }],
    ['amount', { amount: { minorUnits: 301, currency: 'USD' } }],
    ['currency', { amount: { minorUnits: 300, currency: 'EUR' } }],
  ] satisfies [string, Partial<ExecuteTransferCommand>][])(
    'rejects key reuse with a different %s without side effects',
    async (_field, change) => {
      const { store, bank, execute } = setup();
      const first = await execute.execute(command());
      await expect(
        execute.execute({ ...command(), ...change }),
      ).rejects.toThrow(IdempotencyKeyReused);
      await expectCommitted(store, first, 'COMPLETED', 700);
      expect(bank.creditCalls).toHaveLength(1);
      expect(bank.statusCalls).toEqual([]);
      expect(store.getCommittedBalance('source-2')).toBeUndefined();
    },
  );

  it('rejects a replay while the committed transfer remains DEBITED', async () => {
    const { store, bank, execute } = setup();
    const transfer = Transfer.request({
      ...command(),
      id: 'existing',
      amount: Money.of(300, 'USD'),
    });
    await store.run(async ({ accounts, transfers }) => {
      const account = await accounts.getForUpdate('source-1');
      account.debit(transfer.amount);
      await accounts.save(account);
      transfer.markDebited();
      await transfers.insert(transfer, 'key-1');
    });
    await expect(execute.execute(command())).rejects.toThrow(
      TransferInProgress,
    );
    await expectCommitted(store, transfer, 'DEBITED', 700);
    expect(bank.creditCalls).toEqual([]);
    expect(bank.statusCalls).toEqual([]);
  });

  it('rolls back the debit and throws TransferInProgress when a concurrent insert wins', async () => {
    const { store, bank } = setup();
    let insertAttempted = false;
    const uow: TransferUnitOfWork = {
      run: (work) =>
        store.run(({ accounts, transfers }) =>
          work({
            accounts,
            transfers: {
              ...transfers,
              insert: async (transfer) => {
                insertAttempted = true;
                expect(transfer.status).toBe('DEBITED');
                expect(
                  (await accounts.getForUpdate('source-1')).balance.minorUnits,
                ).toBe(700);
                expect(store.getCommittedBalance('source-1')?.minorUnits).toBe(
                  1000,
                );
                throw new DuplicateIdempotencyKey('key-1');
              },
            },
          }),
        ),
    };
    const execute = new ExecuteTransfer(uow, bank, () => 'loser');
    await expect(execute.execute(command())).rejects.toThrow(
      TransferInProgress,
    );
    expect(insertAttempted).toBe(true);
    expect(store.getCommittedBalance('source-1')?.minorUnits).toBe(1000);
    expect(store.getCommittedTransferStatus('loser')).toBeUndefined();
    expect(await storedByKey(store)).toBeNull();
    expect(bank.creditCalls).toEqual([]);
    expect(bank.statusCalls).toEqual([]);
  });
});
