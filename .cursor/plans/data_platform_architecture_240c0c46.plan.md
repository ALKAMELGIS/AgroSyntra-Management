---
name: Data Platform Architecture
overview: Architectural guidance for building a robust, scalable data-heavy web application handling geospatial, time-series, and analytics workloads for farm management.
todos:
  - id: todo-1769685974268-vn2bh0krm
    content: ""
    status: pending
isProject: false
---

# Data Platform Architecture Guide

## 1. Architecture Division

The key principle: **separate concerns by data lifecycle stage, not just by "frontend/backend"**.

```mermaid
flowchart TB
    subgraph presentation [Presentation Layer]
        WebApp[React Web App]
        MobileApp[Mobile App]
    end
    
    subgraph api [API Layer]
        Gateway[API Gateway]
        GraphQL[GraphQL/REST API]
    end
    
    subgraph services [Service Layer]
        FarmMgmt[Farm Management Service]
        GeoService[Geospatial Service]
        Analytics[Analytics Service]
        TimeSeries[Time-Series Service]
    end
    
    subgraph processing [Processing Layer]
        BatchJobs[Batch Processing]
        StreamProc[Stream Processing]
        MLPipeline[ML Pipeline]
    end
    
    subgraph storage [Storage Layer]
        HotStore[Hot Storage - Fast Access]
        WarmStore[Warm Storage - Recent Data]
        ColdStore[Cold Storage - Archive]
        Cache[Distributed Cache]
    end
    
    presentation --> api
    api --> services
    services --> processing
    services --> storage
    processing --> storage
```



**Recommended division:**


| Layer            | Responsibility                                        | Team Ownership |
| ---------------- | ----------------------------------------------------- | -------------- |
| **Presentation** | Render, interact, visualize. No business logic.       | Frontend team  |
| **API**          | Authentication, rate limiting, request routing. Thin. | Platform team  |
| **Services**     | Domain logic, validation, orchestration. Stateless.   | Domain teams   |
| **Processing**   | Heavy computation, ETL, ML. Async, idempotent.        | Data team      |
| **Storage**      | Persistence. Right tool for right data shape.         | Platform team  |


**Key trade-off:** Monolith vs microservices early on.

- **Recommendation:** Start with a **modular monolith** (single deployable, clear internal boundaries). Extract services only when you have clear scaling or team-ownership reasons.

---

## 2. Data Flow Patterns

For your mix of data types, you need **three distinct flow patterns**:

### Pattern A: Request-Response (Farm Management, CRUD)

```
User -> API -> Service -> Database -> Response
```

- Synchronous, simple
- Use for: field records, user settings, master data
- Cache aggressively at API layer (Redis/CDN)

### Pattern B: Query-Time Aggregation (Analytics, Dashboards)

```
User -> API -> Pre-computed Aggregates -> Response
         |
         v
    (Background: Raw Data -> ETL -> Aggregates)
```

- Never compute analytics on raw data at request time
- Pre-aggregate by common dimensions (time, field, crop)
- Use materialized views or dedicated analytics tables

### Pattern C: Streaming/Near-Real-Time (Sensors, Satellite Imagery)

```mermaid
flowchart LR
    Source[Data Source] --> Queue[Message Queue]
    Queue --> Processor[Stream Processor]
    Processor --> HotStore[Hot Storage]
    Processor --> Notify[Notify Clients]
    HotStore --> API
    API --> Client[Client Polls/WebSocket]
```



- Decouple ingestion from processing from serving
- Use message queues (Kafka, RabbitMQ, or even Redis Streams)
- Clients subscribe to changes, not poll raw data

### Caching Strategy (Critical)


| Data Type                         | Cache Location     | TTL         | Invalidation    |
| --------------------------------- | ------------------ | ----------- | --------------- |
| Reference data (crops, countries) | CDN + Browser      | Hours       | On deploy       |
| User-specific data                | API cache (Redis)  | Minutes     | On write        |
| Geospatial tiles                  | CDN                | Days        | Versioned URLs  |
| Time-series aggregates            | Materialized views | On schedule | Background job  |
| Real-time sensor data             | No cache           | N/A         | Stream directly |


---

## 3. Scaling Strategy: Prototype to Production

### Phase 1: Validated Prototype (Current)

- Frontend-only or simple backend
- localStorage / JSON files
- Direct API calls to external services (Sentinel Hub, weather APIs)
- **Goal:** Prove value, not scale

### Phase 2: Production MVP

- Add a backend service (Node.js or Python)
- Move secrets server-side
- Add PostgreSQL for structured data
- Add Redis for session/cache
- **Goal:** Support 10-100 concurrent users reliably

### Phase 3: Scale-Out

- Separate read/write paths (CQRS-lite)
- Add background job processing (queues)
- Introduce data warehouse for analytics
- CDN for static assets and tile caching
- **Goal:** Support 1000+ users, TB of data

### Phase 4: Platform

- Microservices where team boundaries demand
- Kubernetes or managed containers
- Data lake for ML/advanced analytics
- Event-driven architecture
- **Goal:** Multi-tenant, multi-region

**Key insight:** Each phase should be **additive, not rewrite**. Design phase 1 code to be extractable.

---

## 4. Performance Pitfalls to Avoid

### Pitfall 1: N+1 Queries

**Symptom:** Page loads slow as data grows.
**Cause:** Fetching related data in loops.
**Fix:** Batch fetches, use DataLoader pattern, or GraphQL with proper resolvers.

### Pitfall 2: Unbounded Queries

**Symptom:** OOM errors, timeouts on large datasets.
**Cause:** `SELECT * FROM big_table` without limits.
**Fix:** Always paginate. Default limits. Cursor-based pagination for large sets.

### Pitfall 3: Synchronous Heavy Processing

**Symptom:** Requests timeout; users see spinners.
**Cause:** Computing NDVI, generating reports in request path.
**Fix:** Move to background jobs. Return job ID, poll for result, or use WebSockets.

### Pitfall 4: Storing Computed Data as Raw

**Symptom:** Re-computing same aggregations repeatedly.
**Cause:** No materialized views or summary tables.
**Fix:** Pre-compute common queries. Store aggregates alongside raw data.

### Pitfall 5: Monolithic Frontend State

**Symptom:** App freezes when handling large datasets.
**Cause:** Loading entire dataset into React state.
**Fix:** Virtualization for lists/tables. Server-side pagination. Load on demand.

### Pitfall 6: Tight Coupling to External APIs

**Symptom:** App breaks when Sentinel Hub / weather API changes or is slow.
**Cause:** Direct calls from frontend, no abstraction.
**Fix:** Backend facade. Cache responses. Circuit breakers. Fallback data.

---

## 5. Future-Proofing Decisions

These early decisions have the highest long-term impact:

### Decision 1: Data Model Design

- **Do:** Design entities with clear IDs, timestamps (created_at, updated_at), soft deletes.
- **Do:** Normalize reference data; denormalize for read performance where measured.
- **Don't:** Use auto-increment IDs as external identifiers (use UUIDs).
- **Don't:** Store computed values without tracking their source/version.

### Decision 2: API Contract

- **Do:** Version your API from day 1 (`/api/v1/...`).
- **Do:** Use consistent error formats, pagination patterns.
- **Don't:** Expose internal database structure directly in API responses.
- **Don't:** Return unbounded arrays; always paginate.

### Decision 3: Event Sourcing (Selective)

For audit-critical domains (field operations, sensor data):

- Store events, not just current state
- Enables: replay, audit trail, temporal queries ("what was NDVI on date X?")
- Don't apply everywhere; adds complexity

### Decision 4: Configuration vs Code

- **Do:** Externalize configuration (feature flags, API keys, thresholds).
- **Do:** Make business rules data-driven where possible (crop types, alert thresholds).
- **Don't:** Hardcode things that will change per environment or customer.

### Decision 5: Observability from Day 1

- Structured logging (JSON logs with correlation IDs)
- Metrics (request latency, error rates, queue depths)
- Tracing (distributed tracing for async flows)
- **Why:** You can't fix what you can't see. Debugging production issues without observability is guesswork.

---

## Recommended Technology Stack (Discussion)

Given your context, here's a reasonable starting point:


| Concern            | Recommended                                   | Alternative                       |
| ------------------ | --------------------------------------------- | --------------------------------- |
| **Frontend**       | React (current)                               | -                                 |
| **API Layer**      | Node.js (Express/Fastify) or Python (FastAPI) | Go for high-throughput            |
| **Database**       | PostgreSQL + PostGIS (for geospatial)         | TimescaleDB for heavy time-series |
| **Cache**          | Redis                                         | -                                 |
| **Queue**          | Redis Streams (simple) or RabbitMQ            | Kafka for high volume             |
| **Object Storage** | S3 / MinIO                                    | For imagery, large files          |
| **Analytics**      | ClickHouse or BigQuery                        | For TB-scale analytics            |


---

# PART 2: Implementation Specifications (Node.js Backend)

This section provides detailed implementation guidance for Phase 2: Production MVP.

---

## 6. Backend Folder Structure

```
backend/
├── package.json
├── tsconfig.json
├── .env
├── .env.example
│
├── src/
│   ├── index.ts                    # Entry point
│   ├── app.ts                      # Express/Fastify app setup
│   ├── config/
│   │   ├── index.ts                # Configuration loader
│   │   ├── database.ts             # Database config
│   │   └── redis.ts                # Redis config
│   │
│   ├── api/
│   │   ├── v1/
│   │   │   ├── index.ts            # v1 router aggregator
│   │   │   ├── countries.routes.ts
│   │   │   ├── sites.routes.ts
│   │   │   ├── farm-areas.routes.ts
│   │   │   ├── fields.routes.ts
│   │   │   ├── crops.routes.ts
│   │   │   ├── harvests.routes.ts
│   │   │   ├── fertigation.routes.ts
│   │   │   ├── ecph.routes.ts
│   │   │   ├── recipes.routes.ts
│   │   │   ├── weather.routes.ts   # Proxy to external APIs
│   │   │   └── satellite.routes.ts # Proxy to SentinelHub
│   │   │
│   │   └── middleware/
│   │       ├── auth.ts             # Authentication middleware
│   │       ├── validate.ts         # Request validation (Zod/Joi)
│   │       ├── rateLimit.ts        # Rate limiting
│   │       ├── errorHandler.ts     # Global error handler
│   │       └── requestId.ts        # Correlation ID for logging
│   │
│   ├── services/
│   │   ├── country.service.ts
│   │   ├── site.service.ts
│   │   ├── farm-area.service.ts
│   │   ├── field.service.ts
│   │   ├── crop.service.ts
│   │   ├── harvest.service.ts
│   │   ├── fertigation.service.ts
│   │   ├── ecph.service.ts
│   │   ├── recipe.service.ts
│   │   ├── weather.service.ts      # OpenWeatherMap facade
│   │   ├── satellite.service.ts    # SentinelHub facade
│   │   └── analytics.service.ts    # Aggregation queries
│   │
│   ├── repositories/               # Database access layer
│   │   ├── base.repository.ts      # Generic CRUD operations
│   │   ├── country.repository.ts
│   │   ├── site.repository.ts
│   │   ├── farm-area.repository.ts
│   │   ├── field.repository.ts
│   │   ├── crop.repository.ts
│   │   ├── harvest.repository.ts
│   │   ├── fertigation.repository.ts
│   │   ├── ecph.repository.ts
│   │   └── recipe.repository.ts
│   │
│   ├── models/                     # TypeScript interfaces & Zod schemas
│   │   ├── country.model.ts
│   │   ├── site.model.ts
│   │   ├── farm-area.model.ts
│   │   ├── field.model.ts
│   │   ├── crop.model.ts
│   │   ├── harvest.model.ts
│   │   ├── fertigation.model.ts
│   │   ├── ecph.model.ts
│   │   ├── recipe.model.ts
│   │   └── common.model.ts         # Pagination, error responses
│   │
│   ├── db/
│   │   ├── client.ts               # Database client (pg or Prisma)
│   │   ├── migrations/             # SQL migrations
│   │   │   ├── 001_initial_schema.sql
│   │   │   ├── 002_add_geospatial.sql
│   │   │   └── ...
│   │   └── seeds/                  # Seed data
│   │       ├── crops.seed.ts
│   │       └── field-types.seed.ts
│   │
│   ├── cache/
│   │   ├── client.ts               # Redis client
│   │   └── keys.ts                 # Cache key patterns
│   │
│   ├── external/                   # External API clients
│   │   ├── openweather.client.ts
│   │   ├── agro-api.client.ts
│   │   └── sentinelhub.client.ts
│   │
│   ├── jobs/                       # Background jobs (optional Phase 2.5)
│   │   ├── queue.ts                # Bull/BullMQ setup
│   │   ├── weather-sync.job.ts
│   │   └── analytics-aggregate.job.ts
│   │
│   └── utils/
│       ├── logger.ts               # Structured logging (pino/winston)
│       ├── errors.ts               # Custom error classes
│       └── pagination.ts           # Pagination helpers
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
└── docker/
    ├── Dockerfile
    ├── docker-compose.yml          # PostgreSQL + Redis + App
    └── docker-compose.dev.yml
```

---

## 7. Database Schema (PostgreSQL + PostGIS)

### Entity Relationship Diagram

```mermaid
erDiagram
    countries ||--o{ sites : has
    sites ||--o{ farm_areas : has
    farm_areas ||--o{ fields : has
    farm_areas }o--o{ crops : grows
    fields }o--|| field_types : is_type
    fields ||--o{ crop_history : has
    fields ||--o{ valves : has
    fields ||--o{ harvests : produces
    fields ||--o{ fertigation_entries : receives
    fields ||--o{ ecph_entries : measured_at
    fertigation_entries }o--|| recipes : uses
    harvests ||--o{ harvest_varieties : contains
    ecph_entries ||--o{ ecph_valve_readings : has

    countries {
        uuid id PK
        string name
        string code
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    sites {
        uuid id PK
        uuid country_id FK
        string name
        string location
        decimal total_area
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    farm_areas {
        uuid id PK
        uuid site_id FK
        string name
        decimal size
        string description
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    fields {
        uuid id PK
        uuid farm_area_id FK
        uuid field_type_id FK
        string name
        uuid current_crop_id FK
        int valve_count
        decimal area
        decimal latitude
        decimal longitude
        geometry polygon
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    crops {
        uuid id PK
        string name
        int dripper_count
        timestamp created_at
        timestamp updated_at
    }

    field_types {
        uuid id PK
        string name
        string naming_pattern
        int default_valve_count
        timestamp created_at
        timestamp updated_at
    }
```



### SQL Migration: 001_initial_schema.sql

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Countries
CREATE TABLE countries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Sites
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_id UUID NOT NULL REFERENCES countries(id),
    name VARCHAR(255) NOT NULL,
    location TEXT,
    total_area DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(country_id, name)
);

-- Farm Areas
CREATE TABLE farm_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    name VARCHAR(255) NOT NULL,
    size DECIMAL(10, 2),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(site_id, name)
);

-- Crops
CREATE TABLE crops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    dripper_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Field Types
CREATE TABLE field_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    naming_pattern VARCHAR(50),
    default_valve_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fields
CREATE TABLE fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_area_id UUID NOT NULL REFERENCES farm_areas(id),
    field_type_id UUID REFERENCES field_types(id),
    name VARCHAR(100) NOT NULL,
    current_crop_id UUID REFERENCES crops(id),
    valve_count INT DEFAULT 0,
    area DECIMAL(10, 2),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    polygon GEOMETRY(POLYGON, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(farm_area_id, name)
);

-- Crop History (tracks rotation)
CREATE TABLE crop_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    crop_id UUID NOT NULL REFERENCES crops(id),
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Valves
CREATE TABLE valves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    number INT NOT NULL,
    name VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(field_id, number)
);

-- Farm Area Crops (many-to-many)
CREATE TABLE farm_area_crops (
    farm_area_id UUID NOT NULL REFERENCES farm_areas(id),
    crop_id UUID NOT NULL REFERENCES crops(id),
    PRIMARY KEY (farm_area_id, crop_id)
);

-- Recipes
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    tank_volume DECIMAL(10, 2),
    cycles INT,
    element_ppm JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe Fertilizers
CREATE TABLE recipe_fertilizers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    dose DECIMAL(10, 4),
    kg_per_liter DECIMAL(10, 4),
    element VARCHAR(10),
    concentration DECIMAL(5, 2)
);

-- Harvests
CREATE TABLE harvests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    date DATE NOT NULL,
    total_quantity DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Harvest Varieties
CREATE TABLE harvest_varieties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
    variety VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    grade VARCHAR(10)
);

-- Fertigation Entries
CREATE TABLE fertigation_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    recipe_id UUID REFERENCES recipes(id),
    date DATE NOT NULL,
    week_number INT,
    flow_rate DECIMAL(10, 2),
    frequency INT,
    valves_count INT,
    daily_water DECIMAL(10, 2),
    fertilizers JSONB,
    total_fertilizer DECIMAL(10, 2),
    cumulative JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- EC/PH Entries
CREATE TABLE ecph_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    date DATE NOT NULL,
    time TIME,
    qty_of_water DECIMAL(10, 2),
    cycle INT,
    total_water_qty DECIMAL(10, 2),
    field_total_water_based_on_drip DECIMAL(10, 2),
    dripper_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EC/PH Valve Readings
CREATE TABLE ecph_valve_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ecph_entry_id UUID NOT NULL REFERENCES ecph_entries(id) ON DELETE CASCADE,
    valve_number INT NOT NULL,
    drip_volume DECIMAL(10, 4),
    ec DECIMAL(6, 2),
    ph DECIMAL(4, 2),
    drain DECIMAL(10, 2),
    percent_drain DECIMAL(5, 2),
    total_water_based_on_drip DECIMAL(10, 2)
);

-- Weather Cache (stores fetched weather data)
CREATE TABLE weather_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    date DATE NOT NULL,
    data JSONB NOT NULL,
    source VARCHAR(50) NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(latitude, longitude, date, source)
);

-- Indexes for common queries
CREATE INDEX idx_fields_farm_area ON fields(farm_area_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_fields_polygon ON fields USING GIST(polygon);
CREATE INDEX idx_harvests_field_date ON harvests(field_id, date);
CREATE INDEX idx_fertigation_field_date ON fertigation_entries(field_id, date);
CREATE INDEX idx_ecph_field_date ON ecph_entries(field_id, date);
CREATE INDEX idx_weather_cache_location ON weather_cache(latitude, longitude, date);
```

---

## 8. API Endpoints Specification

### Base URL: `/api/v1`

### Response Format (All Endpoints)

```typescript
// Success response
{
  "success": true,
  "data": T | T[],
  "meta"?: {
    "page": number,
    "limit": number,
    "total": number,
    "totalPages": number
  }
}

// Error response
{
  "success": false,
  "error": {
    "code": string,
    "message": string,
    "details"?: object
  }
}
```

### Countries


| Method | Endpoint               | Description           |
| ------ | ---------------------- | --------------------- |
| GET    | `/countries`           | List all countries    |
| GET    | `/countries/:id`       | Get country by ID     |
| POST   | `/countries`           | Create country        |
| PUT    | `/countries/:id`       | Update country        |
| DELETE | `/countries/:id`       | Soft delete country   |
| GET    | `/countries/:id/sites` | List sites in country |


### Sites


| Method | Endpoint                | Description                               |
| ------ | ----------------------- | ----------------------------------------- |
| GET    | `/sites`                | List all sites (filterable by country_id) |
| GET    | `/sites/:id`            | Get site by ID                            |
| POST   | `/sites`                | Create site                               |
| PUT    | `/sites/:id`            | Update site                               |
| DELETE | `/sites/:id`            | Soft delete site                          |
| GET    | `/sites/:id/farm-areas` | List farm areas in site                   |


### Farm Areas


| Method | Endpoint                 | Description                      |
| ------ | ------------------------ | -------------------------------- |
| GET    | `/farm-areas`            | List all (filterable by site_id) |
| GET    | `/farm-areas/:id`        | Get farm area by ID              |
| POST   | `/farm-areas`            | Create farm area                 |
| PUT    | `/farm-areas/:id`        | Update farm area                 |
| DELETE | `/farm-areas/:id`        | Soft delete farm area            |
| GET    | `/farm-areas/:id/fields` | List fields in farm area         |
| PUT    | `/farm-areas/:id/crops`  | Assign crops to farm area        |


### Fields


| Method | Endpoint                   | Description                           |
| ------ | -------------------------- | ------------------------------------- |
| GET    | `/fields`                  | List all (filterable)                 |
| GET    | `/fields/:id`              | Get field by ID                       |
| POST   | `/fields`                  | Create field                          |
| PUT    | `/fields/:id`              | Update field                          |
| DELETE | `/fields/:id`              | Soft delete field                     |
| PUT    | `/fields/:id/polygon`      | Update field polygon                  |
| PUT    | `/fields/:id/crop`         | Change current crop (creates history) |
| GET    | `/fields/:id/crop-history` | Get crop rotation history             |
| GET    | `/fields/:id/harvests`     | Get harvests for field                |
| GET    | `/fields/:id/fertigation`  | Get fertigation entries               |
| GET    | `/fields/:id/ecph`         | Get EC/PH entries                     |


### Crops


| Method | Endpoint     | Description    |
| ------ | ------------ | -------------- |
| GET    | `/crops`     | List all crops |
| GET    | `/crops/:id` | Get crop by ID |
| POST   | `/crops`     | Create crop    |
| PUT    | `/crops/:id` | Update crop    |
| DELETE | `/crops/:id` | Delete crop    |


### Field Types


| Method | Endpoint           | Description          |
| ------ | ------------------ | -------------------- |
| GET    | `/field-types`     | List all field types |
| POST   | `/field-types`     | Create field type    |
| PUT    | `/field-types/:id` | Update field type    |
| DELETE | `/field-types/:id` | Delete field type    |


### Harvests


| Method | Endpoint        | Description                      |
| ------ | --------------- | -------------------------------- |
| GET    | `/harvests`     | List all (paginated, filterable) |
| GET    | `/harvests/:id` | Get harvest by ID                |
| POST   | `/harvests`     | Create harvest with varieties    |
| PUT    | `/harvests/:id` | Update harvest                   |
| DELETE | `/harvests/:id` | Delete harvest                   |


Query params: `field_id`, `start_date`, `end_date`, `page`, `limit`

### Fertigation


| Method | Endpoint           | Description                      |
| ------ | ------------------ | -------------------------------- |
| GET    | `/fertigation`     | List all (paginated, filterable) |
| GET    | `/fertigation/:id` | Get entry by ID                  |
| POST   | `/fertigation`     | Create fertigation entry         |
| PUT    | `/fertigation/:id` | Update entry                     |
| DELETE | `/fertigation/:id` | Delete entry                     |


### EC/PH


| Method | Endpoint    | Description                            |
| ------ | ----------- | -------------------------------------- |
| GET    | `/ecph`     | List all (paginated, filterable)       |
| GET    | `/ecph/:id` | Get entry by ID                        |
| POST   | `/ecph`     | Create EC/PH entry with valve readings |
| PUT    | `/ecph/:id` | Update entry                           |
| DELETE | `/ecph/:id` | Delete entry                           |


### Recipes


| Method | Endpoint       | Description                    |
| ------ | -------------- | ------------------------------ |
| GET    | `/recipes`     | List all recipes               |
| GET    | `/recipes/:id` | Get recipe by ID               |
| POST   | `/recipes`     | Create recipe with fertilizers |
| PUT    | `/recipes/:id` | Update recipe                  |
| DELETE | `/recipes/:id` | Delete recipe                  |


### Weather (Proxy to External APIs)


| Method | Endpoint                  | Description                       |
| ------ | ------------------------- | --------------------------------- |
| GET    | `/weather/current`        | Current weather (lat, lon params) |
| GET    | `/weather/forecast`       | 5-day forecast (lat, lon params)  |
| GET    | `/weather/field/:fieldId` | Weather for field location        |


### Satellite (Proxy to SentinelHub)


| Method | Endpoint                   | Description                |
| ------ | -------------------------- | -------------------------- |
| GET    | `/satellite/wms-url`       | Get WMS tile URL           |
| GET    | `/satellite/layers`        | Get available layers       |
| GET    | `/satellite/ndvi/:fieldId` | Get NDVI for field polygon |
| POST   | `/satellite/process`       | Custom processing request  |


### Analytics


| Method | Endpoint                      | Description            |
| ------ | ----------------------------- | ---------------------- |
| GET    | `/analytics/harvest-summary`  | Harvest aggregates     |
| GET    | `/analytics/water-usage`      | Water usage aggregates |
| GET    | `/analytics/fertilizer-usage` | Fertilizer aggregates  |
| GET    | `/analytics/ecph-trends`      | EC/PH trends over time |


Query params: `field_id`, `site_id`, `start_date`, `end_date`, `group_by` (day, week, month)

---

## 9. Data Models (TypeScript Interfaces)

```typescript
// src/models/common.model.ts
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: PaginationMeta;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// src/models/country.model.ts
export interface Country {
  id: string;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateCountryDto {
  name: string;
  code: string;
}

export interface UpdateCountryDto {
  name?: string;
  code?: string;
}

// src/models/site.model.ts
export interface Site {
  id: string;
  countryId: string;
  name: string;
  location?: string;
  totalArea?: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  // Expanded relations (optional)
  country?: Country;
  farmAreas?: FarmArea[];
}

// src/models/farm-area.model.ts
export interface FarmArea {
  id: string;
  siteId: string;
  name: string;
  size?: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  // Expanded relations (optional)
  site?: Site;
  fields?: Field[];
  crops?: Crop[];
}

// src/models/field.model.ts
export interface Field {
  id: string;
  farmAreaId: string;
  fieldTypeId?: string;
  name: string;
  currentCropId?: string;
  valveCount: number;
  area?: number;
  latitude?: number;
  longitude?: number;
  polygon?: GeoJSONPolygon;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  // Expanded relations (optional)
  farmArea?: FarmArea;
  fieldType?: FieldType;
  currentCrop?: Crop;
  valves?: Valve[];
  cropHistory?: CropHistory[];
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface CreateFieldDto {
  farmAreaId: string;
  fieldTypeId?: string;
  name: string;
  currentCropId?: string;
  valveCount?: number;
  area?: number;
  latitude?: number;
  longitude?: number;
  polygon?: number[][];  // [[lat, lng], ...]
}

// src/models/crop.model.ts
export interface Crop {
  id: string;
  name: string;
  dripperCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

// src/models/harvest.model.ts
export interface Harvest {
  id: string;
  fieldId: string;
  date: Date;
  totalQuantity: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  field?: Field;
  varieties?: HarvestVariety[];
}

export interface HarvestVariety {
  id: string;
  harvestId: string;
  variety: string;
  quantity: number;
  grade?: string;
}

export interface CreateHarvestDto {
  fieldId: string;
  date: string;
  notes?: string;
  varieties: {
    variety: string;
    quantity: number;
    grade?: string;
  }[];
}

// src/models/fertigation.model.ts
export interface FertigationEntry {
  id: string;
  fieldId: string;
  recipeId?: string;
  date: Date;
  weekNumber?: number;
  flowRate?: number;
  frequency?: number;
  valvesCount?: number;
  dailyWater?: number;
  fertilizers?: Record<string, number>;
  totalFertilizer?: number;
  cumulative?: {
    fertilizers?: Record<string, number>;
  };
  createdAt: Date;
  updatedAt: Date;
  // Relations
  field?: Field;
  recipe?: Recipe;
}

// src/models/ecph.model.ts
export interface ECPHEntry {
  id: string;
  fieldId: string;
  date: Date;
  time?: string;
  qtyOfWater?: number;
  cycle?: number;
  totalWaterQty?: number;
  fieldTotalWaterBasedOnDrip?: number;
  dripperCount?: number;
  createdAt: Date;
  // Relations
  field?: Field;
  valveReadings?: ECPHValveReading[];
}

export interface ECPHValveReading {
  id: string;
  ecphEntryId: string;
  valveNumber: number;
  dripVolume?: number;
  ec?: number;
  ph?: number;
  drain?: number;
  percentDrain?: number;
  totalWaterBasedOnDrip?: number;
}

// src/models/recipe.model.ts
export interface Recipe {
  id: string;
  name: string;
  description?: string;
  tankVolume?: number;
  cycles?: number;
  elementPpm?: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  fertilizers?: RecipeFertilizer[];
}

export interface RecipeFertilizer {
  id: string;
  recipeId: string;
  name: string;
  dose?: number;
  kgPerLiter?: number;
  element?: string;
  concentration?: number;
}
```

---

## 10. External API Integration (Backend Facades)

### Weather Service Facade

```typescript
// src/external/openweather.client.ts
import { Redis } from 'ioredis';

interface WeatherData {
  temperature: { min: number; max: number; avg: number; feelsLike: number };
  humidity: number;
  rainfall: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  clouds: number;
  description: string;
  icon: string;
  date: string;
}

export class OpenWeatherClient {
  private apiKey: string;
  private baseUrl = 'https://api.openweathermap.org/data/2.5';
  private cache: Redis;
  private cacheTTL = 600; // 10 minutes

  constructor(apiKey: string, redis: Redis) {
    this.apiKey = apiKey;
    this.cache = redis;
  }

  async getCurrentWeather(lat: number, lon: number): Promise<WeatherData> {
    const cacheKey = `weather:current:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    
    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Fetch from API
    const url = `${this.baseUrl}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${this.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }
    
    const data = await response.json();
    const result = this.transformCurrentWeather(data);
    
    // Cache result
    await this.cache.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
    
    return result;
  }

  async getForecast(lat: number, lon: number): Promise<WeatherData[]> {
    const cacheKey = `weather:forecast:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const url = `${this.baseUrl}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${this.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }
    
    const data = await response.json();
    const result = this.transformForecast(data);
    
    await this.cache.setex(cacheKey, this.cacheTTL * 6, JSON.stringify(result)); // 1 hour
    
    return result;
  }

  private transformCurrentWeather(data: any): WeatherData {
    return {
      temperature: {
        min: data.main.temp_min,
        max: data.main.temp_max,
        avg: data.main.temp,
        feelsLike: data.main.feels_like,
      },
      humidity: data.main.humidity,
      rainfall: data.rain?.['1h'] || data.rain?.['3h'] || 0,
      pressure: data.main.pressure,
      windSpeed: data.wind.speed,
      windDirection: data.wind.deg,
      clouds: data.clouds.all,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      date: new Date().toISOString().split('T')[0],
    };
  }

  private transformForecast(data: any): WeatherData[] {
    // Group by day and aggregate
    const dailyMap = new Map<string, any[]>();
    
    for (const item of data.list) {
      const date = item.dt_txt.split(' ')[0];
      if (!dailyMap.has(date)) dailyMap.set(date, []);
      dailyMap.get(date)!.push(item);
    }
    
    return Array.from(dailyMap.entries()).map(([date, items]) => ({
      date,
      temperature: {
        min: Math.min(...items.map(i => i.main.temp_min)),
        max: Math.max(...items.map(i => i.main.temp_max)),
        avg: items.reduce((s, i) => s + i.main.temp, 0) / items.length,
        feelsLike: items.reduce((s, i) => s + i.main.feels_like, 0) / items.length,
      },
      humidity: items.reduce((s, i) => s + i.main.humidity, 0) / items.length,
      rainfall: items.reduce((s, i) => s + (i.rain?.['3h'] || 0), 0),
      pressure: items.reduce((s, i) => s + i.main.pressure, 0) / items.length,
      windSpeed: items.reduce((s, i) => s + i.wind.speed, 0) / items.length,
      windDirection: items[0].wind.deg,
      clouds: items.reduce((s, i) => s + i.clouds.all, 0) / items.length,
      description: items[Math.floor(items.length / 2)].weather[0].description,
      icon: items[Math.floor(items.length / 2)].weather[0].icon,
    }));
  }
}
```

### SentinelHub Facade

```typescript
// src/external/sentinelhub.client.ts
import { Redis } from 'ioredis';

export class SentinelHubClient {
  private instanceId: string;
  private wmsUrl: string;
  private clientId?: string;
  private clientSecret?: string;
  private cache: Redis;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(config: SentinelHubConfig, redis: Redis) {
    this.instanceId = config.instanceId;
    this.wmsUrl = config.wmsUrl || `https://services.sentinel-hub.com/ogc/wms/${config.instanceId}`;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.cache = redis;
  }

  getWMSUrl(params: WMSParams): string {
    const queryParams = new URLSearchParams({
      SERVICE: 'WMS',
      REQUEST: 'GetMap',
      LAYERS: params.layer,
      FORMAT: 'image/png',
      TRANSPARENT: 'true',
      VERSION: '1.3.0',
      MAXCC: String(params.maxCloudCoverage || 30),
      WIDTH: String(params.width || 512),
      HEIGHT: String(params.height || 512),
      CRS: 'EPSG:4326',
      BBOX: params.bbox, // minLon,minLat,maxLon,maxLat
      TIME: params.time, // YYYY-MM-DD/YYYY-MM-DD
    });
    
    return `${this.wmsUrl}?${queryParams.toString()}`;
  }

  async getAvailableLayers(): Promise<LayerInfo[]> {
    const cacheKey = `sentinelhub:layers:${this.instanceId}`;
    
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const url = `${this.wmsUrl}?SERVICE=WMS&REQUEST=GetCapabilities`;
    const response = await fetch(url);
    const text = await response.text();
    
    // Parse XML to extract layers (simplified)
    const layers = this.parseCapabilities(text);
    
    await this.cache.setex(cacheKey, 86400, JSON.stringify(layers)); // 24 hours
    
    return layers;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('OAuth credentials not configured');
    }

    const response = await fetch('https://services.sentinel-hub.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get SentinelHub access token');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000 - 60000);
    
    return this.accessToken;
  }

  async processNDVI(polygon: number[][], timeRange: string): Promise<NDVIResult> {
    const token = await this.getAccessToken();
    
    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: [{ bands: ["B04", "B08"] }],
          output: { bands: 1 }
        };
      }
      function evaluatePixel(sample) {
        let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
        return [ndvi];
      }
    `;

    const request = {
      input: {
        bounds: {
          geometry: {
            type: 'Polygon',
            coordinates: [polygon.map(([lat, lng]) => [lng, lat])],
          },
        },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: {
              from: timeRange.split('/')[0] + 'T00:00:00Z',
              to: timeRange.split('/')[1] + 'T23:59:59Z',
            },
            maxCloudCoverage: 30,
          },
        }],
      },
      output: {
        width: 512,
        height: 512,
        responses: [{ identifier: 'default', format: { type: 'image/png' } }],
      },
      evalscript,
    };

    const response = await fetch('https://services.sentinel-hub.com/api/v1/process', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`SentinelHub process error: ${response.status}`);
    }

    return {
      image: await response.arrayBuffer(),
      contentType: response.headers.get('content-type') || 'image/png',
    };
  }

  private parseCapabilities(xml: string): LayerInfo[] {
    // Simplified XML parsing - use xml2js or fast-xml-parser in real implementation
    const layerRegex = /<Layer.*?<Name>(.+?)<\/Name>.*?<Title>(.+?)<\/Title>/gs;
    const layers: LayerInfo[] = [];
    let match;
    
    while ((match = layerRegex.exec(xml)) !== null) {
      layers.push({ id: match[1], name: match[2] });
    }
    
    return layers;
  }
}

interface SentinelHubConfig {
  instanceId: string;
  wmsUrl?: string;
  clientId?: string;
  clientSecret?: string;
}

interface WMSParams {
  layer: string;
  bbox: string;
  time: string;
  width?: number;
  height?: number;
  maxCloudCoverage?: number;
}

interface LayerInfo {
  id: string;
  name: string;
}

interface NDVIResult {
  image: ArrayBuffer;
  contentType: string;
}
```

---

## 11. Environment Variables

```bash
# .env.example for backend

# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/almahafarm
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379

# Authentication (if implementing auth)
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# External APIs
OPENWEATHER_API_KEY=your-openweather-api-key
SENTINELHUB_INSTANCE_ID=your-instance-id
SENTINELHUB_WMS_URL=https://services.sentinel-hub.com/ogc/wms/your-instance-id
SENTINELHUB_CLIENT_ID=your-client-id
SENTINELHUB_CLIENT_SECRET=your-client-secret

# Logging
LOG_LEVEL=info

# CORS
CORS_ORIGIN=http://localhost:3000
```

---

## 12. Docker Compose (Development)

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  postgres:
    image: postgis/postgis:15-3.3
    environment:
      POSTGRES_USER: almaha
      POSTGRES_PASSWORD: almaha_dev
      POSTGRES_DB: almahafarm
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://almaha:almaha_dev@postgres:5432/almahafarm
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./backend/src:/app/src
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

---

## 13. Migration Plan (localStorage to PostgreSQL)

### Step 1: Create Migration Script

```typescript
// scripts/migrate-from-localstorage.ts
// Run this once to import existing data from the React app

import { Pool } from 'pg';

interface MigrationData {
  masterData: any;
  harvestData: any[];
  fertigationData: any[];
  ecphEntries: any[];
  recipeDatabase: any[];
}

export async function migrateFromLocalStorage(data: MigrationData, pool: Pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Migrate crops
    const cropIdMap = new Map<string, string>();
    for (const crop of data.masterData.crops || []) {
      const result = await client.query(
        `INSERT INTO crops (name, dripper_count) 
         VALUES ($1, $2) 
         ON CONFLICT (name) DO UPDATE SET dripper_count = $2
         RETURNING id`,
        [crop.name, crop.dripper_count]
      );
      cropIdMap.set(crop.name, result.rows[0].id);
    }
    
    // 2. Migrate field types
    const fieldTypeIdMap = new Map<string, string>();
    for (const ft of data.masterData.fieldTypes || []) {
      const result = await client.query(
        `INSERT INTO field_types (name, naming_pattern, default_valve_count)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET naming_pattern = $2
         RETURNING id`,
        [ft.name, ft.namingPattern, ft.defaultValveCount]
      );
      fieldTypeIdMap.set(ft.name, result.rows[0].id);
    }
    
    // 3. Migrate countries -> sites -> farm_areas -> fields
    const fieldIdMap = new Map<string, string>();
    
    for (const country of data.masterData.countries || []) {
      const countryResult = await client.query(
        `INSERT INTO countries (name, code) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = $1
         RETURNING id`,
        [country.name, country.code]
      );
      const countryId = countryResult.rows[0].id;
      
      for (const site of country.sites || []) {
        const siteResult = await client.query(
          `INSERT INTO sites (country_id, name, location, total_area)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (country_id, name) DO UPDATE SET location = $3
           RETURNING id`,
          [countryId, site.name, site.location, site.totalArea]
        );
        const siteId = siteResult.rows[0].id;
        
        for (const farmArea of site.farmAreas || []) {
          const faResult = await client.query(
            `INSERT INTO farm_areas (site_id, name, size, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (site_id, name) DO UPDATE SET size = $3
             RETURNING id`,
            [siteId, farmArea.name, farmArea.size, farmArea.description]
          );
          const farmAreaId = faResult.rows[0].id;
          
          for (const field of farmArea.fields || []) {
            const fieldTypeId = field.type ? fieldTypeIdMap.get(field.type) : null;
            const currentCropId = field.currentCrop ? cropIdMap.get(
              typeof field.currentCrop === 'object' ? field.currentCrop.name : field.currentCrop
            ) : null;
            
            // Convert polygon from [[lat,lng],...] to PostGIS format
            let polygonWKT = null;
            if (field.polygon && field.polygon.length >= 3) {
              const coords = field.polygon.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
              const firstCoord = `${field.polygon[0][1]} ${field.polygon[0][0]}`;
              polygonWKT = `POLYGON((${coords}, ${firstCoord}))`;
            }
            
            const fieldResult = await client.query(
              `INSERT INTO fields (farm_area_id, field_type_id, name, current_crop_id, 
                                   valve_count, area, latitude, longitude, polygon)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_GeomFromText($9, 4326))
               ON CONFLICT (farm_area_id, name) DO UPDATE SET current_crop_id = $4
               RETURNING id`,
              [farmAreaId, fieldTypeId, field.name, currentCropId, 
               field.valves || 0, field.area, field.latitude, field.longitude, polygonWKT]
            );
            
            // Map old field identifier to new UUID
            const oldKey = `${country.id}-${site.id}-${farmArea.id}-${field.name}`;
            fieldIdMap.set(field.name, fieldResult.rows[0].id);
            fieldIdMap.set(oldKey, fieldResult.rows[0].id);
          }
        }
      }
    }
    
    // 4. Migrate harvests
    for (const harvest of data.harvestData || []) {
      const fieldId = fieldIdMap.get(harvest.fieldId);
      if (!fieldId) continue;
      
      const harvestResult = await client.query(
        `INSERT INTO harvests (field_id, date, total_quantity, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [fieldId, harvest.date, harvest.totalQuantity, harvest.notes]
      );
      
      for (const v of harvest.varieties || []) {
        await client.query(
          `INSERT INTO harvest_varieties (harvest_id, variety, quantity, grade)
           VALUES ($1, $2, $3, $4)`,
          [harvestResult.rows[0].id, v.variety, v.quantity, v.grade]
        );
      }
    }
    
    // 5. Migrate fertigation entries
    // 6. Migrate EC/PH entries
    // ... similar pattern
    
    await client.query('COMMIT');
    console.log('Migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

## 14. Implementation Checklist for Codex

### Phase 2.1: Backend Setup (Do First)

- Initialize Node.js project with TypeScript
- Set up Express/Fastify with middleware (CORS, JSON, error handling)
- Configure environment variables and config loader
- Set up structured logging (pino)
- Create Docker Compose for PostgreSQL + Redis

### Phase 2.2: Database

- Run PostgreSQL with PostGIS extension
- Create and run migrations
- Seed initial data (crops, field types)
- Test database connection and basic queries

### Phase 2.3: Core API Routes

- Implement base repository with CRUD operations
- Implement countries, sites, farm-areas, fields routes
- Implement crops and field-types routes
- Add request validation (Zod)
- Add pagination to list endpoints

### Phase 2.4: Domain-Specific Routes

- Implement harvests routes with varieties
- Implement fertigation routes
- Implement EC/PH routes with valve readings
- Implement recipes routes

### Phase 2.5: External API Integration

- Create OpenWeather client with caching
- Create SentinelHub client with token management
- Implement /weather/* proxy routes
- Implement /satellite/* proxy routes

### Phase 2.6: Analytics

- Implement harvest summary aggregation
- Implement water usage aggregation
- Implement fertilizer usage aggregation

### Phase 2.7: Migration & Integration

- Create localStorage migration script
- Update React frontend to use API instead of localStorage
- Test end-to-end data flow

---

## 15. Frontend Integration Changes

When the backend is ready, update the React app:

```typescript
// src/utils/api.ts - New API client

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1';

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'API request failed');
  }

  return data.data;
}

// Example usage - replace loadMasterData()
export async function loadMasterData() {
  const [countries, crops, fieldTypes] = await Promise.all([
    apiRequest<Country[]>('/countries?include=sites.farmAreas.fields'),
    apiRequest<Crop[]>('/crops'),
    apiRequest<FieldType[]>('/field-types'),
  ]);
  
  return { countries, crops, fieldTypes };
}
```

