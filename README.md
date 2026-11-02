# Al Maha Farm — Elite Agro Cloud

Precision agriculture platform for managing farm operations end-to-end: harvest tracking, fertigation management, EC/pH monitoring, weather integration, satellite remote sensing, task management, and real-time analytics.

## Features

- **Harvest Management** — Entry, dashboard, and reporting with PDF/Excel export
- **Fertigation** — Recipe-based fertigation entry with drain percentage tracking
- **EC/pH Monitoring** — Dual-valve readings with historical charting
- **Weather Integration** — OpenWeatherMap API + manual weather logs + interactive map
- **Satellite Remote Sensing** — SentinelHub NDVI imagery for field monitoring
- **Task Management** — Kanban board with assignments, checklists, and comments
- **Smart Alerts** — Configurable threshold rules with in-app notification center
- **Report Builder** — Multi-step wizard for custom reports (Excel/PDF)
- **Data Import** — CSV/Excel importer with column mapping
- **Field Heatmap** — Leaflet map with metric-colored overlays
- **Audit Logging** — Full audit trail of system actions
- **File Attachments** — Photo/document uploads with S3 or local storage
- **Real-Time Updates** — WebSocket layer for live data push
- **Dark Mode** — Light/Dark/System theme toggle
- **RTL & Arabic** — Full Right-to-Left layout with Arabic translations
- **Mobile App** — Expo/React Native with offline support and sync

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Material-UI 7, React Router 7, Recharts, Leaflet, React Query |
| Backend | Node.js, Express, TypeScript, Zod validation |
| Database | PostgreSQL (PostGIS), Redis |
| Auth | JWT + refresh tokens, Microsoft SSO (Azure AD), Role-based access |
| Storage | AWS S3 (or local filesystem fallback) |
| Real-time | Socket.io |
| Mobile | Expo SDK 54, React Native |
| CI/CD | GitHub Actions, Docker, Railway/Nixpacks |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ with PostGIS
- Redis

### 1. Clone and install

```bash
git clone https://github.com/raxgax-commits/al-maha-farm.git
cd al-maha-farm

# Frontend
npm install --legacy-peer-deps

# Backend
cd backend
npm install
cd ..
```

### 2. Configure environment

```bash
# Copy example env files and fill in your values
cp .env.example .env
cp backend/.env.example backend/.env
```

Key variables to set:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` — At least 32 characters
- `REACT_APP_API_URL` — Backend API URL (default: `http://localhost:3001/api/v1`)

### 3. Run database migrations

```bash
cd backend
node scripts/run-migrations.js
```

### 4. Start development servers

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
npm start
```

The frontend runs on `http://localhost:3000` and the backend on `http://localhost:3001`.

### 5. Mobile app (optional)

```bash
cd mobile
npm install
npx expo start
```

## Project Structure

```
al-maha-farm/
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── contexts/           # React contexts (Auth, Theme, Notifications, Query)
│   ├── hooks/              # Custom hooks (useSocket, useApiQuery)
│   ├── pages/              # Page components (routes)
│   ├── utils/              # Utilities (API, PDF export, locale, trends)
│   └── i18n/               # Translations (en, ar)
├── backend/
│   ├── src/
│   │   ├── api/            # Routes and middleware
│   │   ├── services/       # Business logic
│   │   ├── db/             # Database client and migrations
│   │   ├── websocket/      # Socket.io setup
│   │   └── config/         # App configuration
│   └── docker/             # Docker files
├── mobile/                 # Expo/React Native app
├── e2e/                    # Playwright E2E tests
├── docs/                   # Documentation
├── scripts/                # Backup/restore scripts
└── .github/workflows/      # CI/CD pipelines
```

## API Documentation

When the backend is running, Swagger UI is available at:

```
http://localhost:3001/api/docs
```

## User Roles

| Role | Access |
|------|--------|
| CEO | Full access to everything |
| Farm Manager | Full operational access |
| Operation Manager | Operational data entry and reports |
| Worker | Limited to assigned tasks and data entry |

## Scripts

```bash
# Frontend
npm start          # Development server
npm run build      # Production build
npm test           # Run tests
npm run test:e2e   # Run Playwright E2E tests

# Backend
cd backend
npm run dev        # Development server (ts-node-dev)
npm run build      # Compile TypeScript
npm start          # Production server
npm test           # Run Jest tests
npm run lint       # Type checking
```

## Deployment

The app is configured for deployment on **Railway** via Nixpacks. See `railway.toml` and `nixpacks.toml` for configuration.

Docker support is also available:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

See `docs/PRODUCTION_CHECKLIST.md` for a full production deployment guide.

## License

Private — All rights reserved.
