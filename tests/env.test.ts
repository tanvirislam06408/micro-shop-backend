import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config/env.js';

describe('Environment Configuration Validation', () => {
  it('validates a complete valid configuration and applies defaults', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/micro_shop_test',
    });

    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PORT).toBe(5000);
    expect(parsed.FRONTEND_URL).toBe('http://localhost:3000');
    expect(parsed.LOG_LEVEL).toBe('info');
    expect(parsed.BKASH_MERCHANT_NUMBER).toBe('01960515811');
    expect(parsed.MERCHANT_NAME).toBe('Micro-Shop BD');
    expect(parsed.DATABASE_URL).toBe(
      'postgresql://user:pass@localhost:5432/micro_shop_test',
    );
  });

  it('fails when DATABASE_URL is missing', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '5000',
      }),
    ).toThrow(/DATABASE_URL/i);
  });

  it('fails when DATABASE_URL is not a PostgreSQL connection string', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'mysql://localhost:3306/db',
      }),
    ).toThrow(/PostgreSQL connection string/i);
  });

  it('fails when PORT is invalid', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/micro_shop_test',
        PORT: '-100',
      }),
    ).toThrow(/PORT/i);
  });

  it('fails when FRONTEND_URL is not a valid URL', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/micro_shop_test',
        FRONTEND_URL: 'not-a-valid-url',
      }),
    ).toThrow(/FRONTEND_URL/i);
  });

  it('fails when BKASH_MERCHANT_NUMBER is invalid', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/micro_shop_test',
        BKASH_MERCHANT_NUMBER: '12345',
      }),
    ).toThrow(/BKASH_MERCHANT_NUMBER/i);
  });

  it('requires a custom ADMIN_API_KEY in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/micro_shop_prod',
      }),
    ).toThrow(/ADMIN_API_KEY/i);
  });
});
