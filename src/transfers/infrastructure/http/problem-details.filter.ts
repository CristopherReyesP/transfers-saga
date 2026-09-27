import { STATUS_CODES } from 'node:http';
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
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

interface ProblemDetails {
  type: 'about:blank';
  title: string;
  status: number;
  detail: string;
  code: string;
}

type ErrorClass = new (...args: never[]) => Error;

const STATUS_BY_ERROR: ReadonlyArray<readonly [ErrorClass, HttpStatus]> = [
  [InvalidIdempotencyKey, HttpStatus.BAD_REQUEST],
  [InvalidAmount, HttpStatus.BAD_REQUEST],
  [InvalidCurrency, HttpStatus.BAD_REQUEST],
  [AccountNotFound, HttpStatus.NOT_FOUND],
  [TransferNotFound, HttpStatus.NOT_FOUND],
  [AccountLocked, HttpStatus.CONFLICT],
  [TransferInProgress, HttpStatus.CONFLICT],
  [IdempotencyKeyReused, HttpStatus.UNPROCESSABLE_ENTITY],
  [CurrencyMismatch, HttpStatus.UNPROCESSABLE_ENTITY],
];

// The lock is held only for the length of one local transaction.
const ACCOUNT_LOCKED_RETRY_AFTER_SECONDS = '1';

/**
 * Renders every error as RFC 9457 `application/problem+json`:
 * `{ type: 'about:blank', title, status, detail, code }`.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof AccountLocked) {
      response.setHeader('Retry-After', ACCOUNT_LOCKED_RETRY_AFTER_SECONDS);
    }
    const problem = this.toProblem(exception);
    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof HttpException) {
      return problem(
        exception.getStatus(),
        exception.constructor.name,
        httpExceptionDetail(exception),
      );
    }
    const mapped = STATUS_BY_ERROR.find(
      ([errorClass]) => exception instanceof errorClass,
    );
    if (mapped && exception instanceof Error) {
      return problem(mapped[1], exception.constructor.name, exception.message);
    }
    // Unknown errors may carry driver messages or credentials, so the client
    // gets a generic detail and only the log keeps the original.
    this.logger.error(
      'Unhandled error',
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : String(exception),
    );
    return problem(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'InternalServerError',
      'An unexpected error occurred',
    );
  }
}

function problem(status: number, code: string, detail: string): ProblemDetails {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    detail,
    code,
  };
}

/** Joins the validation messages that ValidationPipe puts in the body. */
function httpExceptionDetail(exception: HttpException): string {
  const body = exception.getResponse();
  const message =
    typeof body === 'object' && 'message' in body ? body.message : undefined;
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : exception.message;
}
