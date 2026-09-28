import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  countTransfers,
  startTransfersApp,
  transferBody,
} from './http/transfers-app.js';
import {
  readBalance,
  seedAccount,
  useOracleTestDb,
} from './oracle/oracle-test-db.js';

const PROBLEM_JSON = /^application\/problem\+json/;

describe('Transfers HTTP API', () => {
  const db = useOracleTestDb();
  let app: INestApplication;

  beforeAll(async () => {
    app = await startTransfersApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await seedAccount(db.pool, 'source-1', 1000, 'USD');
  });

  const post = (key: string | undefined, body: object = transferBody()) => {
    const call = request(app.getHttpServer()).post('/transfers');
    return (key === undefined ? call : call.set('Idempotency-Key', key)).send(
      body,
    );
  };

  async function expectNothingPersisted() {
    expect(await countTransfers(db.pool)).toBe(0);
    expect(await readBalance(db.pool, 'source-1')).toBe(1000);
  }

  it('completes a transfer, debits the source once, and serves it by id', async () => {
    const created = await post('key-1');

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      status: 'COMPLETED',
      sourceAccountId: 'source-1',
      destinationAccount: 'destination-1',
      amount: { minorUnits: 300, currency: 'USD' },
    });
    expect(created.headers.location).toBe(`/transfers/${created.body.id}`);
    expect(await readBalance(db.pool, 'source-1')).toBe(700);

    const fetched = await request(app.getHttpServer()).get(
      `/transfers/${created.body.id}`,
    );
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);
  });

  it.each([
    ['a missing', undefined],
    ['a blank', ' '],
    ['an oversized', 'k'.repeat(256)],
    ['a non-ASCII', 'clé-1'],
  ])(
    'rejects %s Idempotency-Key with 400 and persists nothing',
    async (_label, key) => {
      const response = await post(key);

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.body).toMatchObject({
        status: 400,
        code: 'InvalidIdempotencyKey',
      });
      await expectNothingPersisted();
    },
  );

  it.each([
    ['no amount', { sourceAccountId: 'source-1', destinationAccount: 'd-1' }],
    ['an unknown field', { ...transferBody(), extra: true }],
    [
      'a non-integer amount',
      { ...transferBody(), amount: { minorUnits: 1.5, currency: 'USD' } },
    ],
    [
      'a string amount',
      { ...transferBody(), amount: { minorUnits: '300', currency: 'USD' } },
    ],
    ['an empty source account', transferBody({ sourceAccountId: '' })],
  ])(
    'rejects a body with %s with 400 and persists nothing',
    async (_label, body) => {
      const response = await post('key-1', body);

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.body).toMatchObject({
        status: 400,
        code: 'BadRequestException',
      });
      await expectNothingPersisted();
    },
  );

  it.each([
    ['a zero amount', transferBody({ minorUnits: 0 }), 'InvalidAmount'],
    [
      'a lowercase currency',
      transferBody({ currency: 'usd' }),
      'InvalidCurrency',
    ],
  ])(
    'rejects %s through the domain rules with 400',
    async (_label, body, code) => {
      const response = await post('key-1', body);

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.body).toMatchObject({ status: 400, code });
      await expectNothingPersisted();
    },
  );

  it('replays the same key and payload with an identical response and one debit', async () => {
    const first = await post('key-1');
    const replay = await post('key-1');

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers.location).toBe(first.headers.location);
    expect(await countTransfers(db.pool)).toBe(1);
    expect(await readBalance(db.pool, 'source-1')).toBe(700);
  });

  it('answers 422 when the same key comes with a different payload', async () => {
    await post('key-1');
    const reused = await post('key-1', transferBody({ minorUnits: 500 }));

    expect(reused.status).toBe(422);
    expect(reused.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(reused.body).toMatchObject({
      type: 'about:blank',
      status: 422,
      code: 'IdempotencyKeyReused',
    });
    expect(await countTransfers(db.pool)).toBe(1);
    expect(await readBalance(db.pool, 'source-1')).toBe(700);
  });

  it('reverses a rejected credit with 201 REVERSED and restores the balance', async () => {
    const response = await post(
      'key-1',
      transferBody({ destinationAccount: 'reject-closed-account' }),
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'REVERSED',
      failureReason: expect.any(String),
    });
    expect(await readBalance(db.pool, 'source-1')).toBe(1000);
  });

  it('completes a timed-out credit that the destination reports as credited', async () => {
    const response = await post(
      'key-1',
      transferBody({ destinationAccount: 'timeout-credited-1' }),
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'COMPLETED' });
    expect(await readBalance(db.pool, 'source-1')).toBe(700);
  });

  it('answers 201 FAILED on insufficient funds without debiting', async () => {
    const response = await post('key-1', transferBody({ minorUnits: 5000 }));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'FAILED',
      failureReason: expect.any(String),
    });
    expect(response.headers.location).toBe(`/transfers/${response.body.id}`);
    expect(await readBalance(db.pool, 'source-1')).toBe(1000);
  });

  it('replays an insufficient-funds failure after topping up without debiting', async () => {
    const body = transferBody({ minorUnits: 5000 });
    const first = await post('key-1', body);

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      id: expect.any(String),
      status: 'FAILED',
    });
    expect(await readBalance(db.pool, 'source-1')).toBe(1000);

    const connection = await db.pool.getConnection();
    try {
      await connection.execute(
        'UPDATE accounts SET balance_minor = :balance WHERE id = :id',
        { balance: 6000, id: 'source-1' },
        { autoCommit: true },
      );
    } finally {
      await connection.close();
    }

    const replay = await post('key-1', body);

    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(await readBalance(db.pool, 'source-1')).toBe(6000);
    expect(await countTransfers(db.pool)).toBe(1);
  });

  it('answers 404 for an unknown source account and persists nothing', async () => {
    const response = await post(
      'key-1',
      transferBody({ sourceAccountId: 'missing-1' }),
    );

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(response.body).toMatchObject({
      status: 404,
      code: 'AccountNotFound',
    });
    await expectNothingPersisted();
  });

  it('answers 404 for an unknown transfer id', async () => {
    const response = await request(app.getHttpServer()).get(
      '/transfers/does-not-exist',
    );

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: expect.any(String),
      code: 'TransferNotFound',
    });
  });
});
