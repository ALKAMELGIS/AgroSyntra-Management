"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
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
const client_1 = require("../../db/client");
const ipmService = __importStar(require("../ipm.service"));
const auditLog_service_1 = require("../auditLog.service");
const ipmChangeRequest_service_1 = require("../ipmChangeRequest.service");
const ipmAccess_1 = require("../../utils/ipmAccess");
const errors_1 = require("../../utils/errors");
const mockQuery = client_1.dbPool.query;
const mockConnect = client_1.dbPool.connect;
const mockUpdateInspection = ipmService.updateBumbleBeeBoxInspection;
const mockValidateProposed = ipmService.validateBumbleBeeInspectionProposedPayload;
const mockGetInspection = ipmService.getBumbleBeeBoxInspection;
const mockGetLastDeploy = ipmService.getBumbleBeeLastForField;
const mockDeletePesticide = ipmService.deletePesticideApplication;
const mockBulkDeletePesticide = ipmService.bulkDeletePesticideApplications;
const PEST_AGRONOMIST = {
    userId: 'agronomist-1',
    email: 'agronomist@test.com',
    role: 'pest_agronomist',
};
const SCOUTER = {
    userId: 'scouter-1',
    email: 'scouter@test.com',
    role: 'scouter',
};
describe('ipmChangeRequest.service bumble bee', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        auditLog_service_1.logAuditEvent.mockResolvedValue(undefined);
    });
    describe('reviewChangeRequest approve', () => {
        it('applies proposed payload with skipDeployTotalCheck on bumble bee update', async () => {
            const clientQuery = jest.fn()
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce({
                rows: [{
                        id: 'req-1',
                        entity_type: ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION,
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
                        entity_type: ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION,
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
            mockConnect.mockResolvedValue({
                query: clientQuery,
                release: jest.fn(),
            });
            mockUpdateInspection.mockResolvedValue({ id: 'insp-1' });
            await (0, ipmChangeRequest_service_1.reviewChangeRequest)(PEST_AGRONOMIST, 'req-1', 'approved');
            expect(mockUpdateInspection).toHaveBeenCalledWith('insp-1', expect.objectContaining({ boxes60: 1, boxes40: 1 }), { skipDeployTotalCheck: true });
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
                        entity_type: ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION,
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
            const result = await (0, ipmChangeRequest_service_1.createChangeRequest)(SCOUTER, {
                entityType: ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION,
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
    role: 'auditor',
};
const APP_A = '11111111-1111-4111-8111-111111111111';
const APP_B = '22222222-2222-4222-8222-222222222222';
function pesticideRow(id, extra = {}) {
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
        auditLog_service_1.logAuditEvent.mockResolvedValue(undefined);
        mockQuery.mockResolvedValue({ rows: [] });
    });
    it('creates one request covering every selected ID', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [pesticideRow(APP_A), pesticideRow(APP_B)] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({
            rows: [{
                    id: 'req-bulk',
                    entity_type: ipmAccess_1.ENTITY_PESTICIDE_APPLICATION,
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
        const result = await (0, ipmChangeRequest_service_1.createChangeRequest)(PEST_AGRONOMIST, {
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
        await expect((0, ipmChangeRequest_service_1.createChangeRequest)(PEST_AGRONOMIST, {
            entityIds: [APP_A, APP_B],
            action: 'delete',
            reason: 'clearing imported test rows',
            organizationId: 'org-1',
        })).rejects.toBeInstanceOf(errors_1.NotFoundError);
    });
    it('rejects when any selected ID already has a pending request', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [pesticideRow(APP_A), pesticideRow(APP_B)] })
            .mockResolvedValueOnce({ rows: [{ id: 'pending-1' }] });
        await expect((0, ipmChangeRequest_service_1.createChangeRequest)(PEST_AGRONOMIST, {
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
                    entity_type: ipmAccess_1.ENTITY_PESTICIDE_APPLICATION,
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
                    entity_type: ipmAccess_1.ENTITY_PESTICIDE_APPLICATION,
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
        await (0, ipmChangeRequest_service_1.reviewChangeRequest)(AUDITOR, 'req-bulk', 'approved');
        expect(mockBulkDeletePesticide).toHaveBeenCalledWith([APP_A, APP_B], 'org-1');
        expect(mockDeletePesticide).not.toHaveBeenCalled();
    });
    it('keeps a single delete on deletePesticideApplication', async () => {
        const clientQuery = jest.fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({
            rows: [{
                    id: 'req-one',
                    entity_type: ipmAccess_1.ENTITY_PESTICIDE_APPLICATION,
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
                    entity_type: ipmAccess_1.ENTITY_PESTICIDE_APPLICATION,
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
        await (0, ipmChangeRequest_service_1.reviewChangeRequest)(AUDITOR, 'req-one', 'approved');
        expect(mockDeletePesticide).toHaveBeenCalledWith(APP_A);
        expect(mockBulkDeletePesticide).not.toHaveBeenCalled();
    });
});
