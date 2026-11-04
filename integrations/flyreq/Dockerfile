FROM node:24-bookworm-slim
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev --no-audit --no-fund
COPY integrations/media-storage/package*.json ./integrations/media-storage/
RUN cd integrations/media-storage && npm ci --omit=dev --no-audit --no-fund
COPY backend/ ./backend/
COPY frontend/out/ ./frontend/out/
COPY integrations/ ./integrations/
ENV NODE_ENV=production FLYREQ_ROOT=/app PORT=8195 HOST=127.0.0.1
CMD ["node", "integrations/flyreq/gateway.mjs"]
