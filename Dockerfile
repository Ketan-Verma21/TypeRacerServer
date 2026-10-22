# Type Racer server image.
# Two stages: "build" has the dev tools to compile TypeScript; "runtime" only
# has the compiled JS and production packages, so the final image stays small.
# node:20-slim is Debian-based (not Alpine): the native Kafka client in Phase 7 needs glibc.

# ---- build: install everything, compile src/ -> dist/ ----
FROM node:20-slim AS build
WORKDIR /app

# Copy only the package files first, so Docker can reuse this layer
# (and skip `npm ci`) when only the source code changed.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production dependencies + compiled code only ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Bundled quotes are read from ../data/quotes.json relative to dist/.
COPY data ./data

# Don't run as root: the official image ships a "node" user.
USER node

EXPOSE 3000
# Note: logs are JSON because stdout is not a terminal. Don't run this image
# with `-t`/`tty: true` — pino would try to load pino-pretty, a dev dependency.
CMD ["node", "dist/index.js"]
