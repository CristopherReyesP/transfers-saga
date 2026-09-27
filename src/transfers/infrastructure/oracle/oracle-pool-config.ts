import type { PoolAttributes } from 'oracledb';

const REQUIRED_SETTINGS = [
  'ORACLE_USER',
  'ORACLE_PASSWORD',
  'ORACLE_CONNECT_STRING',
] as const;

/** Reads the pool settings from the environment and fails fast on any gap. */
export function oraclePoolConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PoolAttributes {
  const missing = REQUIRED_SETTINGS.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing Oracle settings: ${missing.join(', ')}`);
  }
  return {
    user: env.ORACLE_USER,
    password: env.ORACLE_PASSWORD,
    connectString: env.ORACLE_CONNECT_STRING,
  };
}
