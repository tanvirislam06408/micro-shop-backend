import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    env: {
      NODE_ENV: 'test',
      PORT: '5001',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/micro_shop_test?schema=public',
      FRONTEND_URL: 'http://localhost:3000',
      LOG_LEVEL: 'error',
    },
  },
});
