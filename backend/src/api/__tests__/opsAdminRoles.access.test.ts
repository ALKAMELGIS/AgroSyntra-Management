/**
 * Operations / admin write roles. Every write route is driven through the real router,
 * the real auth / authorize / tenant middleware (signed JWTs) and the error handler on an
 * ephemeral port. Services are auto-mocked and the database answers generically, so a
 * request either passes the role guard (anything but 401/403) or is refused with 403.
 *
 *  - recipes create/edit/delete ............ worker, agronomist, operation manager
 *  - inventory, costs, GPS writes .......... operation manager, worker
 *  - agronomic thresholds .................. CEO, operation manager
 *  - GIS writes ............................ CEO, operation manager
 *  - feature flags, AI / OpenWeather keys .. CEO
 *  - API keys, webhooks, API integrations .. CEO, operation manager
 *  - training authoring .................... intern teacher
 *  - organization logo upload .............. CEO, farm manager
 */
import jwt from 'jsonwebtoken';

jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../../cache/client', () => ({
  redisClient: { get: jest.fn(), setex: jest.fn() },
}));
jest.mock('../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../utils/sentry', () => ({ captureException: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../services/recipe.service');
jest.mock('../../services/inventory.service');
jest.mock('../../services/cost.service');
jest.mock('../../services/agronomicReference.service');
jest.mock('../../services/gisLayer.service');
jest.mock('../../services/arcgis.service', () => ({
  parseFeatureServiceUrl: () => ({ baseUrl: 'https://example.com/FeatureServer', layerIndex: null }),
}));
jest.mock('../../services/auditLog.service');
jest.mock('../../services/featureFlag.service');
jest.mock('../../services/systemSettings.service');
jest.mock('../../services/webhook.service');
jest.mock('../../services/apiIntegration.service');
jest.mock('../../services/training.service');
jest.mock('../../services/aiTutor.service');
jest.mock('../../services/organization.service', () => ({
  getOrganizationById: jest.fn(async () => ({ id: 'org', settings: {} })),
  getUserOrganizationId: jest.fn(async () => null),
  listOrganizationMembers: jest.fn(async () => []),
  updateOrganization: jest.fn(async () => ({ settings: {} })),
}));
jest.mock('../../services/storage.service');
jest.mock('../../services/permission.service', () => ({
  // Grants must never re-open recipe writes, so pretend every grant exists.
  hasPermission: jest.fn(async () => true),
}));
jest.mock('pdf-parse', () => jest.fn());

process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-at-least-32-chars';

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { dbPool } from '../../db/client';
import { config } from '../../config';
import { auth } from '../middleware/auth';
import { errorHandler } from '../middleware/errorHandler';
import { recipesRouter } from '../v1/recipes.routes';
import { inventoryRouter } from '../v1/inventory.routes';
import { costsRouter } from '../v1/costs.routes';
import { gpsRouter } from '../v1/gps.routes';
import { agronomicRouter } from '../v1/agronomic.routes';
import { gisRouter } from '../v1/gis.routes';
import { featureFlagsRouter } from '../v1/feature-flags.routes';
import { settingsRouter } from '../v1/settings.routes';
import { apiKeysRouter } from '../v1/apikeys.routes';
import { webhooksRouter } from '../v1/webhooks.routes';
import { apiIntegrationsRouter } from '../v1/api-integrations.routes';
import { trainingRouter } from '../v1/training.routes';
import { organizationRouter } from '../v1/organization.routes';
import { hasPermission } from '../../services/permission.service';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID = '11111111-1111-4111-8111-111111111111';
const FIELD = '22222222-2222-4222-8222-222222222222';
const CROP = '33333333-3333-4333-8333-333333333333';

const ALL_ROLES = [
  'ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist',
  'scouter', 'worker', 'operator', 'intern_student', 'intern_teacher', 'auditor',
];

const tokenFor = (role: string) =>
  jwt.sign(
    { userId: `${role}-1`, email: `${role}@example.com`, role, organizationId: ORG },
    config.auth.jwtSecret,
    { algorithm: 'HS256', expiresIn: '5m' },
  );

// Generic database: every lookup finds one row in the caller's org, every write succeeds.
const query = jest.fn(async () => ({ rows: [{ id: ID, organization_id: ORG }], rowCount: 1 }));

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/recipes', auth, recipesRouter);
  app.use('/inventory', inventoryRouter);
  app.use('/costs', costsRouter);
  app.use('/gps', gpsRouter);
  app.use('/agronomic', agronomicRouter);
  app.use('/gis', gisRouter);
  app.use('/feature-flags', featureFlagsRouter);
  app.use('/settings', settingsRouter);
  app.use('/api-keys', apiKeysRouter);
  app.use('/webhooks', webhooksRouter);
  app.use('/api-integrations', apiIntegrationsRouter);
  app.use('/training', trainingRouter);
  app.use('/organization', organizationRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  query.mockClear();
  (dbPool.query as jest.Mock).mockImplementation(query);
});

async function call(method: string, path: string, role: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(role)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

type Route = { method: string; path: string; body?: unknown };
type Rule = { label: string; allowed: string[]; routes: Route[] };

const recipeBody = { name: 'R1' };
const thresholdBody = { cropId: CROP, parameter: 'temperature', warningMin: 1 };

const RULES: Rule[] = [
  {
    label: 'recipe create/edit/delete',
    allowed: ['worker', 'agronomist', 'operation_manager'],
    routes: [
      { method: 'POST', path: '/recipes', body: recipeBody },
      { method: 'PUT', path: `/recipes/${ID}`, body: recipeBody },
      { method: 'DELETE', path: `/recipes/${ID}` },
    ],
  },
  {
    label: 'recipe approval',
    allowed: ['operation_manager'],
    routes: [{ method: 'POST', path: `/recipes/${ID}/approve` }],
  },
  {
    label: 'inventory items and stock movements',
    allowed: ['operation_manager', 'worker'],
    routes: [
      { method: 'POST', path: '/inventory', body: { name: 'Urea', category: 'fertilizer', unit: 'kg' } },
      { method: 'PUT', path: `/inventory/${ID}`, body: { name: 'Urea 2' } },
      { method: 'DELETE', path: `/inventory/${ID}` },
      { method: 'POST', path: `/inventory/${ID}/transactions`, body: { type: 'purchase', quantity: 5 } },
    ],
  },
  {
    label: 'cost entries',
    allowed: ['operation_manager', 'worker'],
    routes: [
      { method: 'POST', path: '/costs', body: { field_id: FIELD, category: 'labour', amount: 10, date: '2026-09-01' } },
      { method: 'PUT', path: `/costs/${ID}`, body: { amount: 12 } },
      { method: 'DELETE', path: `/costs/${ID}` },
    ],
  },
  {
    label: 'GPS equipment and positions',
    allowed: ['operation_manager', 'worker'],
    routes: [
      { method: 'POST', path: '/gps/equipment', body: { name: 'Tractor 1', type: 'tractor' } },
      { method: 'POST', path: '/gps/position', body: { equipment_id: ID, latitude: 24.4, longitude: 54.3 } },
      { method: 'DELETE', path: `/gps/equipment/${ID}` },
    ],
  },
  {
    label: 'agronomic thresholds',
    allowed: ['ceo', 'operation_manager'],
    routes: [
      { method: 'POST', path: '/agronomic/thresholds', body: thresholdBody },
      { method: 'DELETE', path: `/agronomic/thresholds/${ID}` },
    ],
  },
  {
    label: 'GIS writes',
    allowed: ['ceo', 'operation_manager'],
    routes: [
      { method: 'POST', path: '/gis/layers', body: { name: 'L', sourceType: 'file_upload' } },
      { method: 'PUT', path: `/gis/layers/${ID}`, body: { name: 'L2' } },
      { method: 'DELETE', path: `/gis/layers/${ID}` },
      { method: 'POST', path: '/gis/upload' },
      { method: 'POST', path: `/gis/layers/${ID}/sync` },
      { method: 'POST', path: `/gis/layers/${ID}/link`, body: { featureId: ID, fieldId: FIELD } },
      { method: 'POST', path: `/gis/layers/${ID}/auto-link` },
      { method: 'POST', path: '/gis/discover', body: { url: 'https://example.com/FeatureServer' } },
      { method: 'POST', path: '/gis/test-connection', body: { url: 'https://example.com/FeatureServer' } },
    ],
  },
  {
    label: 'feature flags',
    allowed: ['ceo'],
    routes: [
      { method: 'POST', path: '/feature-flags', body: { key: 'new_flag' } },
      { method: 'PUT', path: `/feature-flags/${ID}`, body: { enabled: true } },
      { method: 'DELETE', path: `/feature-flags/${ID}` },
    ],
  },
  {
    label: 'AI and OpenWeather keys',
    allowed: ['ceo'],
    routes: [
      { method: 'PUT', path: '/settings/ai', body: { provider: 'anthropic', model: 'm' } },
      { method: 'DELETE', path: '/settings/ai/key' },
      { method: 'POST', path: '/settings/ai/test', body: { provider: 'anthropic', model: 'm', apiKey: 'k' } },
      { method: 'PUT', path: '/settings/openweather', body: {} },
      { method: 'DELETE', path: '/settings/openweather/key' },
      { method: 'POST', path: '/settings/openweather/test', body: { apiKey: 'k' } },
    ],
  },
  {
    label: 'API keys, webhooks and API integrations',
    allowed: ['ceo', 'operation_manager'],
    routes: [
      { method: 'GET', path: '/api-keys' },
      { method: 'POST', path: '/api-keys', body: { name: 'device' } },
      { method: 'DELETE', path: `/api-keys/${ID}` },
      { method: 'GET', path: '/webhooks' },
      { method: 'POST', path: '/webhooks', body: { url: 'https://example.com/h', events: ['harvest.created'] } },
      { method: 'DELETE', path: `/webhooks/${ID}` },
      { method: 'GET', path: '/api-integrations' },
      { method: 'POST', path: '/api-integrations', body: { name: 'x' } },
      { method: 'PUT', path: `/api-integrations/${ID}`, body: { name: 'y' } },
      { method: 'DELETE', path: `/api-integrations/${ID}` },
      { method: 'POST', path: `/api-integrations/${ID}/sync` },
    ],
  },
  {
    label: 'training authoring',
    allowed: ['intern_teacher'],
    routes: [
      { method: 'POST', path: '/training/lessons', body: {} },
      { method: 'PUT', path: `/training/lessons/${ID}`, body: {} },
      { method: 'DELETE', path: `/training/lessons/${ID}` },
      { method: 'POST', path: '/training/lessons/bulk', body: {} },
      { method: 'POST', path: `/training/lessons/${ID}/generate-bank` },
      { method: 'PUT', path: `/training/questions/bank/${ID}`, body: {} },
      { method: 'DELETE', path: `/training/questions/bank/${ID}` },
      { method: 'POST', path: '/training/quizzes', body: {} },
      { method: 'PUT', path: `/training/quizzes/${ID}`, body: {} },
      { method: 'DELETE', path: `/training/quizzes/${ID}` },
      { method: 'POST', path: '/training/questions', body: {} },
      { method: 'DELETE', path: `/training/questions/${ID}` },
      { method: 'POST', path: '/training/ai/generate-questions', body: {} },
      { method: 'POST', path: '/training/ai/upload-pdf' },
    ],
  },
  {
    label: 'organization logo upload',
    allowed: ['ceo', 'farm_manager'],
    routes: [{ method: 'POST', path: '/organization/logo' }],
  },
];

describe.each(RULES)('$label', ({ allowed, routes }) => {
  it.each(ALL_ROLES)('%s', async (role) => {
    const expectAllowed = allowed.includes(role);
    for (const r of routes) {
      const status = await call(r.method, r.path, role, r.body);
      const got = status === 403 || status === 401 ? 'refused' : 'passed guard';
      expect({ req: `${r.method} ${r.path}`, got }).toEqual({
        req: `${r.method} ${r.path}`,
        got: expectAllowed ? 'passed guard' : 'refused',
      });
    }
    if (!expectAllowed) {
      const writes = query.mock.calls.filter((c: unknown[]) => /^\s*(UPDATE|INSERT|DELETE)/.test(String(c[0])));
      expect(writes).toHaveLength(0);
    }
  });
});

describe('recipe writes cannot be re-opened by permission grants', () => {
  it.each(['ceo', 'farm_manager', 'pest_agronomist', 'auditor'])(
    '%s stays 403 even with a recipes:write grant',
    async (role) => {
      (hasPermission as jest.Mock).mockClear();
      expect(await call('POST', '/recipes', role, recipeBody)).toBe(403);
      expect(await call('PUT', `/recipes/${ID}`, role, recipeBody)).toBe(403);
      expect(await call('DELETE', `/recipes/${ID}`, role)).toBe(403);
      expect(hasPermission).not.toHaveBeenCalled();
    },
  );
});

describe('reads stay open', () => {
  it('farm manager can still read AI / OpenWeather settings and GIS layers', async () => {
    expect(await call('GET', '/settings/ai', 'farm_manager')).not.toBe(403);
    expect(await call('GET', '/settings/openweather', 'farm_manager')).not.toBe(403);
    expect(await call('GET', '/gis/layers', 'farm_manager')).not.toBe(403);
  });

  it('managers keep the read-only teacher views (students, question bank)', async () => {
    for (const role of ['ceo', 'farm_manager', 'operation_manager', 'intern_teacher']) {
      expect(await call('GET', '/training/students', role)).not.toBe(403);
      expect(await call('GET', `/training/lessons/${ID}/question-bank`, role)).not.toBe(403);
    }
    expect(await call('GET', '/training/students', 'intern_student')).toBe(403);
  });

  it('weather autofill stays with CEO, farm manager and operation manager', async () => {
    for (const role of ['ceo', 'farm_manager', 'operation_manager']) {
      expect(await call('GET', `/api-integrations/weather-autofill?siteId=${ID}`, role)).not.toBe(403);
    }
    expect(await call('GET', `/api-integrations/weather-autofill?siteId=${ID}`, 'worker')).toBe(403);
  });

  it('everyone signed in can list inventory, costs and GPS equipment', async () => {
    for (const role of ['ceo', 'farm_manager', 'agronomist', 'worker']) {
      expect(await call('GET', '/gps/equipment', role)).toBe(200);
      expect(await call('GET', '/costs/summary', role)).not.toBe(403);
      expect(await call('GET', `/inventory/${ID}`, role)).not.toBe(403);
    }
  });
});
