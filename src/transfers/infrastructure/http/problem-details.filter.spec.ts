import { STATUS_CODES } from 'node:http';
import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  type INestApplication,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  AccountLocked,
  AccountNotFound,
  IdempotencyKeyReused,
  TransferInProgress,
  TransferNotFound,
} from '../../application/application-errors.js';
import {
  CurrencyMismatch,
  InvalidAmount,
  InvalidCurrency,
} from '../../domain/domain-errors.js';
import { InvalidIdempotencyKey } from './idempotency-key.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';

const SECRET = 'ORA-12541: no listener at saga/secret@db-internal:1521';

let thrown: unknown;

@Controller('failures')
class FailingController {
  @Get()
  fail(): never {
    throw thrown;
  }
}

describe('ProblemDetailsFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FailingController],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const failWith = (error: unknown) => {
    thrown = error;
    return request(app.getHttpServer()).get('/failures');
  };

  it.each([
    [400, new InvalidAmount('Amount must be a non-negative safe integer')],
    [400, new InvalidCurrency('Currency must contain three uppercase letters')],
    [400, new InvalidIdempotencyKey('Idempotency-Key header is required')],
    [404, new AccountNotFound('source-1')],
    [404, new TransferNotFound('transfer-1')],
    [409, new AccountLocked('source-1')],
    [409, new TransferInProgress('key-1')],
    [422, new IdempotencyKeyReused('key-1')],
    [422, new CurrencyMismatch('Currencies must match')],
  ])('answers %i for %s', async (status, error) => {
    const response = await failWith(error);

    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(response.body).toEqual({
      type: 'about:blank',
      title: STATUS_CODES[status],
      status,
      detail: error.message,
      code: error.constructor.name,
    });
  });

  it('asks the client to retry an AccountLocked after one second', async () => {
    const response = await failWith(new AccountLocked('source-1'));
    expect(response.headers['retry-after']).toBe('1');
  });

  it('sends no Retry-After for other conflicts', async () => {
    const response = await failWith(new TransferInProgress('key-1'));
    expect(response.status).toBe(409);
    expect(response.headers['retry-after']).toBeUndefined();
  });

  it('keeps the status of a framework HttpException, such as a failed validation', async () => {
    const response = await failWith(
      new BadRequestException([
        'amount must be an object',
        'property extra should not exist',
      ]),
    );

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: expect.any(String),
      code: 'BadRequestException',
    });
    expect(response.body.detail).toContain('amount must be an object');
    expect(response.body.detail).toContain('property extra should not exist');
  });

  it('renders an unknown route as a problem too', async () => {
    const response = await request(app.getHttpServer()).get('/nowhere');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NotFoundException',
    });
  });

  it.each([
    ['an unexpected error', new Error(SECRET)],
    ['a thrown non-error value', SECRET],
  ])(
    'answers 500 with a generic detail for %s and logs it',
    async (_label, error) => {
      const logError = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const response = await failWith(error);

      expect(response.status).toBe(500);
      expect(response.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: expect.any(String),
        code: 'InternalServerError',
      });
      expect(response.text).not.toContain('ORA-12541');
      expect(response.text).not.toContain('secret');
      const loggedArgs = logError.mock.calls.flat();
      expect(
        loggedArgs.some(
          (arg) =>
            arg === error ||
            (typeof arg === 'string' && arg.includes('ORA-12541')),
        ),
      ).toBe(true);
    },
  );
});
