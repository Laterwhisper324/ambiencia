# ==============================================================================
# Stage 1: Build Frontend (React + Vite + TypeScript + Tailwind)
# ==============================================================================
FROM node:22-bookworm-slim AS client-builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Build Backend (Node.js + Express + Socket.IO + better-sqlite3)
# ==============================================================================
FROM node:22-bookworm-slim AS server-builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# ==============================================================================
# Stage 3: Production Runtime (Continuous Node Process)
# ==============================================================================
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3001
ENV UPLOAD_DIR=/data/uploads
ENV DATABASE_PATH=/data/ambiencia.sqlite

WORKDIR /app

# Copy compiled frontend static bundle
COPY --from=client-builder /app/client/dist ./client/dist

# Copy compiled backend and production node_modules
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/dist ./server/dist

# Create persistent volume mount directory
RUN mkdir -p /data/uploads

WORKDIR /app/server
EXPOSE 3001

CMD ["node", "dist/index.js"]
