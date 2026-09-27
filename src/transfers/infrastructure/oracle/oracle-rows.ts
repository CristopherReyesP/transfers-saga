import oracledb, { type ExecuteOptions } from 'oracledb';

/** Fetches rows as objects keyed by the upper-case column names. */
export const OBJECT_ROWS: ExecuteOptions = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
};

/**
 * NUMBER(19) holds more digits than a JS number represents exactly. Any such
 * value arrives as a float of at least 2^53, which is not a safe integer.
 */
export function toMinorUnits(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${value} minor units exceed the safe integer range`);
  }
  return value;
}
