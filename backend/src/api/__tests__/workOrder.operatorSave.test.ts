/**
 * Operator save on work orders: only the operator may call it, and it saves without
 * completing (the service's operatorSave, not operatorSubmit). Real router and
 * authorize on an ephemeral port; the service is mocked.
 */
jest.mock('../../services/workOrder.service', () => ({
  operatorSave: jest.fn(async (id: string) => ({ id, status: 'issued' })),
  operatorSubmit: jest.fn(async (id: string) => ({ id, status: 'completed' })),
  getWorkOrderById: jest.fn(async (id: string) => ({ id, site_id: 'site-1', assigned_to: 'u-1' })),
  listSiteFields: jest.fn(async () => [{ id: 'field-1', name: 'GH-01' }]),
}));
jest.mock('../middleware/tenant', () => ({
  requireOrgId: (req: any) => req.user?.organizationId || 'org-1',
}));
jest.mock('../../websocket', () => ({ emitDataChange: jest.fn() }));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import * as workOrderService from '../../services/workOrder.service';
import { workOrderRouter } from '../v1/workOrder.routes';

const WO = '7b1f0f5e-3c1a-4d3e-9a51-1c2b3d4e5f60';
let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const raw = req.headers['x-test-user'];
    if (raw) req.user = JSON.parse(String(raw));
    next();
  });
  app.use('/work-orders', workOrderRouter);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  });
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => jest.clearAllMocks());

const put = (path: string, role: string) => fetch(`${base}/work-orders/${WO}/${path}`, {
  method: 'PUT',
  headers: {
    'content-type': 'application/json',
    'x-test-user': JSON.stringify({ userId: 'u-1', role, organizationId: 'org-1' }),
  },
  body: JSON.stringify({ items: [{ id: 'item-1', productId: 'prod-2' }], justification: 'Preventive' }),
});

describe('PUT /work-orders/:id/operator-save', () => {
  it('lets the operator save without completing', async () => {
    const res = await put('operator-save', 'operator');
    expect(res.status).toBe(200);
    expect(workOrderService.operatorSave).toHaveBeenCalledWith(
      WO, { items: [{ id: 'item-1', productId: 'prod-2' }], justification: 'Preventive' }, 'u-1', 'org-1',
    );
    expect(workOrderService.operatorSubmit).not.toHaveBeenCalled();
  });

  for (const role of ['pest_agronomist', 'operation_manager', 'agronomist', 'ceo', 'worker']) {
    it(`refuses ${role}`, async () => {
      const res = await put('operator-save', role);
      expect(res.status).toBe(403);
      expect(workOrderService.operatorSave).not.toHaveBeenCalled();
    });
  }

  it('complete still goes through operator-submit', async () => {
    const res = await put('operator-submit', 'operator');
    expect(res.status).toBe(200);
    expect(workOrderService.operatorSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('GET /work-orders/:id/fields', () => {
  const get = (userId: string, role: string) => fetch(`${base}/work-orders/${WO}/fields`, {
    headers: { 'x-test-user': JSON.stringify({ userId, role, organizationId: 'org-1' }) },
  });

  it('gives the assigned operator the fields of the order\'s site', async () => {
    const res = await get('u-1', 'operator');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([{ id: 'field-1', name: 'GH-01' }]);
    expect(workOrderService.listSiteFields).toHaveBeenCalledWith('site-1');
  });

  it('hides another operator\'s order', async () => {
    const res = await get('u-2', 'operator');
    expect(res.status).toBe(404);
    expect(workOrderService.listSiteFields).not.toHaveBeenCalled();
  });

  it('refuses roles that cannot view work orders', async () => {
    expect((await get('u-1', 'worker')).status).toBe(403);
  });
});
