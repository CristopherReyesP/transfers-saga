import { randomUUID } from 'node:crypto';
import {
  Inject,
  Module,
  ValidationPipe,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import oracledb, { type Pool } from 'oracledb';
import { ExecuteTransfer } from './application/execute-transfer.js';
import { GetTransfer } from './application/get-transfer.js';
import type { DestinationBankPort } from './application/ports/destination-bank.js';
import type { TransferUnitOfWork } from './application/ports/transfer-unit-of-work.js';
import { ProblemDetailsFilter } from './infrastructure/http/problem-details.filter.js';
import { TransfersController } from './infrastructure/http/transfers.controller.js';
import { oraclePoolConfigFromEnv } from './infrastructure/oracle/oracle-pool-config.js';
import { OracleTransferUnitOfWork } from './infrastructure/oracle/oracle-transfer-unit-of-work.js';
import { SimulatedDestinationBank } from './infrastructure/simulated-bank/simulated-destination-bank.js';
import {
  DESTINATION_BANK,
  ORACLE_POOL,
  TRANSFER_UNIT_OF_WORK,
} from './transfers.tokens.js';

// Seconds that in-flight units of work get to release their connections on shutdown.
const POOL_DRAIN_SECONDS = 10;

@Module({
  controllers: [TransfersController],
  providers: [
    {
      provide: ORACLE_POOL,
      useFactory: (): Promise<Pool> =>
        oracledb.createPool(oraclePoolConfigFromEnv()),
    },
    {
      provide: TRANSFER_UNIT_OF_WORK,
      useFactory: (pool: Pool) => new OracleTransferUnitOfWork(pool),
      inject: [ORACLE_POOL],
    },
    { provide: DESTINATION_BANK, useClass: SimulatedDestinationBank },
    {
      provide: ExecuteTransfer,
      useFactory: (uow: TransferUnitOfWork, bank: DestinationBankPort) =>
        new ExecuteTransfer(uow, bank, randomUUID),
      inject: [TRANSFER_UNIT_OF_WORK, DESTINATION_BANK],
    },
    {
      provide: GetTransfer,
      useFactory: (uow: TransferUnitOfWork) => new GetTransfer(uow),
      inject: [TRANSFER_UNIT_OF_WORK],
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class TransfersModule implements OnApplicationShutdown {
  constructor(@Inject(ORACLE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.close(POOL_DRAIN_SECONDS);
  }
}
