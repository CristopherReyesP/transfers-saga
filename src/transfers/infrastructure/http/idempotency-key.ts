import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export class InvalidIdempotencyKey extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

const VISIBLE_ASCII_KEY = /^[\x21-\x7E]{1,255}$/;

/**
 * Accepts 1 to 255 visible ASCII characters (0x21 to 0x7E), which also fits
 * the key column. Throws InvalidIdempotencyKey for anything else.
 */
export function parseIdempotencyKey(
  header: string | string[] | undefined,
): string {
  if (header === undefined) {
    throw new InvalidIdempotencyKey('Idempotency-Key header is required');
  }
  if (typeof header !== 'string' || !VISIBLE_ASCII_KEY.test(header)) {
    throw new InvalidIdempotencyKey(
      'Idempotency-Key header must be one value of 1 to 255 visible ASCII characters',
    );
  }
  return header;
}

/** Injects the validated `Idempotency-Key` request header. */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    parseIdempotencyKey(
      context.switchToHttp().getRequest<Request>().headers['idempotency-key'],
    ),
);
