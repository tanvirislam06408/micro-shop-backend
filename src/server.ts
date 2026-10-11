import { env } from './config/env.js';
import { app } from './app.js';
import { prisma } from './lib/prisma.js';

const server = app.listen(env.PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: `Server running on port ${env.PORT}`,
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    }),
  );
});

// --- Graceful shutdown ---
const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

for (const signal of signals) {
  process.on(signal, () => {
    console.log(
      JSON.stringify({
        level: 'info',
        message: `Received ${signal}, shutting down gracefully...`,
        timestamp: new Date().toISOString(),
      }),
    );

    server.close(async () => {
      try {
        await prisma.$disconnect();
        console.log(
          JSON.stringify({
            level: 'info',
            message: 'Database disconnected',
            timestamp: new Date().toISOString(),
          }),
        );
      } catch (err) {
        console.error('Error disconnecting from database:', err);
      }
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown fails
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  });
}

process.on('unhandledRejection', (reason) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Unhandled rejection',
      reason: reason instanceof Error ? reason.message : String(reason),
      timestamp: new Date().toISOString(),
    }),
  );
});

process.on('uncaughtException', (err) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Uncaught exception',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
});
