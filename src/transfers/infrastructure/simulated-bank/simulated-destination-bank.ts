import {
  CreditRejected,
  CreditTimeout,
} from '../../application/application-errors.js';
import type { DestinationBankPort } from '../../application/ports/destination-bank.js';

type CreditRequest = Parameters<DestinationBankPort['credit']>[0];
type CreditStatus = Awaited<ReturnType<DestinationBankPort['getCreditStatus']>>;

interface CreditOutcome {
  /** What getCreditStatus reports for the reference afterwards. */
  status: CreditStatus;
  /** Whether credit answers with a timeout instead of the status. */
  timesOut: boolean;
}

const REJECT_PREFIX = 'reject-';
const TIMEOUT_PREFIXES: ReadonlyArray<readonly [string, CreditStatus]> = [
  ['timeout-credited-', 'CREDITED'],
  ['timeout-rejected-', 'REJECTED'],
  ['timeout-unknown-', 'UNKNOWN'],
];
const REJECT_REASON = 'Destination bank rejected the credit';

/**
 * A stand-in for the interbank rail, deterministic by destination-account
 * prefix: `reject-` rejects; `timeout-credited-`, `timeout-rejected-` and
 * `timeout-unknown-` time out and then report that status; anything else is
 * credited. Idempotent by reference: a repeated reference replays its first
 * outcome.
 */
export class SimulatedDestinationBank implements DestinationBankPort {
  private readonly outcomes = new Map<string, CreditOutcome>();

  async credit(request: CreditRequest): Promise<void> {
    let outcome = this.outcomes.get(request.reference);
    if (!outcome) {
      outcome = outcomeFor(request.destinationAccount);
      this.outcomes.set(request.reference, outcome);
    }
    if (outcome.timesOut) throw new CreditTimeout(request.reference);
    if (outcome.status === 'REJECTED') throw new CreditRejected(REJECT_REASON);
  }

  async getCreditStatus(reference: string): Promise<CreditStatus> {
    return this.outcomes.get(reference)?.status ?? 'UNKNOWN';
  }
}

function outcomeFor(destinationAccount: string): CreditOutcome {
  if (destinationAccount.startsWith(REJECT_PREFIX)) {
    return { status: 'REJECTED', timesOut: false };
  }
  const timeout = TIMEOUT_PREFIXES.find(([prefix]) =>
    destinationAccount.startsWith(prefix),
  );
  if (timeout) return { status: timeout[1], timesOut: true };
  return { status: 'CREDITED', timesOut: false };
}
