import { oraclePoolConfigFromEnv } from './oracle-pool-config.js';

describe('oraclePoolConfigFromEnv', () => {
  it('builds the pool attributes from the environment', () => {
    expect(
      oraclePoolConfigFromEnv({
        ORACLE_USER: 'saga',
        ORACLE_PASSWORD: 'secret',
        ORACLE_CONNECT_STRING: 'localhost:1521/FREEPDB1',
      }),
    ).toEqual({
      user: 'saga',
      password: 'secret',
      connectString: 'localhost:1521/FREEPDB1',
    });
  });

  it('fails fast and names every missing setting', () => {
    expect(() =>
      oraclePoolConfigFromEnv({ ORACLE_PASSWORD: 'secret' }),
    ).toThrow('Missing Oracle settings: ORACLE_USER, ORACLE_CONNECT_STRING');
  });
});
