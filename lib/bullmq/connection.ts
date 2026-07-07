import { Redis, type RedisOptions } from 'ioredis';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

function getRedisConfig(): { url: string; opts: RedisOptions } {
  const url = process.env.REDIS_URL || DEFAULT_REDIS_URL;
  const isTls = url.startsWith('rediss://');
  return {
    url,
    opts: {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
      tls: isTls ? {} : undefined,
    },
  };
}

let connection: Redis | null = null;

function createConnection(): Redis {
  const { url, opts } = getRedisConfig();
  const client = new Redis(url, opts);
  client.on('error', (err) => {
    console.error('[bullmq] Redis connection error:', err.message);
  });
  client.on('connect', () => {
    console.log('[bullmq] Redis connected');
  });
  client.on('close', () => {
    console.warn('[bullmq] Redis connection closed');
  });
  return client;
}

export function getConnection(): Redis {
  if (!connection) {
    connection = createConnection();
  }
  return connection;
}

export async function closeConnection(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
