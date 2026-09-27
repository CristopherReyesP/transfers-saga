import { Account } from './account.js';
import { CurrencyMismatch, InsufficientFunds } from './domain-errors.js';
import { Money } from './money.js';

describe('Account', () => {
  it('exposes its identity and opening balance', () => {
    const account = new Account('source-1', Money.of(100, 'USD'));
    expect(account.id).toBe('source-1');
    expect(account.balance.equals(Money.of(100, 'USD'))).toBe(true);
  });

  it('debits in place', () => {
    const account = new Account('source-1', Money.of(100, 'USD'));
    expect(account.debit(Money.of(40, 'USD'))).toBeUndefined();
    expect(account.balance.equals(Money.of(60, 'USD'))).toBe(true);
    expect(account.id).toBe('source-1');
  });

  it('allows debiting the entire balance', () => {
    const account = new Account('source-1', Money.of(100, 'USD'));
    account.debit(Money.of(100, 'USD'));
    expect(account.balance.isZero()).toBe(true);
  });

  it('rejects insufficient funds without changing the balance', () => {
    const account = new Account('source-1', Money.of(100, 'USD'));
    const amount = Money.of(101, 'USD');
    expect(() => account.debit(amount)).toThrow(InsufficientFunds);
    expect(account.balance.minorUnits).toBe(100);
  });

  it('credits in place', () => {
    const account = new Account('source-1', Money.of(100, 'USD'));
    expect(account.credit(Money.of(40, 'USD'))).toBeUndefined();
    expect(account.balance.equals(Money.of(140, 'USD'))).toBe(true);
    expect(account.id).toBe('source-1');
  });

  it.each(['debit', 'credit'] as const)('%s accepts zero', (operation) => {
    const account = new Account('source-1', Money.of(100, 'USD'));
    account[operation](Money.of(0, 'USD'));
    expect(account.balance.minorUnits).toBe(100);
  });

  it.each(['debit', 'credit'] as const)(
    '%s rejects a currency mismatch',
    (operation) => {
      const account = new Account('source-1', Money.of(100, 'USD'));
      const amount = Money.of(50, 'EUR');
      expect(() => account[operation](amount)).toThrow(CurrencyMismatch);
      expect(account.balance.equals(Money.of(100, 'USD'))).toBe(true);
    },
  );
});
