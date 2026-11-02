# Architecture Overview

## System Diagram

```
                     ┌─────────────────┐
                     │   Cloudflare    │  (optional CDN)
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────┴──────┐ ┌─────┴─────┐ ┌───────┴───────┐
     │  React SPA    │ │  Express  │ │   Mobile App  │
     │  (Frontend)   │ │  (Backend)│ │  (React Native│
     │  Port 3000    │ │  Port 3001│ │   / Expo)     │
     └───────────────┘ └─────┬─────┘ └───────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────┴──────┐ ┌─────┴─────┐ ┌───────┴───────┐
     │  PostgreSQL   │ │   Redis   │ │  AWS S3       │
     │  (Primary DB) │ │  (Cache/  │ │  (Backups/    │
     │               │ │   Queue)  │ │   Uploads)    │
     └───────────────┘ └───────────┘ └───────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Material UI 5, React Query, React Router 6 |
| Backend | Node.js 20, Express 4, TypeScript |
| Database | PostgreSQL 15+ (with optional PostGIS) |
| Cache/Queue | Redis (ioredis) + BullMQ |
| Auth | JWT (HS256) + bcryptjs + API keys |
| Monitoring | Sentry (errors), Prometheus metrics, Pino logging |
| CI/CD | GitHub Actions, Docker, Railway |
| Testing | Jest (unit), Playwright (E2E), k6 (load) |

## Module Map

### Core Data Entry
- **EC/PH Entry** - Daily electrical conductivity and pH readings per valve
- **Fertigation** - Fertilizer injection tracking with recipe-based dosing
- **Harvest** - Yield recording by field and crop

### Farm Operations
- **IPM** - Integrated Pest Management (pesticides, bio-control, scouting)
- **Inventory** - Stock management with auto-deduction from fertigation/IPM
- **Manpower** - Worker records, shifts, time tracking
- **Tasks** - Task assignment and tracking with checklists

### Environmental
- **Weather & Soil** - Weather station API integration + soil sensor readings
- **GIS Map** - ArcGIS feature service integration + file uploads (KMZ, SHP, GeoJSON)
- **Remote Sensing** - SentinelHub satellite imagery

### Admin & Config
- **User Management** - RBAC with 5 roles + granular permissions
- **Feature Flags** - Toggle features per role without redeployment
- **API Integrations** - Weather station and sensor API configuration
- **Webhooks** - Event-driven HTTP callbacks
- **Audit Log** - Comprehensive activity tracking

## Background Jobs

Jobs run via BullMQ (Redis) with automatic setInterval fallback:

| Job | Schedule | Description |
|-----|----------|-------------|
| analytics-aggregate | Every 6 hours | Pre-compute dashboard stats |
| weather-sync | Every 15 minutes | Poll weather station APIs |
| phi-check | Every hour | Check pre-harvest interval alerts |
| webhook-delivery | On demand | Deliver HTTP webhooks with retries |
| db-backup | Daily at 2 AM | pg_dump to S3 (if configured) |

## Security

- JWT authentication with refresh tokens
- 5-tier RBAC: CEO > Farm Manager > Operation Manager > Agronomist > Worker
- Granular per-user module permissions
- Rate limiting (express-rate-limit + optional Redis store)
- Helmet security headers + CSP
- XSS sanitization on all inputs
- SSRF protection on outbound URL validation
- Sentry error tracking
