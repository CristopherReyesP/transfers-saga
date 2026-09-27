import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DestinationBankPort } from '../src/transfers/application/ports/destination-bank.js';
import {
  countTransfers,
  holdRowLock,
  startTransfersApp,
  transferBody,
} from './http/transfers-app.js';
import {
  readBalance,
  seedAccount,
  useOracleTestDb,
} from './oracle/oracle-test-db.js';

const PROBLEM_JSON = /^application\/problem\+json/;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Holds every credit until the spec opens the gate. */
class GatedDestinationBank implements DestinationBankPort {
  readonly creditStarted = deferred();
  readonly gate = deferred();

  async credit(): Promise<void> {
    this.creditStarted.resolve();
    await this.gate.promise;
  }

  async getCreditStatus(): Promise<'CREDITED'> {
    return 'CREDITED';
  }
}

describe('Transfers HTTP API under contention', () => {
  const db = useOracleTestDb();

  beforeEach(async () => {
    await seedAccount(db.pool, 'source-1', 1000, 'USD');
  });

  const post = (app: INestApplication, key: string) =>
    request(app.getHttpServer())
      .post('/transfers')
      .set('Idempotency-Key', key)
      .send(transferBody());

  describe('with the simulated bank', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await startTransfersApp();
    });

    afterAll(async () => {
      await app?.close();
    });

    it('debits once for two concurrent requests with the same key', async () => {
      const responses = await Promise.all([
        post(app, 'key-1'),
        post(app, 'key-1'),
      ]);
      const statuses = responses.map((response) => response.status);

      // The interleaving decides whether the loser sees a lock, an in-flight
      // transfer, or a finished replay, so only the invariants are asserted.
      for (const status of statuses) expect([201, 409]).toContain(status);
      expect(statuses).toContain(201);
      expect(await countTransfers(db.pool)).toBe(1);
      expect(await readBalance(db.pool, 'source-1')).toBe(700);
    });

    it('answers 409 AccountLocked with Retry-After while another session holds the row, then succeeds with the same key', async () => {
      const release = await holdRowLock(db.pool, 'source-1');
      try {
        const locked = await post(app, 'key-1');

        expect(locked.status).toBe(409);
        expect(locked.headers['content-type']).toMatch(PROBLEM_JSON);
        expect(locked.headers['retry-after']).toBe('1');
        expect(locked.body).toMatchObject({
          status: 409,
          code: 'AccountLocked',
        });
        expect(await countTransfers(db.pool)).toBe(0);
      } finally {
        await release();
      }
      expect(await readBalance(db.pool, 'source-1')).toBe(1000);

      const retried = await post(app, 'key-1');
      expect(retried.status).toBe(201);
      expect(retried.body).toMatchObject({ status: 'COMPLETED' });
      expect(await readBalance(db.pool, 'source-1')).toBe(700);
    });
  });

  describe('with a bank that holds the credit', () => {
    let app: INestApplication;
    let bank: GatedDestinationBank;

    beforeAll(async () => {
      bank = new GatedDestinationBank();
      app = await startTransfersApp({ bank });
    });

    afterAll(async () => {
      bank?.gate.resolve();
      await app?.close();
    });

    it('answers 409 TransferInProgress for the same key while the first request is mid-credit', async () => {
      const first = post(app, 'key-1').then((response) => response);
      // Fail fast instead of timing out when the first request never reaches the bank.
      const heldInCredit = await Promise.race([
        bank.creditStarted.promise.then(() => true),
        first.then(() => false),
      ]);
      expect(heldInCredit).toBe(true);

      const second = await post(app, 'key-1');
      expect(second.status).toBe(409);
      expect(second.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(second.body).toMatchObject({
        status: 409,
        code: 'TransferInProgress',
      });

      bank.gate.resolve();
      const completed = await first;
      expect(completed.status).toBe(201);
      expect(completed.body).toMatchObject({ status: 'COMPLETED' });
      expect(await readBalance(db.pool, 'source-1')).toBe(700);
    });
  });
});
