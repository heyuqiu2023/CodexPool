# ── Stage 1: Build frontend ──────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Production ─────────────────────
FROM node:20-alpine
WORKDIR /app

# Install build tools for better-sqlite3 native compilation, then clean up
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && apk del python3 make g++

COPY server/ ./server/
COPY --from=frontend-build /app/dist ./dist/
COPY docker-entrypoint.sh /app/

RUN mkdir -p /app/data /app/accounts && chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/codexpool.db

EXPOSE 3001
VOLUME ["/app/data", "/app/accounts"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
