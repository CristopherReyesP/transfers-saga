import type { Transfer, TransferStatus } from '../../domain/transfer.js';

export interface TransferView {
  id: string;
  status: TransferStatus;
  sourceAccountId: string;
  destinationAccount: string;
  amount: { minorUnits: number; currency: string };
  failureReason?: string;
}

export function toTransferView(transfer: Transfer): TransferView {
  const view: TransferView = {
    id: transfer.id,
    status: transfer.status,
    sourceAccountId: transfer.sourceAccountId,
    destinationAccount: transfer.destinationAccount,
    amount: {
      minorUnits: transfer.amount.minorUnits,
      currency: transfer.amount.currency,
    },
  };
  if (transfer.failureReason !== undefined) {
    view.failureReason = transfer.failureReason;
  }
  return view;
}
