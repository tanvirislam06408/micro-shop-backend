import dns from 'node:dns';
import net from 'node:net';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';

// Prevent Node 20/22 Happy Eyeballs 250ms per-address timeout (ETIMEDOUT)
// when connecting to remote cloud PostgreSQL (e.g. Neon us-east-2 pooler).
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === 'function') {
  net.setDefaultAutoSelectFamilyAttemptTimeout(5000);
}

let prisma: PrismaClient;

function normalizeConnectionString(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (
      parsed.searchParams.get('sslmode') === 'require' &&
      !parsed.searchParams.has('uselibpqcompat')
    ) {
      parsed.searchParams.set('uselibpqcompat', 'true');
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: normalizeConnectionString(env.DATABASE_URL),
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 30000,
    max: 10,
    keepAlive: true,
  });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });
}

if (env.NODE_ENV === 'production') {
  prisma = createPrismaClient();
} else {
  // Reuse client in dev to avoid exhausting connections on hot reload
  const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  prisma = globalForPrisma.prisma;
}

export { prisma };
