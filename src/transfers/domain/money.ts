import {
  CurrencyMismatch,
  InvalidAmount,
  InvalidCurrency,
} from './domain-errors.js';

export class Money {
  private constructor(
    private readonly minorUnitsValue: number,
    private readonly currencyValue: string,
  ) {}

  static of(minorUnits: number, currency: string): Money {
    if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
      throw new InvalidAmount('Amount must be a non-negative safe integer');
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new InvalidCurrency(
        'Currency must contain three uppercase letters',
      );
    }
    return new Money(minorUnits, currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatch('Currencies must match');
    }
    return Money.of(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatch('Currencies must match');
    }
    return Money.of(this.minorUnits - other.minorUnits, this.currency);
  }

  isZero(): boolean {
    return this.minorUnits === 0;
  }

  equals(other: Money): boolean {
    return (
      this.minorUnits === other.minorUnits && this.currency === other.currency
    );
  }

  get minorUnits(): number {
    return this.minorUnitsValue;
  }

  get currency(): string {
    return this.currencyValue;
  }
}
