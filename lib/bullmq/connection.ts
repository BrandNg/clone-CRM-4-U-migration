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
      // Never give up reconnecting. The worker is an always-on process: if it boots
      // before Redis is ready (compose ordering, ElastiCache cold start) or Redis blips,
      // returning null here would permanently detach the connection while the process
      // stays alive — jobs then pile up at status='queued' and never execute. Keep
      // retrying with a capped backoff so the worker self-heals.
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
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
