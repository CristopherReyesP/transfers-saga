import {
  DomainError,
  InvalidAmount,
  InvalidTransferTransition,
} from './domain-errors.js';
import { Money } from './money.js';
import {
  Transfer,
  type TransferSnapshot,
  type TransferStatus,
} from './transfer.js';

const failureReason = 'Destination rejected the credit';
const request = () =>
  Transfer.request({
    id: 'transfer-1',
    sourceAccountId: 'source-1',
    destinationAccount: 'destination-1',
    amount: Money.of(100, 'USD'),
  });

const atStatus = (status: TransferStatus): Transfer => {
  const transfer = request();
  if (status === 'FAILED') {
    transfer.markFailed(failureReason);
  } else if (status !== 'PENDING') {
    transfer.markDebited();
    if (status === 'COMPLETED') {
      transfer.markCompleted();
    } else if (status === 'COMPENSATING' || status === 'REVERSED') {
      transfer.startCompensation(failureReason);
      if (status === 'REVERSED') transfer.markReversed();
    }
  }
  return transfer;
};

const transitions = [
  {
    method: 'markDebited',
    from: 'PENDING',
    to: 'DEBITED',
    run: (t: Transfer) => t.markDebited(),
  },
  {
    method: 'markCompleted',
    from: 'DEBITED',
    to: 'COMPLETED',
    run: (t: Transfer) => t.markCompleted(),
  },
  {
    method: 'startCompensation',
    from: 'DEBITED',
    to: 'COMPENSATING',
    run: (t: Transfer) => t.startCompensation(failureReason),
  },
  {
    method: 'markReversed',
    from: 'COMPENSATING',
    to: 'REVERSED',
    run: (t: Transfer) => t.markReversed(),
  },
  {
    method: 'markFailed',
    from: 'PENDING',
    to: 'FAILED',
    run: (t: Transfer) => t.markFailed(failureReason),
  },
] as const;

const statuses: TransferStatus[] = [
  'PENDING',
  'DEBITED',
  'COMPLETED',
  'COMPENSATING',
  'REVERSED',
  'FAILED',
];
const invalidTransitions = statuses.flatMap((status) =>
  transitions
    .filter((transition) => transition.from !== status)
    .map((transition) => ({ status, ...transition })),
);

describe('Transfer', () => {
  it('requests a pending transfer and exposes its data', () => {
    const transfer = request();
    expect(transfer.id).toBe('transfer-1');
    expect(transfer.sourceAccountId).toBe('source-1');
    expect(transfer.destinationAccount).toBe('destination-1');
    expect(transfer.amount.equals(Money.of(100, 'USD'))).toBe(true);
    expect(transfer.status).toBe('PENDING');
    expect(transfer.failureReason).toBeUndefined();
  });

  it('rejects a zero amount', () => {
    const amount = Money.of(0, 'USD');
    expect(() =>
      Transfer.request({
        id: 'transfer-1',
        sourceAccountId: 'source-1',
        destinationAccount: 'destination-1',
        amount,
      }),
    ).toThrow(InvalidAmount);
  });

  it.each(transitions)('$method moves $from to $to', ({ from, to, run }) => {
    const transfer = atStatus(from);
    run(transfer);
    expect(transfer.status).toBe(to);
    expect(transfer.id).toBe('transfer-1');
    expect(transfer.sourceAccountId).toBe('source-1');
    expect(transfer.destinationAccount).toBe('destination-1');
    expect(transfer.amount.equals(Money.of(100, 'USD'))).toBe(true);
  });

  it('stores the compensation reason and retains it after reversal', () => {
    const transfer = atStatus('DEBITED');
    transfer.startCompensation(failureReason);
    expect(transfer.failureReason).toBe(failureReason);
    transfer.markReversed();
    expect(transfer.failureReason).toBe(failureReason);
  });

  it('records a pending failure without a debit transition', () => {
    const transfer = request();
    transfer.markFailed(failureReason);
    expect(transfer.status).toBe('FAILED');
    expect(transfer.failureReason).toBe(failureReason);
  });

  it('keeps the failure reason absent on successful completion', () => {
    expect(atStatus('COMPLETED').failureReason).toBeUndefined();
  });

  it.each(invalidTransitions)(
    'rejects $method from $status to $to',
    ({ status, to, run }) => {
      const transfer = atStatus(status);
      const previousReason = transfer.failureReason;
      expect(() => run(transfer)).toThrow(InvalidTransferTransition);
      expect(() => run(transfer)).toThrow(`from ${status} to ${to}`);
      expect(transfer.status).toBe(status);
      expect(transfer.failureReason).toBe(previousReason);
      expect(transfer.amount.equals(Money.of(100, 'USD'))).toBe(true);
    },
  );

  it.each([
    ['PENDING', false],
    ['DEBITED', false],
    ['COMPENSATING', false],
    ['COMPLETED', true],
    ['REVERSED', true],
    ['FAILED', true],
  ] as const)('isTerminal for %s is %s', (status, expected) => {
    expect(atStatus(status).isTerminal()).toBe(expected);
  });
});

const snapshotOf = (transfer: Transfer): TransferSnapshot => ({
  id: transfer.id,
  sourceAccountId: transfer.sourceAccountId,
  destinationAccount: transfer.destinationAccount,
  amount: transfer.amount,
  status: transfer.status,
  failureReason: transfer.failureReason,
});

describe('Transfer.rehydrate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(statuses)(
    'restores a %s transfer without replaying transitions',
    (status) => {
      const snapshot = snapshotOf(atStatus(status));
      const spies = transitions.map(({ method }) =>
        vi.spyOn(Transfer.prototype, method),
      );
      const transfer = Transfer.rehydrate(snapshot);
      expect(snapshotOf(transfer)).toEqual(snapshot);
      expect(transfer.amount.equals(Money.of(100, 'USD'))).toBe(true);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    },
  );

  it.each(transitions)(
    'continues the state machine: $method moves a restored $from to $to',
    ({ from, to, run }) => {
      const transfer = Transfer.rehydrate(snapshotOf(atStatus(from)));
      run(transfer);
      expect(transfer.status).toBe(to);
    },
  );

  it('keeps guarding transitions from a restored terminal status', () => {
    const transfer = Transfer.rehydrate(snapshotOf(atStatus('REVERSED')));
    expect(() => transfer.markReversed()).toThrow(InvalidTransferTransition);
    expect(transfer.status).toBe('REVERSED');
    expect(transfer.failureReason).toBe(failureReason);
  });

  it('rejects a snapshot with a zero amount', () => {
    const snapshot = snapshotOf(atStatus('COMPLETED'));
    expect(() =>
      Transfer.rehydrate({ ...snapshot, amount: Money.of(0, 'USD') }),
    ).toThrow(InvalidAmount);
  });
});

describe('InvalidTransferTransition', () => {
  it('is a named domain error with both statuses in its message', () => {
    const error = new InvalidTransferTransition('PENDING', 'COMPLETED');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('InvalidTransferTransition');
    expect(error.message).toContain('PENDING');
    expect(error.message).toContain('COMPLETED');
  });
});
