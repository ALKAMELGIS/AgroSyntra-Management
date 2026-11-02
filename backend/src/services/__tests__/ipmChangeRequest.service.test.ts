jest.mock('../../db/client', () => ({
  dbPool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../ipm.service', () => ({
  getBumbleBeeBoxInspection: jest.fn(),
  getBumbleBeeLastForField: jest.fn(),
  updateBumbleBeeBoxInspection: jest.fn(),
  deleteBumbleBeeBoxInspection: jest.fn(),
  validateBumbleBeeInspectionProposedPayload: jest.fn(),
  deletePesticideApplication: jest.fn(),
  bulkDeletePesticideApplications: jest.fn(),
  updatePesticideApplication: jest.fn(),
}));

jest.mock('../auditLog.service', () => ({
  logAuditEvent: jest.fn(),
}));

jest.mock('../bioRecord.service', () => ({
  getBioFieldSetupSnapshot: jest.fn(),
  deleteBioFieldSetup: jest.fn(),
}));

import { dbPool } from '../../db/client';
import * as ipmService from '../ipm.service';
import { logAuditEvent } from '../auditLog.service';
import { reviewChangeRequest, createChangeRequest, listChangeRequests } from '../ipmChangeRequest.service';
import { ENTITY_BUMBLE_BEE_BOX_INSPECTION, ENTITY_PESTICIDE_APPLICATION } from '../../utils/ipmAccess';
import { AppError, NotFoundError } from '../../utils/errors';

const mockQuery = dbPool.query as jest.Mock;
const mockConnect = dbPool.connect as jest.Mock;
const mockUpdateInspection = ipmService.updateBumbleBeeBoxInspection as jest.Mock;
const mockValidateProposed = ipmService.validateBumbleBeeInspectionProposedPayload as jest.Mock;
const mockGetInspection = ipmService.getBumbleBeeBoxInspection as jest.Mock;
const mockGetLastDeploy = ipmService.getBumbleBeeLastForField as jest.Mock;
const mockDeletePesticide = ipmService.deletePesticideApplication as jest.Mock;
const mockBulkDeletePesticide = ipmService.bulkDeletePesticideApplications as jest.Mock;

const PEST_AGRONOMIST = {
  userId: 'agronomist-1',
  email: 'agronomist@test.com',
  role: 'pest_agronomist' as const,
};

const SCOUTER = {
  userId: 'scouter-1',
  email: 'scouter@test.com',
  role: 'scouter' as const,
};

describe('ipmChangeRequest.service bumble bee', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (logAuditEvent as jest.Mock).mockResolvedValue(undefined);
  });

  describe('reviewChangeRequest approve', () => {
    it('applies proposed payload with skipDeployTotalCheck on bumble bee update', async () => {
      const clientQuery = jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [{
            id: 'req-1',
            entity_type: ENTITY_BUMBLE_BEE_BOX_INSPECTION,
            entity_id: 'insp-1',
            action: 'update',
            status: 'pending',
            proposed_payload: {
              inspectionDate: '2026-08-07',
              boxes100: 5,
              boxes80: 3,
              boxes60: 1,
              boxes40: 1,
              boxes20: 0,
              boxes0: 0,
              notes: '',
            },
            requested_by: 'scouter-1',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'req-1',
            entity_type: ENTITY_BUMBLE_BEE_BOX_INSPECTION,
            entity_id: 'insp-1',
            action: 'update',
            status: 'approved',
            proposed_payload: {
              inspectionDate: '2026-08-07',
              boxes100: 5,
              boxes80: 3,
              boxes60: 1,
              boxes40: 1,
              boxes20: 0,
              boxes0: 0,
              notes: '',
            },
            requested_by: 'scouter-1',
            reviewed_by: PEST_AGRONOMIST.userId,
            reviewed_at: new Date(),
            reviewer_comment: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce(undefined);

      const client = {
        query: clientQuery,
        release: jest.fn(),
      };
      mockConnect.mockResolvedValue(client);
      mockUpdateInspection.mockResolvedValue({ id: 'insp-1' });

      await reviewChangeRequest(PEST_AGRONOMIST, 'req-1', 'approved', undefined, undefined, 'org-1');

      // Applied on the review transaction's client, not the shared pool.
      expect(mockUpdateInspection).toHaveBeenCalledWith(
        'insp-1',
        expect.objectContaining({ boxes60: 1, boxes40: 1 }),
        { skipDeployTotalCheck: true },
        client,
      );
    });
  });

  describe('createChangeRequest bumble bee update', () => {
    it('allows change request when proposed total differs from deployment', async () => {
      mockGetInspection.mockResolvedValue({
        id: 'insp-1',
        field_id: 'field-1',
        created_by: SCOUTER.userId,
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        inspection_date: '2026-08-07',
        boxes_100: 5,
        boxes_80: 4,
        boxes_60: 2,
        boxes_40: 0,
        boxes_20: 0,
        boxes_0: 0,
        notes: '',
        organization_id: 'org-1',
      });
      mockGetLastDeploy.mockResolvedValue({ box_count_total: 10, box_count: 10 });
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'req-1',
            entity_type: ENTITY_BUMBLE_BEE_BOX_INSPECTION,
            entity_id: 'insp-1',
            action: 'update',
            status: 'pending',
            proposed_payload: {
              inspectionDate: '2026-08-07',
              boxes100: 5,
              boxes80: 3,
              boxes60: 0,
              boxes40: 0,
              boxes20: 0,
              boxes0: 0,
              notes: '',
            },
            snapshot_before: { deploy_total: 10 },
            requested_by: SCOUTER.userId,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        });

      const result = await createChangeRequest(SCOUTER, {
        entityType: ENTITY_BUMBLE_BEE_BOX_INSPECTION,
        entityId: 'insp-1',
        action: 'update',
        reason: 'recount found fewer live boxes',
        proposedPayload: {
          inspectionDate: '2026-08-07',
          boxes100: 5,
          boxes80: 3,
          boxes60: 0,
          boxes40: 0,
          boxes20: 0,
          boxes0: 0,
          notes: '',
        },
      });

      expect(mockValidateProposed).not.toHaveBeenCalled();
      expect(mockGetLastDeploy).toHaveBeenCalledWith('field-1');
      expect(result.id).toBe('req-1');
    });
  });
});

const AUDITOR = {
  userId: 'auditor-1',
  email: 'auditor@test.com',
  role: 'auditor' as const,
};

const APP_A = '11111111-1111-4111-8111-111111111111';
const APP_B = '22222222-2222-4222-8222-222222222222';

function pesticideRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    field_name: id === APP_A ? 'NH 01' : 'NH 02',
    crop_name: 'Tomato Beef',
    product_name: 'Sven RZ',
    application_date: '2026-06-04',
    organization_id: 'org-1',
    ...extra,
  };
}

describe('ipmChangeRequest.service pesticide bulk delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (logAuditEvent as jest.Mock).mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('creates one request covering every selected ID', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [pesticideRow(APP_A), pesticideRow(APP_B)] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'req-bulk',
          entity_type: ENTITY_PESTICIDE_APPLICATION,
          entity_id: APP_A,
          action: 'delete',
          status: 'pending',
          proposed_payload: { entityIds: [APP_A, APP_B] },
          snapshot_before: { bulk: true, count: 2 },
          requested_by: PEST_AGRONOMIST.userId,
          organization_id: 'org-1',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

    const result = await createChangeRequest(PEST_AGRONOMIST, {
      entityIds: [APP_A, APP_B],
      action: 'delete',
      reason: 'clearing imported test rows',
      organizationId: 'org-1',
    });

    expect(result.id).toBe('req-bulk');
    const insertCall = mockQuery.mock.calls.find((call) => String(call[0]).includes('INSERT INTO ipm_change_requests'));
    expect(insertCall[1][1]).toBe(APP_A);
    expect(insertCall[1][5]).toBe(JSON.stringify({ entityIds: [APP_A, APP_B] }));
    expect(insertCall[1][7]).toBe('org-1');
    const snapshot = JSON.parse(insertCall[1][6]);
    expect(snapshot.bulk).toBe(true);
    expect(snapshot.count).toBe(2);
    expect(snapshot.records).toHaveLength(2);
    expect(snapshot.records[0]).toEqual(expect.objectContaining({
      id: APP_A,
      field_name: 'NH 01',
      crop_name: 'Tomato Beef',
      product_name: 'Sven RZ',
    }));
  });

  it('rejects when a selected application is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [pesticideRow(APP_A)] });

    await expect(createChangeRequest(PEST_AGRONOMIST, {
      entityIds: [APP_A, APP_B],
      action: 'delete',
      reason: 'clearing imported test rows',
      organizationId: 'org-1',
    })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when any selected ID already has a pending request', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [pesticideRow(APP_A), pesticideRow(APP_B)] })
      .mockResolvedValueOnce({ rows: [{ id: 'pending-1' }] });

    await expect(createChangeRequest(PEST_AGRONOMIST, {
      entityIds: [APP_A, APP_B],
      action: 'delete',
      reason: 'clearing imported test rows',
      organizationId: 'org-1',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('approves bulk delete with one review', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{
          id: 'req-bulk',
          entity_type: ENTITY_PESTICIDE_APPLICATION,
          entity_id: APP_A,
          action: 'delete',
          status: 'pending',
          proposed_payload: { entityIds: [APP_A, APP_B] },
          requested_by: PEST_AGRONOMIST.userId,
          organization_id: 'org-1',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'req-bulk',
          entity_type: ENTITY_PESTICIDE_APPLICATION,
          entity_id: APP_A,
          action: 'delete',
          status: 'approved',
          proposed_payload: { entityIds: [APP_A, APP_B] },
          requested_by: PEST_AGRONOMIST.userId,
          organization_id: 'org-1',
          reviewed_by: AUDITOR.userId,
          reviewed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        }],
      })
      .mockResolvedValueOnce(undefined);

    mockConnect.mockResolvedValue({
      query: clientQuery,
      release: jest.fn(),
    });
    mockBulkDeletePesticide.mockResolvedValue(2);

    await reviewChangeRequest(AUDITOR, 'req-bulk', 'approved', undefined, undefined, 'org-1');

    expect(mockBulkDeletePesticide).toHaveBeenCalledWith([APP_A, APP_B], 'org-1');
    expect(mockDeletePesticide).not.toHaveBeenCalled();
  });

  it('keeps a single delete on deletePesticideApplication', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{
          id: 'req-one',
          entity_type: ENTITY_PESTICIDE_APPLICATION,
          entity_id: APP_A,
          action: 'delete',
          status: 'pending',
          proposed_payload: null,
          requested_by: PEST_AGRONOMIST.userId,
          organization_id: 'org-1',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'req-one',
          entity_type: ENTITY_PESTICIDE_APPLICATION,
          entity_id: APP_A,
          action: 'delete',
          status: 'approved',
          requested_by: PEST_AGRONOMIST.userId,
          organization_id: 'org-1',
          reviewed_by: AUDITOR.userId,
          reviewed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        }],
      })
      .mockResolvedValueOnce(undefined);

    mockConnect.mockResolvedValue({
      query: clientQuery,
      release: jest.fn(),
    });
    mockDeletePesticide.mockResolvedValue(undefined);

    await reviewChangeRequest(AUDITOR, 'req-one', 'approved', undefined, undefined, 'org-1');

    expect(mockDeletePesticide).toHaveBeenCalledWith(APP_A);
    expect(mockBulkDeletePesticide).not.toHaveBeenCalled();
  });
});

describe('ipmChangeRequest.service organization scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (logAuditEvent as jest.Mock).mockResolvedValue(undefined);
  });

  it('lists only the current organization, like the badge', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listChangeRequests(AUDITOR, { organizationId: 'org-1', status: 'pending' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('cr.organization_id = $1');
    expect(params[0]).toBe('org-1');
  });

  it('treats a request from another organization as not found and changes nothing', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // scoped SELECT finds nothing
      .mockResolvedValueOnce(undefined); // ROLLBACK
    mockConnect.mockResolvedValue({ query: clientQuery, release: jest.fn() });

    await expect(
      reviewChangeRequest(AUDITOR, 'req-bulk', 'approved', undefined, undefined, 'org-other'),
    ).rejects.toBeInstanceOf(NotFoundError);

    const select = clientQuery.mock.calls[1];
    expect(select[0]).toContain('organization_id = $2');
    expect(select[1]).toEqual(['req-bulk', 'org-other']);
    expect(mockBulkDeletePesticide).not.toHaveBeenCalled();
    expect(mockDeletePesticide).not.toHaveBeenCalled();
    expect(clientQuery.mock.calls.some((c) => String(c[0]).startsWith('UPDATE ipm_change_requests'))).toBe(false);
  });
});

describe('ipmChangeRequest.service biological control table delete', () => {
  const bioService = jest.requireMock('../bioRecord.service') as {
    getBioFieldSetupSnapshot: jest.Mock;
    deleteBioFieldSetup: jest.Mock;
  };
  const WORKER = { userId: 'worker-1', email: 'worker@test.com', role: 'worker' as const };
  const SETUP_ID = '11111111-1111-4111-8111-111111111111';
  const snapshot = {
    id: SETUP_ID,
    organization_id: 'org-1',
    field_name: 'NH 1',
    crop_name: 'Tomato',
    season_name: '2026',
    product_count: 4,
    entry_count: 12,
    pending_count: 1,
    label: 'NH 1 · Tomato · 2026',
  };

  function crRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'req-bio',
      organization_id: 'org-1',
      entity_type: 'bio_field_setup',
      entity_id: SETUP_ID,
      action: 'delete',
      status: 'pending',
      requested_by: SCOUTER.userId,
      reason: 'duplicate table',
      snapshot_before: snapshot,
      ...overrides,
    };
  }

  function reviewClient(extra: (sql: string) => { rows: unknown[] } | null = () => null) {
    const clientQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
      const hit = extra(sql);
      if (hit) return hit;
      if (sql.includes('FROM ipm_change_requests WHERE id = $1')) return { rows: [crRow()] };
      if (sql.trim().startsWith('UPDATE ipm_change_requests')) return { rows: [crRow({ status: 'reviewed' })] };
      return { rows: [] };
    });
    const client = { query: clientQuery, release: jest.fn() };
    mockConnect.mockResolvedValue(client);
    return { client, clientQuery };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (logAuditEvent as jest.Mock).mockResolvedValue(undefined);
    bioService.getBioFieldSetupSnapshot.mockResolvedValue(snapshot);
    bioService.deleteBioFieldSetup.mockResolvedValue(undefined);
  });

  it.each([SCOUTER, WORKER])('lets a $role request deleting a table, scoped to their organization', async (actor) => {
    mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO ipm_change_requests')) {
        return { rows: [{ ...crRow(), requested_by: actor.userId, organization_id: params[7] }] };
      }
      return { rows: [] };
    });

    const request = await createChangeRequest(actor, {
      entityType: 'bio_field_setup',
      entityId: SETUP_ID,
      action: 'delete',
      reason: 'duplicate table',
      organizationId: 'org-1',
    });

    expect(bioService.getBioFieldSetupSnapshot).toHaveBeenCalledWith(SETUP_ID, 'org-1');
    const insert = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO ipm_change_requests'))!;
    expect(insert[1][0]).toBe('bio_field_setup');
    expect(insert[1][2]).toBe('delete');
    expect(JSON.parse(insert[1][6] as string)).toMatchObject({ label: 'NH 1 · Tomato · 2026', entry_count: 12 });
    expect(insert[1][7]).toBe('org-1');
    expect(request.entityType).toBe('bio_field_setup');
  });

  it('refuses a request from the pest agronomist (who deletes directly) and view-only roles', async () => {
    const agronomist = { userId: 'ag', email: 'ag@test.com', role: 'agronomist' as const };
    for (const actor of [PEST_AGRONOMIST, agronomist]) {
      await expect(createChangeRequest(actor, {
        entityType: 'bio_field_setup', entityId: SETUP_ID, action: 'delete', reason: 'x', organizationId: 'org-1',
      })).rejects.toMatchObject({ status: 403 });
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('only supports delete requests', async () => {
    await expect(createChangeRequest(SCOUTER, {
      entityType: 'bio_field_setup', entityId: SETUP_ID, action: 'update', reason: 'x',
      proposedPayload: { a: 1 }, organizationId: 'org-1',
    })).rejects.toMatchObject({ status: 400 });
  });

  it('approve deletes the table inside the review transaction, scoped to the organization', async () => {
    const { client, clientQuery } = reviewClient((sql) => (
      sql.includes('FROM bio_record_field_setup bs') ? { rows: [{ id: SETUP_ID }] } : null
    ));

    await reviewChangeRequest(PEST_AGRONOMIST, 'req-bio', 'approved', undefined, undefined, 'org-1');

    const scoped = clientQuery.mock.calls.find(([sql]) => sql.includes('FROM bio_record_field_setup bs'))!;
    expect(scoped[1]).toEqual([SETUP_ID, 'org-1']);
    expect(bioService.deleteBioFieldSetup).toHaveBeenCalledWith(client, SETUP_ID);
    expect(clientQuery.mock.calls.map(([sql]) => sql)).toContain('COMMIT');
  });

  it('approve of a table that is gone (or in another organization) deletes nothing', async () => {
    reviewClient();
    await reviewChangeRequest(PEST_AGRONOMIST, 'req-bio', 'approved', undefined, undefined, 'org-1');
    expect(bioService.deleteBioFieldSetup).not.toHaveBeenCalled();
  });

  it('reject keeps the table', async () => {
    reviewClient();
    await reviewChangeRequest(PEST_AGRONOMIST, 'req-bio', 'rejected', 'keep it', undefined, 'org-1');
    expect(bioService.deleteBioFieldSetup).not.toHaveBeenCalled();
  });

  it('a scouter cannot review it', async () => {
    reviewClient();
    await expect(
      reviewChangeRequest(SCOUTER, 'req-bio', 'approved', undefined, undefined, 'org-1'),
    ).rejects.toMatchObject({ status: 403 });
    expect(bioService.deleteBioFieldSetup).not.toHaveBeenCalled();
  });
});
