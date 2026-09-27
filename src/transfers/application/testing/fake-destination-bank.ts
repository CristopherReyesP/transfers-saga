import { CreditRejected, CreditTimeout } from '../application-errors.js';
import type { DestinationBankPort } from '../ports/destination-bank.js';

type CreditOutcome =
  { kind: 'ok' } | { kind: 'rejected'; reason: string } | { kind: 'timeout' };
type CreditStatus = Awaited<ReturnType<DestinationBankPort['getCreditStatus']>>;

export class FakeDestinationBank implements DestinationBankPort {
  readonly creditCalls: Parameters<DestinationBankPort['credit']>[0][] = [];
  readonly statusCalls: string[] = [];
  readonly creditOutcomes: CreditOutcome[] = [];
  readonly statusOutcomes: CreditStatus[] = [];
  private readonly creditedReferences = new Set<string>();

  async credit(
    request: Parameters<DestinationBankPort['credit']>[0],
  ): Promise<void> {
    this.creditCalls.push({ ...request });
    if (this.creditedReferences.has(request.reference)) return;
    const outcome = this.creditOutcomes.shift() ?? { kind: 'ok' };
    if (outcome.kind === 'rejected') throw new CreditRejected(outcome.reason);
    if (outcome.kind === 'timeout') throw new CreditTimeout(request.reference);
    this.creditedReferences.add(request.reference);
  }

  async getCreditStatus(reference: string): Promise<CreditStatus> {
    this.statusCalls.push(reference);
    const status =
      this.statusOutcomes.shift() ??
      (this.creditedReferences.has(reference) ? 'CREDITED' : 'UNKNOWN');
    if (status === 'CREDITED') this.creditedReferences.add(reference);
    return status;
  }
}
