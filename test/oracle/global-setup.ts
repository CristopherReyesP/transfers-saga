import { readFile } from 'node:fs/promises';
import oracledb from 'oracledb';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

export interface OracleConnectionInfo {
  user: string;
  password: string;
  connectString: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    oracle: OracleConnectionInfo;
  }
}

const IMAGE = 'gvenzl/oracle-free:23-slim-faststart';
const PORT = 1521;
const APP_USER = 'saga';
const APP_USER_PASSWORD = 'saga';
const SCHEMA_FILE = new URL(
  '../../src/transfers/infrastructure/oracle/schema.sql',
  import.meta.url,
);

async function applySchema(connection: OracleConnectionInfo): Promise<void> {
  // oracledb runs one statement per call, so the script is split on `;`.
  const statements = (await readFile(SCHEMA_FILE, 'utf8'))
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  const db = await oracledb.getConnection(connection);
  try {
    for (const statement of statements) await db.execute(statement);
  } finally {
    await db.close();
  }
}

export default async function setup(project: TestProject) {
  const container = await new GenericContainer(IMAGE)
    .withEnvironment({
      ORACLE_PASSWORD: 'oracle',
      APP_USER,
      APP_USER_PASSWORD,
    })
    .withExposedPorts(PORT)
    .withWaitStrategy(Wait.forLogMessage('DATABASE IS READY TO USE!'))
    .withStartupTimeout(300_000)
    .start();
  const connection: OracleConnectionInfo = {
    user: APP_USER,
    password: APP_USER_PASSWORD,
    connectString: `${container.getHost()}:${container.getMappedPort(PORT)}/FREEPDB1`,
  };
  try {
    await applySchema(connection);
  } catch (error) {
    await container.stop();
    throw error;
  }
  project.provide('oracle', connection);
  return async () => {
    await container.stop();
  };
}
