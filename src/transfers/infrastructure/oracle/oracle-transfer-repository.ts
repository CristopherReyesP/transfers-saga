import type { Connection } from 'oracledb';
import type { TransferRepository } from '../../application/ports/transfer-repository.js';
import { Money } from '../../domain/money.js';
import { Transfer, type TransferStatus } from '../../domain/transfer.js';
import { rethrowOracleError } from './oracle-error-mapper.js';
import { OBJECT_ROWS, toMinorUnits } from './oracle-rows.js';

interface TransferRow {
  ID: string;
  SOURCE_ACCOUNT_ID: string;
  DESTINATION_ACCOUNT: string;
  AMOUNT_MINOR: number;
  CURRENCY: string;
  STATUS: TransferStatus;
  FAILURE_REASON: string | null;
}

const SELECT_TRANSFER = `
  SELECT id, source_account_id, destination_account,
         amount_minor, currency, status, failure_reason
    FROM transfers`;

export class OracleTransferRepository implements TransferRepository {
  constructor(private readonly connection: Connection) {}

  async insert(transfer: Transfer, idempotencyKey: string): Promise<void> {
    await this.connection
      .execute(
        `INSERT INTO transfers (
           id, idempotency_key, source_account_id, destination_account,
           amount_minor, currency, status, failure_reason
         ) VALUES (
           :id, :idempotencyKey, :sourceAccountId, :destinationAccount,
           :amountMinor, :currency, :status, :failureReason
         )`,
        {
          id: transfer.id,
          idempotencyKey,
          sourceAccountId: transfer.sourceAccountId,
          destinationAccount: transfer.destinationAccount,
          amountMinor: transfer.amount.minorUnits,
          currency: transfer.amount.currency,
          status: transfer.status,
          failureReason: transfer.failureReason ?? null,
        },
      )
      .catch((error: unknown) => rethrowOracleError(error, idempotencyKey));
  }

  async save(transfer: Transfer): Promise<void> {
    await this.connection.execute(
      `UPDATE transfers
          SET status = :status,
              failure_reason = :failureReason,
              updated_at = SYSTIMESTAMP
        WHERE id = :id`,
      {
        id: transfer.id,
        status: transfer.status,
        failureReason: transfer.failureReason ?? null,
      },
    );
  }

  findById(id: string): Promise<Transfer | null> {
    return this.findOne(`${SELECT_TRANSFER} WHERE id = :value`, id);
  }

  findByIdempotencyKey(key: string): Promise<Transfer | null> {
    return this.findOne(
      `${SELECT_TRANSFER} WHERE idempotency_key = :value`,
      key,
    );
  }

  private async findOne(sql: string, value: string): Promise<Transfer | null> {
    const result = await this.connection.execute<TransferRow>(
      sql,
      { value },
      OBJECT_ROWS,
    );
    const row = result.rows?.[0];
    return row ? toTransfer(row) : null;
  }
}

function toTransfer(row: TransferRow): Transfer {
  return Transfer.rehydrate({
    id: row.ID,
    sourceAccountId: row.SOURCE_ACCOUNT_ID,
    destinationAccount: row.DESTINATION_ACCOUNT,
    amount: Money.of(toMinorUnits(row.AMOUNT_MINOR), row.CURRENCY),
    status: row.STATUS,
    // Oracle stores an absent reason as NULL; the domain models it as undefined.
    failureReason: row.FAILURE_REASON ?? undefined,
  });
}
