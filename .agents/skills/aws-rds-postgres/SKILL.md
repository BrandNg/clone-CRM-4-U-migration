---
name: aws-rds-postgres
description: >-
  Guides and best practices for migrating, configuring, and connecting Prisma
  and Next.js applications to AWS RDS or Aurora PostgreSQL. Covers connection
  parameters, connection pooling strategies, RDS Proxy configuration, connection
  pinning mitigation (due to Prisma's prepared statements), and key CloudWatch metrics.
  Use when users ask about "AWS RDS", "RDS PostgreSQL", "Aurora", "RDS Proxy",
  "AWS migration", "migrate PostgreSQL to AWS", "DATABASE_URL on AWS", or
  "connection pinning".
---

# AWS RDS & Aurora Postgres for Prisma

Guide the agent and developer through migrating, configuring, and optimizing connections to AWS RDS or Aurora PostgreSQL (including Serverless v2) when using Prisma ORM and serverless runtimes.

---

## 1. Connection Configurations

AWS RDS and Aurora require specific URL formats and security parameters. Update `.env` or system variables using these formats.

### Connection String Format
```
postgresql://<db_user>:<db_password>@<rds_endpoint>:<port>/<db_name>?schema=public&sslmode=require
```

### SSL Certificates
AWS RDS/Aurora PostgreSQL endpoints require SSL. 
- In development/production environments, use `sslmode=require` or `sslmode=verify-full`.
- If using `verify-full`, download the AWS global root certificate (`global-bundle.pem`) and append it to the connection parameters:
  ```
  &sslaccept=strict&sslrootcert=global-bundle.pem
  ```

---

## 2. Serverless Connection Pooling (Next.js/Vercel)

Next.js deployed to serverless environments (like Vercel) spawns ephemeral functions. Each invocation can open a new database connection, easily exhausting the RDS connection limit.

### Best Practices for Prisma Client Initialization
Ensure the Prisma Client is instantiated as a singleton so it persists across hot reloads in serverless environments:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### Connection Limits
Keep the connection pool size small per Vercel function:
- Append `?connection_limit=3` (or maximum `5`) to your `DATABASE_URL` in serverless production settings.
- Avoid calling `await prisma.$disconnect()` at the end of requests, as creating new connections on every function invocation is extremely expensive.

---

## 3. AWS RDS Proxy & Connection Pinning Warning

AWS RDS Proxy provides database failover support and protects databases from connection spikes, but has a known incompatibility with Prisma due to **Connection Pinning**.

### The Pinning Problem
1. **Prepared Statements**: Prisma uses prepared statements under the hood for type safety and query planning.
2. **RDS Proxy Session Pinning**: When RDS Proxy detects prepared statements in a connection session, it pins that client connection to a single backend database connection.
3. **No Multiplexing**: Once pinned, the RDS Proxy cannot share or multiplex that database connection with other incoming serverless requests, defeating the purpose of proxy connection pooling.

### Mitigation Strategies
If using RDS Proxy:
- Monitor the CloudWatch metric **`DatabaseConnectionsCurrentlySessionPinned`**.
- If pinning is high and causing connection exhaustion on RDS, bypass RDS Proxy for Prisma or use **PgBouncer** (transaction mode) or **Prisma Accelerate** as a dedicated connection pooler.
- Separate the direct migrations endpoint: migrations must run against the direct RDS writer endpoint, never through RDS Proxy.

---

## 4. BullMQ Workers on AWS

Since BullMQ workers run on an always-on host (like ECS, EC2, or Elastic Beanstalk), they handle database connections differently than serverless functions:
- They can sustain long-lived TCP connections.
- Set a higher connection limit for the worker pool: `?connection_limit=15` or `20` depending on the number of concurrent worker processes.
- Connect directly to the RDS writer endpoint to utilize interactive transactions safely.
