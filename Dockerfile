# Frontend Dockerfile - Simple approach
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Accept Railway env vars as build args
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL

ARG REACT_APP_SENTINELHUB_WMS_URL
ARG REACT_APP_SENTINELHUB_INSTANCE_ID
ENV REACT_APP_SENTINELHUB_WMS_URL=$REACT_APP_SENTINELHUB_WMS_URL
ENV REACT_APP_SENTINELHUB_INSTANCE_ID=$REACT_APP_SENTINELHUB_INSTANCE_ID

ARG REACT_APP_SENTRY_DSN
ARG REACT_APP_VERSION
ENV REACT_APP_SENTRY_DSN=$REACT_APP_SENTRY_DSN
ENV REACT_APP_VERSION=$REACT_APP_VERSION

# Increase memory for the build and disable CI warnings-as-errors
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV CI=false

# Build the app
RUN npm run build

# Production stage - simple serve
FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/build ./build
RUN chown -R appuser:appgroup /app

USER appuser

ENV PORT=3000

CMD ["sh", "-c", "serve -s build -l $PORT"]
