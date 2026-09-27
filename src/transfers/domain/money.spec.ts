import { CurrencyMismatch, InvalidAmount, InvalidCurrency } from './domain-errors.js';
import { Money } from './money.js';

describe('Money', () => {
  it.each([0, 1, 1250, Number.MAX_SAFE_INTEGER])(
    'preserves %s minor units and currency',
    (minorUnits) => {
      const money = Money.of(minorUnits, 'USD');
      expect(money.minorUnits).toBe(minorUnits);
      expect(money.currency).toBe('USD');
    },
  );

  it.each([
    -1,
    -0.5,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid minor units %s', (minorUnits) => {
    expect(() => Money.of(minorUnits, 'USD')).toThrow(InvalidAmount);
  });

  it.each(['', 'usd', 'Usd', 'US', 'USDD', '123', 'US ', ' USD'])(
    'rejects malformed currency %j',
    (currency) => {
      expect(() => Money.of(100, currency)).toThrow(InvalidCurrency);
    },
  );

  it('adds without changing either operand', () => {
    const left = Money.of(100, 'USD');
    const right = Money.of(50, 'USD');
    const result = left.add(right);
    expect(result.minorUnits).toBe(150);
    expect(result.currency).toBe('USD');
    expect(left.minorUnits).toBe(100);
    expect(right.minorUnits).toBe(50);
    expect(result).not.toBe(left);
  });

  it('rejects addition beyond safe integer range', () => {
    const maximum = Money.of(Number.MAX_SAFE_INTEGER, 'USD');
    const one = Money.of(1, 'USD');
    expect(() => maximum.add(one)).toThrow(InvalidAmount);
  });

  it('subtracts without changing either operand', () => {
    const left = Money.of(100, 'USD');
    const right = Money.of(50, 'USD');
    const result = left.subtract(right);
    expect(result.minorUnits).toBe(50);
    expect(result.currency).toBe('USD');
    expect(left.minorUnits).toBe(100);
    expect(right.minorUnits).toBe(50);
    expect(result).not.toBe(left);
  });

  it('allows subtraction down to zero', () => {
    expect(Money.of(100, 'USD').subtract(Money.of(100, 'USD')).isZero()).toBe(
      true,
    );
  });

  it('rejects subtraction below zero', () => {
    const balance = Money.of(50, 'USD');
    const amount = Money.of(100, 'USD');
    expect(() => balance.subtract(amount)).toThrow(InvalidAmount);
    expect(balance.minorUnits).toBe(50);
  });

  it.each(['add', 'subtract'] as const)(
    '%s rejects a currency mismatch',
    (operation) => {
      const usd = Money.of(100, 'USD');
      const eur = Money.of(50, 'EUR');
      expect(() => usd[operation](eur)).toThrow(CurrencyMismatch);
      expect(usd.minorUnits).toBe(100);
    },
  );

  it.each([
    [0, true],
    [1, false],
  ] as const)('isZero for %s is %s', (units, expected) => {
    expect(Money.of(units, 'USD').isZero()).toBe(expected);
  });

  it.each([
    [100, 'USD', true],
    [101, 'USD', false],
    [100, 'EUR', false],
  ] as const)('compares value with %s %s', (units, currency, expected) => {
    expect(Money.of(100, 'USD').equals(Money.of(units, currency))).toBe(
      expected,
    );
  });
});
