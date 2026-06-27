ARG NPM_VERSION=11.13.0

FROM node:24-bookworm-slim AS deps

ARG NPM_VERSION

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm install -g npm@${NPM_VERSION} \
  && npm ci

FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time placeholders satisfy fail-fast env validation while keeping real
# secrets in the runtime env file.
ENV DATABASE_URL="postgresql://crm:crm@postgres:5432/telestar_crm" \
  DIRECT_URL="postgresql://crm:crm@postgres:5432/telestar_crm" \
  AUTH_SECRET="build-time-placeholder" \
  ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" \
  NEXTAUTH_URL="http://localhost:3000"

RUN npm run build

FROM node:24-bookworm-slim AS runner

ARG NPM_VERSION

WORKDIR /app

ENV NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  DATABASE_URL="postgresql://crm:crm@postgres:5432/telestar_crm" \
  DIRECT_URL="postgresql://crm:crm@postgres:5432/telestar_crm" \
  AUTH_SECRET="build-time-placeholder" \
  ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" \
  NEXTAUTH_URL="http://localhost:3000"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install -g npm@${NPM_VERSION} \
  && npm ci --omit=dev \
  && npx prisma generate \
  && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY public ./public
COPY app ./app
COPY components ./components
COPY context ./context
COPY hooks ./hooks
COPY lib ./lib
COPY workers ./workers
COPY scripts ./scripts
COPY auth.config.ts auth.ts instrumentation.ts next.config.ts proxy.ts tsconfig.json ./

RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
