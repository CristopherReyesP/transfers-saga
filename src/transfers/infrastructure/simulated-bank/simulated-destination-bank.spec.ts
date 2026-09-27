import {
  CreditRejected,
  CreditTimeout,
} from '../../application/application-errors.js';
import { Money } from '../../domain/money.js';
import { SimulatedDestinationBank } from './simulated-destination-bank.js';

const creditTo = (reference: string, destinationAccount: string) => ({
  reference,
  destinationAccount,
  amount: Money.of(300, 'USD'),
});

describe('SimulatedDestinationBank', () => {
  let bank: SimulatedDestinationBank;

  beforeEach(() => {
    bank = new SimulatedDestinationBank();
  });

  it('credits any other destination and reports CREDITED', async () => {
    await expect(
      bank.credit(creditTo('ref-1', 'destination-1')),
    ).resolves.toBeUndefined();
    expect(await bank.getCreditStatus('ref-1')).toBe('CREDITED');
  });

  it('matches the rules on the prefix only', async () => {
    await expect(
      bank.credit(creditTo('ref-1', 'account-reject-1')),
    ).resolves.toBeUndefined();
    expect(await bank.getCreditStatus('ref-1')).toBe('CREDITED');
  });

  it('rejects a reject- destination with a reason and reports REJECTED', async () => {
    const error: unknown = await bank
      .credit(creditTo('ref-1', 'reject-closed'))
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(CreditRejected);
    expect((error as CreditRejected).reason).toMatch(/\S/);
    expect(await bank.getCreditStatus('ref-1')).toBe('REJECTED');
  });

  it.each([
    ['timeout-credited-', 'CREDITED'],
    ['timeout-rejected-', 'REJECTED'],
    ['timeout-unknown-', 'UNKNOWN'],
  ] as const)(
    'times out a %s destination and then reports %s',
    async (prefix, status) => {
      await expect(
        bank.credit(creditTo('ref-1', `${prefix}1`)),
      ).rejects.toBeInstanceOf(CreditTimeout);
      expect(await bank.getCreditStatus('ref-1')).toBe(status);
    },
  );

  it('reports UNKNOWN for a reference it never received', async () => {
    expect(await bank.getCreditStatus('ref-unknown')).toBe('UNKNOWN');
  });

  it('replays a credited reference instead of evaluating the new request', async () => {
    await bank.credit(creditTo('ref-1', 'destination-1'));
    await expect(
      bank.credit(creditTo('ref-1', 'reject-closed')),
    ).resolves.toBeUndefined();
    expect(await bank.getCreditStatus('ref-1')).toBe('CREDITED');
  });

  it('replays a rejected reference instead of evaluating the new request', async () => {
    await expect(
      bank.credit(creditTo('ref-1', 'reject-closed')),
    ).rejects.toBeInstanceOf(CreditRejected);
    await expect(
      bank.credit(creditTo('ref-1', 'destination-1')),
    ).rejects.toBeInstanceOf(CreditRejected);
    expect(await bank.getCreditStatus('ref-1')).toBe('REJECTED');
  });

  it('keeps references independent', async () => {
    await expect(
      bank.credit(creditTo('ref-1', 'reject-closed')),
    ).rejects.toBeInstanceOf(CreditRejected);
    await bank.credit(creditTo('ref-2', 'destination-1'));
    expect(await bank.getCreditStatus('ref-1')).toBe('REJECTED');
    expect(await bank.getCreditStatus('ref-2')).toBe('CREDITED');
  });
});
