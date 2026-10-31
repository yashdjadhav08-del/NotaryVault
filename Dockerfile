# Production Dockerfile for NotaryVault Backend Storage & API Server
FROM node:22-alpine AS runner

WORKDIR /app

# Install build dependencies if native compilation needed
RUN apk add --no-cache python3 make g++

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev --ignore-scripts

# Copy server code and contract ABIs
COPY server/ ./server/
COPY src/contracts/ ./src/contracts/
COPY contracts/ ./contracts/

# Persistent storage mount point for SQLite database and uploaded PDFs
RUN mkdir -p /app/storage/uploads
VOLUME ["/app/storage"]

# Production environment defaults
ENV NODE_ENV=production
ENV PORT=5001
ENV STORAGE_DIR=/app/storage
ENV UPLOADS_DIR=/app/storage/uploads
ENV DATABASE_PATH=/app/storage/notaryvault.db

EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5001/api/health || exit 1

# Start the Node.js backend
CMD ["node", "server/index.js"]
