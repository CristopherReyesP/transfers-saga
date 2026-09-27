import { Money } from '../domain/money.js';
import { Transfer } from '../domain/transfer.js';
import { TransferNotFound } from './application-errors.js';
import { GetTransfer } from './get-transfer.js';
import { InMemoryTransferStore } from './testing/in-memory-transfer-store.js';

describe('GetTransfer', () => {
  it('returns the committed transfer by id', async () => {
    const store = new InMemoryTransferStore();
    const transfer = Transfer.request({
      id: 'transfer-1',
      sourceAccountId: 'source-1',
      destinationAccount: 'destination-1',
      amount: Money.of(300, 'USD'),
    });
    transfer.markDebited();
    await store.run(({ transfers }) => transfers.insert(transfer, 'key-1'));
    transfer.markCompleted();
    const result = await new GetTransfer(store).execute('transfer-1');
    expect(result.id).toBe('transfer-1');
    expect(result.status).toBe('DEBITED');
    expect(result.sourceAccountId).toBe('source-1');
    expect(result.destinationAccount).toBe('destination-1');
    expect(result.amount.equals(Money.of(300, 'USD'))).toBe(true);
  });

  it('throws TransferNotFound for a missing id', async () => {
    const store = new InMemoryTransferStore();
    await expect(new GetTransfer(store).execute('missing')).rejects.toThrow(
      TransferNotFound,
    );
  });
});
