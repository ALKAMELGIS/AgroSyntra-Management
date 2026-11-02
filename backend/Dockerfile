# Backend Dockerfile - multi-stage for smaller production image
FROM node:20-alpine AS builder

WORKDIR /app
RUN apk add --no-cache dumb-init

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage — only runtime dependencies
FROM node:20-alpine

RUN apk add --no-cache dumb-init
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
RUN chown -R appuser:appgroup /app

USER appuser

ENV PORT=3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
