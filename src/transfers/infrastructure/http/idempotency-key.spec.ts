import {
  InvalidIdempotencyKey,
  parseIdempotencyKey,
} from './idempotency-key.js';

describe('parseIdempotencyKey', () => {
  it.each([
    ['a single character', 'a'],
    ['a UUID', '5f0c6d1e-8a4b-4c2e-9f3a-1b2c3d4e5f60'],
    ['the visible ASCII edges', '!~'],
    ['255 characters', 'k'.repeat(255)],
  ])('accepts %s unchanged', (_label, key) => {
    expect(parseIdempotencyKey(key)).toBe(key);
  });

  it.each([
    ['a missing header', undefined],
    ['an empty value', ''],
    ['256 characters', 'k'.repeat(256)],
    ['a space', 'key 1'],
    ['a control character', 'key\u0001'],
    ['a non-ASCII character', 'clé-1'],
    ['a repeated header', ['key-1', 'key-2']],
  ])('rejects %s', (_label, header) => {
    expect(() => parseIdempotencyKey(header)).toThrow(InvalidIdempotencyKey);
    expect(() => parseIdempotencyKey(header)).toThrow(/Idempotency-Key/);
  });
});
