import { CurrencyMismatch, InsufficientFunds } from './domain-errors.js';
import type { Money } from './money.js';

export class Account {
  constructor(
    private readonly idValue: string,
    private balanceValue: Money,
  ) {}

  debit(amount: Money): void {
    if (this.balance.currency !== amount.currency) {
      throw new CurrencyMismatch('Currencies must match');
    }
    if (amount.minorUnits > this.balance.minorUnits) {
      throw new InsufficientFunds('Debit exceeds the account balance');
    }
    this.balanceValue = this.balance.subtract(amount);
  }

  credit(amount: Money): void {
    this.balanceValue = this.balance.add(amount);
  }

  get id(): string {
    return this.idValue;
  }

  get balance(): Money {
    return this.balanceValue;
  }
}
