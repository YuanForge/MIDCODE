FROM migration/video-gateway:20261103
USER root
WORKDIR /app/media-storage
COPY media-storage/package.json media-storage/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY media-storage/store.mjs ./
WORKDIR /app
RUN mkdir -p /app/toonflow && cp /app/browserBridge.js /app/mediaProvider.ts /app/toonflow/
COPY toonflow/gateway.mjs /app/toonflow/gateway.mjs
CMD ["node", "/app/toonflow/gateway.mjs"]
