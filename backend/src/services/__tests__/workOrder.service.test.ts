jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../ipm.service', () => ({
  getPhiForSiteProductCrop: jest.fn(async () => 3),
  schedulePHINotifications: jest.fn(async () => undefined),
}));
jest.mock('../phiAuditLog.service', () => ({
  checkAndNotifyFieldHarvestConflicts: jest.fn(async () => undefined),
}));
jest.mock('../push-notification.service', () => ({
  pushNotificationService: { sendToUser: jest.fn(async () => undefined) },
}));
jest.mock('../../websocket', () => ({ emitAlert: jest.fn() }));

import { dbPool } from '../../db/client';
import { schedulePHINotifications } from '../ipm.service';
import { checkAndNotifyFieldHarvestConflicts } from '../phiAuditLog.service';
import { getPhiForSiteProductCrop } from '../ipm.service';
import {
  approveWorkOrder,
  listSiteFields,
  operatorSave,
  operatorSubmit,
  rejectWorkOrder,
  toTimeOfDay,
} from '../workOrder.service';

const ORG = 'org-1';
const WO_ID = 'wo-1';
const OPERATOR = 'user-operator';
const AGRONOMIST = 'user-agronomist';

interface Call { sql: string; params: unknown[] }

/** Fake pool + client that answer by SQL shape and record every statement. */
function makeDb(wo: Record<string, unknown>) {
  const calls: Call[] = [];
  const state = { ...wo };
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const text = sql.replace(/\s+/g, ' ').trim();

    if (text.startsWith('SELECT wo.*')) {
      return { rows: params[1] === ORG ? [{ ...state }] : [] };
    }
    if (text.includes('FROM spray_work_order_items i')) {
      return { rows: (state.items as unknown[]) ?? [] };
    }
    if (text.startsWith('SELECT status FROM spray_work_orders')) {
      return { rows: [{ status: state.status }] };
    }
    if (text.startsWith('INSERT INTO pesticide_applications')) {
      return { rows: [{ id: `pa-${calls.length}`, field_id: 'field-1', phi_end_date: '2026-10-01' }] };
    }
    if (text.startsWith('INSERT INTO alert_events')) return { rows: [{ id: 'alert-1' }] };
    if (text.startsWith("SELECT id FROM users WHERE role = 'pest_agronomist'")) {
      return { rows: ((state.pestAgronomists as string[]) ?? []).map((id) => ({ id })) };
    }
    if (text.includes('AS crop_name FROM fields f')) {
      const crop = ((state.fieldCrops as Record<string, string>) ?? {})[params[0] as string];
      return { rows: crop ? [{ name: 'GH', crop_name: crop }] : [] };
    }
    if (text.startsWith('SELECT f.id, f.name FROM fields f')) {
      const fields = (state.siteFields as string[]) ?? [];
      return { rows: params[1] ? (fields.includes(params[1] as string) ? [{ id: params[1] }] : []) : fields.map((id) => ({ id })) };
    }
    if (text.startsWith('SELECT 1 FROM site_pesticide_products')) {
      return { rows: ((state.siteProducts as string[]) ?? []).includes(params[1] as string) ? [{ '?column?': 1 }] : [] };
    }
    return { rows: [] };
  });
  (dbPool.query as jest.Mock).mockImplementation(query);
  (dbPool.connect as jest.Mock).mockResolvedValue({ query, release: jest.fn() });
  return calls;
}

const find = (calls: Call[], prefix: string) =>
  calls.filter((c) => c.sql.replace(/\s+/g, ' ').trim().startsWith(prefix));

const baseWo = {
  id: WO_ID,
  work_order_number: 7,
  application_type: 'spray',
  site_id: 'site-1',
  date_issued: '2026-09-28',
  justification: 'Pest : Thrips',
  issued_by: AGRONOMIST,
  assigned_to: OPERATOR,
  organization_id: ORG,
  items: [{ id: 'item-1', sort_order: 1, field_id: 'field-1', product_id: 'prod-1', phi_days: 3, end_time: '10:30:00' }],
};

beforeEach(() => jest.clearAllMocks());

describe('toTimeOfDay', () => {
  it('keeps HH:mm and HH:mm:ss', () => {
    expect(toTimeOfDay('10:30')).toBe('10:30');
    expect(toTimeOfDay('10:30:15')).toBe('10:30:15');
  });
  it('extracts the time from a legacy datetime-local value', () => {
    expect(toTimeOfDay('2026-09-28T10:30')).toBe('10:30');
  });
  it('treats blank as null and rejects garbage', () => {
    expect(toTimeOfDay('')).toBeNull();
    expect(toTimeOfDay(undefined)).toBeNull();
    expect(() => toTimeOfDay('soon')).toThrow(/Invalid time/);
  });
});

describe('approveWorkOrder', () => {
  it('creates approved pesticide applications and runs the PHI follow-ups', async () => {
    const calls = makeDb({ ...baseWo, status: 'completed' });

    await approveWorkOrder(WO_ID, AGRONOMIST, ORG);

    const inserts = find(calls, 'INSERT INTO pesticide_applications');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain("'approved'");
    expect(inserts[0].params).toContain(AGRONOMIST);
    expect(find(calls, 'SELECT status FROM spray_work_orders')[0].sql).toContain('FOR UPDATE');
    expect(schedulePHINotifications).toHaveBeenCalledTimes(1);
    expect(checkAndNotifyFieldHarvestConflicts).toHaveBeenCalledWith('field-1');
  });

  it('uses the site\'s crop-specific PHI for the field\'s crop when building the clear date', async () => {
    (getPhiForSiteProductCrop as jest.Mock).mockResolvedValueOnce(7);
    const calls = makeDb({
      ...baseWo, status: 'completed', fieldCrops: { 'field-1': 'Tomato' },
      items: [{ ...baseWo.items[0], date_of_application: '2026-09-28' }],
    });

    await approveWorkOrder(WO_ID, AGRONOMIST, ORG);

    expect(getPhiForSiteProductCrop).toHaveBeenCalledWith('site-1', 'prod-1', 'Tomato');
    const expected = new Date('2026-09-28');
    expected.setHours(10, 30);
    expected.setDate(expected.getDate() + 7);
    const insert = find(calls, 'INSERT INTO pesticide_applications')[0];
    expect(insert.params[3]).toBe(expected.toISOString());
  });

  it('keeps the stored PHI when the lookup fails', async () => {
    (getPhiForSiteProductCrop as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const calls = makeDb({
      ...baseWo, status: 'completed',
      items: [{ ...baseWo.items[0], date_of_application: '2026-09-28' }],
    });
    await approveWorkOrder(WO_ID, AGRONOMIST, ORG);
    const expected = new Date('2026-09-28');
    expected.setHours(10, 30);
    expected.setDate(expected.getDate() + 3);
    expect(find(calls, 'INSERT INTO pesticide_applications')[0].params[3]).toBe(expected.toISOString());
  });

  it('refuses an order that is not completed', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued' });
    await expect(approveWorkOrder(WO_ID, AGRONOMIST, ORG)).rejects.toThrow(/Only completed/);
    expect(find(calls, 'INSERT INTO pesticide_applications')).toHaveLength(0);
  });

  it('does not find an order from another organization', async () => {
    makeDb({ ...baseWo, status: 'completed' });
    await expect(approveWorkOrder(WO_ID, AGRONOMIST, 'org-other')).rejects.toThrow(/not found/);
  });
});

describe('rejectWorkOrder', () => {
  const reviewer = { canReview: true, canManage: true };

  it('sends a completed order back to the operator as issued and notifies them', async () => {
    const calls = makeDb({ ...baseWo, status: 'completed' });

    await rejectWorkOrder(WO_ID, 'Wrong quantity', AGRONOMIST, ORG, reviewer);

    const update = find(calls, 'UPDATE spray_work_orders')[0];
    expect(update.sql).toContain("status = 'issued'");
    expect(update.sql).toContain('completed_at = NULL');
    expect(update.params).toContain('Wrong quantity');
    await new Promise((r) => setImmediate(r));
    const notification = find(calls, 'INSERT INTO user_notifications')[0];
    expect(notification.params[0]).toBe(OPERATOR);
  });

  it('requires a reason to send back', async () => {
    makeDb({ ...baseWo, status: 'completed' });
    await expect(rejectWorkOrder(WO_ID, '  ', AGRONOMIST, ORG, reviewer)).rejects.toThrow(/reason/);
  });

  it('only lets the reviewer send back a completed order', async () => {
    makeDb({ ...baseWo, status: 'completed' });
    await expect(
      rejectWorkOrder(WO_ID, 'x', 'user-om', ORG, { canReview: false, canManage: true }),
    ).rejects.toThrow(/pest agronomist/);
  });

  it('cancels an issued order as rejected', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued' });
    await rejectWorkOrder(WO_ID, 'Wrong product', 'user-om', ORG, { canReview: false, canManage: true });
    expect(find(calls, 'UPDATE spray_work_orders')[0].sql).toContain("status = 'rejected'");
  });
});

const flush = () => new Promise((r) => setImmediate(r));
const notifiedUsers = (calls: Call[]) =>
  find(calls, 'INSERT INTO user_notifications').map((c) => c.params[0]);

describe('notifications', () => {
  it('on submit, tells the issuer and every pest agronomist once each', async () => {
    const calls = makeDb({
      ...baseWo, status: 'issued', issued_by: 'user-om',
      pestAgronomists: [AGRONOMIST, 'user-pa-2', 'user-om'],
    });

    await operatorSubmit(WO_ID, { items: [] }, OPERATOR, ORG);
    await flush(); await flush();

    expect(notifiedUsers(calls).sort()).toEqual([AGRONOMIST, 'user-om', 'user-pa-2'].sort());
  });

  it('on approve, tells the operator', async () => {
    const calls = makeDb({ ...baseWo, status: 'completed' });
    await approveWorkOrder(WO_ID, AGRONOMIST, ORG);
    await flush();
    expect(notifiedUsers(calls)).toEqual([OPERATOR]);
  });

  it('links each notification to its work order', async () => {
    const calls = makeDb({ ...baseWo, status: 'completed' });
    await approveWorkOrder(WO_ID, AGRONOMIST, ORG);
    await flush();
    const event = find(calls, 'INSERT INTO alert_events')[0];
    expect(event.sql).toContain('entity_id');
    expect(event.params[0]).toBe(WO_ID);
  });
});

describe('operatorSubmit', () => {
  it('rejects a submit from someone other than the assignee', async () => {
    makeDb({ ...baseWo, status: 'issued' });
    await expect(operatorSubmit(WO_ID, { items: [] }, 'someone-else', ORG)).rejects.toThrow(/assigned operator/);
  });

  it('stores times as HH:mm and scopes item updates to the order', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued' });

    await operatorSubmit(WO_ID, {
      items: [{ id: 'item-1', startTime: '2026-09-28T08:00', endTime: '10:30' }],
    }, OPERATOR, ORG);

    const itemUpdate = find(calls, 'UPDATE spray_work_order_items')[0];
    expect(itemUpdate.sql).toContain('work_order_id = $2');
    expect(itemUpdate.params.slice(0, 4)).toEqual(['item-1', WO_ID, '08:00', '10:30']);
    expect(find(calls, 'UPDATE spray_work_orders')[0].sql).toContain("status = 'completed'");
  });

  it('completes with empty start and end time', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued' });
    await operatorSubmit(WO_ID, { items: [{ id: 'item-1', startTime: '', endTime: '' }] }, OPERATOR, ORG);
    const itemUpdate = find(calls, 'UPDATE spray_work_order_items')[0];
    expect(itemUpdate.params.slice(2, 4)).toEqual([null, null]);
    expect(find(calls, 'UPDATE spray_work_orders').some((c) => c.sql.includes("status = 'completed'"))).toBe(true);
  });

  it('saves segment, rate, date, a new site pesticide with fresh PHI, and justification', async () => {
    (getPhiForSiteProductCrop as jest.Mock).mockResolvedValueOnce(14);
    const calls = makeDb({ ...baseWo, status: 'issued', siteProducts: ['prod-2'] });

    await operatorSubmit(WO_ID, {
      justification: 'Pest : Whitefly',
      items: [{
        id: 'item-1', segment: 'V3', productId: 'prod-2', rate: '1ml/L', dateOfApplication: '2026-09-30',
      }],
    }, OPERATOR, ORG);

    const itemUpdate = find(calls, 'UPDATE spray_work_order_items')[0];
    expect(itemUpdate.sql).toMatch(/segment = \$11, rate = \$12, date_of_application = \$13, product_id = \$14, phi_days = \$15/);
    expect(itemUpdate.params.slice(10)).toEqual(['V3', '1ml/L', '2026-09-30', 'prod-2', 14]);
    expect(getPhiForSiteProductCrop).toHaveBeenCalledWith('site-1', 'prod-2', null);
    const header = find(calls, 'UPDATE spray_work_orders SET justification');
    expect(header[0].params).toEqual([WO_ID, 'Pest : Whitefly']);
  });

  it('keeps PHI when the pesticide is unchanged', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued' });
    await operatorSubmit(WO_ID, { items: [{ id: 'item-1', productId: 'prod-1' }] }, OPERATOR, ORG);
    const itemUpdate = find(calls, 'UPDATE spray_work_order_items')[0];
    expect(itemUpdate.sql).not.toContain('phi_days');
    expect(getPhiForSiteProductCrop).not.toHaveBeenCalled();
  });

  it('refuses a pesticide that is not assigned to the site', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued', siteProducts: [] });
    await expect(operatorSubmit(WO_ID, { items: [{ id: 'item-1', productId: 'prod-9' }] }, OPERATOR, ORG))
      .rejects.toThrow(/not assigned to this site/);
    expect(calls.map((c) => c.sql)).toContain('ROLLBACK');
  });

  it('ignores rows that do not belong to the order', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued' });
    await operatorSubmit(WO_ID, { items: [{ id: 'other-item', rate: '9' }] }, OPERATOR, ORG);
    expect(find(calls, 'UPDATE spray_work_order_items')).toHaveLength(0);
  });
});

describe('operator added rows', () => {
  const GROUP = '0b9c6f3e-5a8d-4c2e-9f1a-2b3c4d5e6f70';
  const siteReady = { siteProducts: ['prod-1', 'prod-2'], siteFields: ['field-1', 'field-2'] };

  it('inserts another application row on another field, marked as added by the operator', async () => {
    (getPhiForSiteProductCrop as jest.Mock).mockResolvedValueOnce(7);
    const calls = makeDb({ ...baseWo, status: 'issued', ...siteReady });

    await operatorSave(WO_ID, {
      items: [
        { id: 'item-1', productId: 'prod-1' },
        { fieldId: 'field-2', segment: 'V1', productId: 'prod-2', rate: '1ml/L', dateOfApplication: '', totalProductQty: '250' },
      ],
    }, OPERATOR, ORG);

    const insert = find(calls, 'INSERT INTO spray_work_order_items');
    expect(insert).toHaveLength(1);
    expect(insert[0].sql).toContain('added_by_operator');
    expect(insert[0].sql).toMatch(/\$18, true\)/);
    // order id, position 2, field, segment, product, rate, date falls back to the issue date, PHI 7
    expect(insert[0].params.slice(0, 8)).toEqual([WO_ID, 2, 'field-2', 'V1', 'prod-2', '1ml/L', '2026-09-28', 7]);
    expect(insert[0].params[12]).toBe('250');
  });

  it('adds a mixture row in the same group and gives the parent that group', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued', ...siteReady });

    await operatorSave(WO_ID, {
      items: [
        { id: 'item-1', productId: 'prod-1', groupId: GROUP },
        { fieldId: 'field-1', productId: 'prod-2', groupId: GROUP, isMixtureChild: true },
      ],
    }, OPERATOR, ORG);

    const parentUpdate = find(calls, 'UPDATE spray_work_order_items')[0];
    expect(parentUpdate.sql).toContain('group_id =');
    expect(parentUpdate.params).toContain(GROUP);
    const insert = find(calls, 'INSERT INTO spray_work_order_items')[0];
    expect(insert.params[8]).toBe(GROUP);
    expect(insert.params[9]).toBe(true);
  });

  it('keeps a parent that already has a group', async () => {
    const calls = makeDb({
      ...baseWo, status: 'issued', ...siteReady,
      items: [{ ...baseWo.items[0], group_id: 'existing-group' }],
    });
    await operatorSave(WO_ID, { items: [{ id: 'item-1', groupId: GROUP }] }, OPERATOR, ORG);
    expect(find(calls, 'UPDATE spray_work_order_items')[0].sql).not.toContain('group_id =');
  });

  it('refuses an added row on a field of another site', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued', ...siteReady });
    await expect(operatorSave(WO_ID, {
      items: [{ id: 'item-1' }, { fieldId: 'field-elsewhere', productId: 'prod-2' }],
    }, OPERATOR, ORG)).rejects.toThrow(/not on this work order's site/);
    expect(calls.map((c) => c.sql)).toContain('ROLLBACK');
    expect(find(calls, 'INSERT INTO spray_work_order_items')).toHaveLength(0);
  });

  it('refuses an added row without a field or pesticide, and a mixture without a group', async () => {
    makeDb({ ...baseWo, status: 'issued', ...siteReady });
    await expect(operatorSave(WO_ID, { items: [{ productId: 'prod-2' }] }, OPERATOR, ORG)).rejects.toThrow(/field/);
    makeDb({ ...baseWo, status: 'issued', ...siteReady });
    await expect(operatorSave(WO_ID, { items: [{ fieldId: 'field-1' }] }, OPERATOR, ORG)).rejects.toThrow(/pesticide/);
    makeDb({ ...baseWo, status: 'issued', ...siteReady });
    await expect(operatorSave(WO_ID, { items: [{ fieldId: 'field-1', productId: 'prod-2', isMixtureChild: true }] }, OPERATOR, ORG))
      .rejects.toThrow(/mixture/);
  });

  it('removes rows the operator added and left out, but never issued rows', async () => {
    const calls = makeDb({
      ...baseWo, status: 'issued', ...siteReady,
      items: [
        { ...baseWo.items[0] },
        { id: 'item-issued-2', sort_order: 2, field_id: 'field-1', product_id: 'prod-1', added_by_operator: false },
        { id: 'item-added', sort_order: 3, field_id: 'field-2', product_id: 'prod-2', added_by_operator: true },
      ],
    });

    await operatorSave(WO_ID, { items: [{ id: 'item-1' }] }, OPERATOR, ORG);

    const deletes = find(calls, 'DELETE FROM spray_work_order_items');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].sql).toContain('added_by_operator = true');
    expect(deletes[0].params).toEqual([WO_ID, ['item-added']]);
  });

  it('lets the operator add a second mixture (3 products) but not a third', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued', ...siteReady });
    await operatorSave(WO_ID, {
      items: [
        { id: 'item-1', groupId: GROUP },
        { fieldId: 'field-1', productId: 'prod-2', groupId: GROUP, isMixtureChild: true },
        { fieldId: 'field-1', productId: 'prod-1', groupId: GROUP, isMixtureChild: true },
      ],
    }, OPERATOR, ORG);
    expect(find(calls, 'INSERT INTO spray_work_order_items')).toHaveLength(2);

    const refused = makeDb({ ...baseWo, status: 'issued', ...siteReady });
    await expect(operatorSave(WO_ID, {
      items: [
        { id: 'item-1', groupId: GROUP },
        { fieldId: 'field-1', productId: 'prod-2', groupId: GROUP, isMixtureChild: true },
        { fieldId: 'field-1', productId: 'prod-1', groupId: GROUP, isMixtureChild: true },
        { fieldId: 'field-1', productId: 'prod-2', groupId: GROUP, isMixtureChild: true },
      ],
    }, OPERATOR, ORG)).rejects.toThrow(/at most 3 products/);
    expect(find(refused, 'INSERT INTO spray_work_order_items')).toHaveLength(0);
  });

  it('counts a row\'s saved group when the payload does not send it', async () => {
    makeDb({
      ...baseWo, status: 'issued', ...siteReady,
      items: [
        { ...baseWo.items[0], group_id: GROUP },
        { id: 'mix-1', sort_order: 2, field_id: 'field-1', product_id: 'prod-2', group_id: GROUP, is_mixture_child: true },
        { id: 'mix-2', sort_order: 3, field_id: 'field-1', product_id: 'prod-1', group_id: GROUP, is_mixture_child: true },
      ],
    });
    await expect(operatorSave(WO_ID, {
      items: [
        { id: 'item-1' }, { id: 'mix-1' }, { id: 'mix-2' },
        { fieldId: 'field-1', productId: 'prod-2', groupId: GROUP, isMixtureChild: true },
      ],
    }, OPERATOR, ORG)).rejects.toThrow(/at most 3 products/);
  });

  it('saves a mixture with its main row\'s times, machinery and completed by', async () => {
    const calls = makeDb({
      ...baseWo, status: 'issued', ...siteReady,
      items: [
        { ...baseWo.items[0], group_id: GROUP },
        { id: 'mix-1', sort_order: 2, field_id: 'field-1', product_id: 'prod-2', group_id: GROUP, is_mixture_child: true },
      ],
    });
    await operatorSave(WO_ID, {
      items: [
        { id: 'item-1', startTime: '06:30', endTime: '07:45', machineryRef: 'T-2', completedByName: 'Ravi' },
        { id: 'mix-1', startTime: '', endTime: '', machineryRef: 'other', completedByName: '' },
        { fieldId: 'field-1', productId: 'prod-1', groupId: GROUP, isMixtureChild: true },
      ],
    }, OPERATOR, ORG);

    const mixUpdate = find(calls, 'UPDATE spray_work_order_items').find((c) => c.params[0] === 'mix-1')!;
    // $3 start, $4 end, $8 machinery, $10 completed by
    expect([mixUpdate.params[2], mixUpdate.params[3], mixUpdate.params[7], mixUpdate.params[9]])
      .toEqual(['06:30', '07:45', 'T-2', 'Ravi']);
    const insert = find(calls, 'INSERT INTO spray_work_order_items')[0];
    // start, end … machinery, …, completed by
    expect([insert.params[10], insert.params[11], insert.params[15], insert.params[17]])
      .toEqual(['06:30', '07:45', 'T-2', 'Ravi']);
  });

  it('looks PHI up with the field\'s crop for a changed pesticide and for an added row', async () => {
    makeDb({
      ...baseWo, status: 'issued', ...siteReady,
      fieldCrops: { 'field-1': 'Tomato', 'field-2': 'Cucumber' },
    });
    await operatorSave(WO_ID, {
      items: [
        { id: 'item-1', productId: 'prod-2' },
        { fieldId: 'field-2', productId: 'prod-1' },
      ],
    }, OPERATOR, ORG);
    expect(getPhiForSiteProductCrop).toHaveBeenCalledWith('site-1', 'prod-2', 'Tomato');
    expect(getPhiForSiteProductCrop).toHaveBeenCalledWith('site-1', 'prod-1', 'Cucumber');
  });

  it('renumbers rows to follow the list order', async () => {
    const calls = makeDb({
      ...baseWo, status: 'issued', ...siteReady,
      items: [
        { ...baseWo.items[0] },
        { id: 'item-2', sort_order: 2, field_id: 'field-1', product_id: 'prod-1' },
      ],
    });
    await operatorSave(WO_ID, {
      items: [{ id: 'item-1' }, { fieldId: 'field-1', productId: 'prod-2', groupId: GROUP, isMixtureChild: true }, { id: 'item-2' }],
    }, OPERATOR, ORG);
    const updates = find(calls, 'UPDATE spray_work_order_items');
    expect(updates[0].sql).not.toContain('sort_order');
    expect(updates[1].sql).toContain('sort_order =');
    expect(updates[1].params).toContain(3);
  });
});

describe('listSiteFields', () => {
  it('returns the fields of the order\'s site, or none without a site', async () => {
    makeDb({ ...baseWo, siteFields: ['field-1', 'field-2'] });
    await expect(listSiteFields('site-1')).resolves.toEqual([{ id: 'field-1' }, { id: 'field-2' }]);
    await expect(listSiteFields(null)).resolves.toEqual([]);
  });
});

describe('operatorSave', () => {
  it('saves the operator changes without completing the order', async () => {
    const calls = makeDb({ ...baseWo, status: 'issued' });
    await operatorSave(WO_ID, { items: [{ id: 'item-1', rate: '2ml/L', startTime: '' }] }, OPERATOR, ORG);
    expect(find(calls, 'UPDATE spray_work_order_items')).toHaveLength(1);
    expect(find(calls, 'UPDATE spray_work_orders').some((c) => c.sql.includes('completed'))).toBe(false);
    expect(calls.map((c) => c.sql)).toContain('COMMIT');
  });

  it('only the assigned operator may save', async () => {
    makeDb({ ...baseWo, status: 'issued' });
    await expect(operatorSave(WO_ID, { items: [] }, 'someone-else', ORG)).rejects.toThrow(/assigned operator/);
  });

  it('cannot save a completed order', async () => {
    makeDb({ ...baseWo, status: 'completed' });
    await expect(operatorSave(WO_ID, { items: [] }, OPERATOR, ORG)).rejects.toThrow(/not in a submittable state/);
  });
});
