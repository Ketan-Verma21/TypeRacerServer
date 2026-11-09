# Type Racer server image.
# Three stages: "deps" installs the production packages (including the native
# Kafka client), "build" compiles TypeScript, and "runtime" only gets the
# results of both, so the final image has no compilers and no dev packages.
# node:20-slim is Debian-based (not Alpine): the native Kafka client needs glibc.

# ---- deps: production packages, with the tools to compile native code ----
FROM node:20-slim AS deps
# @confluentinc/kafka-javascript downloads a prebuilt librdkafka binding and
# only compiles it from source if no prebuilt one matches. python3, make and
# g++ are for that fallback; ca-certificates for the HTTPS download.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- build: install everything, compile src/ -> dist/ ----
FROM node:20-slim AS build
WORKDIR /app

# Copy only the package files first, so Docker can reuse this layer
# (and skip `npm ci`) when only the source code changed.
COPY package.json package-lock.json ./
# --ignore-scripts: TypeScript only needs the type definitions, not the
# compiled Kafka binding (the deps stage builds that one).
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production packages + compiled code only ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Bundled quotes are read from ../data/quotes.json relative to dist/.
COPY data ./data

# Don't run as root: the official image ships a "node" user.
USER node

EXPOSE 3000
# Note: logs are JSON because stdout is not a terminal. Don't run this image
# with `-t`/`tty: true` — pino would try to load pino-pretty, a dev dependency.
CMD ["node", "dist/index.js"]
