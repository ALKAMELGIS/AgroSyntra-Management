import {
  CHANGE_REQUEST_ENTITY_LABELS,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
  bumbleBeeProposalTitle,
  changeRequestActionLabel,
  changeRequestChangeLines,
  isBumbleBeeEntityType,
  ENTITY_BIO_FIELD_SETUP,
  canListChangeRequests,
  canReviewEntityChangeRequest,
  canViewSeasonReopenChangeRequestTab,
  canViewManpowerChangeRequestTab,
  ENTITY_MANPOWER_RECORD,
  ENTITY_SEASON_REOPEN,
  entityTypesForTab,
  getReviewableEntityTypes,
} from '../changeRequestAccess';

describe('changeRequestAccess season reopen', () => {
  const auditor = { role: 'auditor' };
  const om = { role: 'operation_manager' };
  const ceo = { role: 'ceo' };

  it('lets only auditors review season reopen requests', () => {
    expect(canReviewEntityChangeRequest(auditor, ENTITY_SEASON_REOPEN)).toBe(true);
    expect(canReviewEntityChangeRequest(om, ENTITY_SEASON_REOPEN)).toBe(false);
    expect(canReviewEntityChangeRequest(ceo, ENTITY_SEASON_REOPEN)).toBe(false);
  });

  it('shows the Seasons tab to auditors', () => {
    expect(canViewSeasonReopenChangeRequestTab(auditor)).toBe(true);
    expect(canViewSeasonReopenChangeRequestTab(om)).toBe(false);
    expect(canListChangeRequests(auditor)).toBe(true);
    expect(getReviewableEntityTypes(auditor)).toContain(ENTITY_SEASON_REOPEN);
  });

  it('maps the seasons tab to season_reopen', () => {
    expect(entityTypesForTab('seasons')).toEqual([ENTITY_SEASON_REOPEN]);
  });
});

describe('changeRequestAccess manpower records', () => {
  it('are reviewed by the operation manager only (plus the IPM admin email)', () => {
    expect(canReviewEntityChangeRequest({ role: 'operation_manager' }, ENTITY_MANPOWER_RECORD)).toBe(true);
    expect(canViewManpowerChangeRequestTab({ role: 'operation_manager' })).toBe(true);
    expect(canReviewEntityChangeRequest({ role: 'ceo', email: 'abdullah@elite.com' }, ENTITY_MANPOWER_RECORD)).toBe(true);
    ['ceo', 'farm_manager', 'agronomist', 'worker', 'operator', 'pest_agronomist'].forEach((role) => {
      expect(canReviewEntityChangeRequest({ role }, ENTITY_MANPOWER_RECORD)).toBe(false);
      expect(canViewManpowerChangeRequestTab({ role })).toBe(false);
    });
  });
});

describe('changeRequestAccess biological control table delete', () => {
  it('is reviewed by the pest agronomist on the IPM tab', () => {
    expect(canReviewEntityChangeRequest({ role: 'pest_agronomist' }, ENTITY_BIO_FIELD_SETUP)).toBe(true);
    expect(canReviewEntityChangeRequest({ role: 'scouter' }, ENTITY_BIO_FIELD_SETUP)).toBe(false);
    expect(canReviewEntityChangeRequest({ role: 'auditor' }, ENTITY_BIO_FIELD_SETUP)).toBe(false);
    expect(entityTypesForTab('ipm')).toContain(ENTITY_BIO_FIELD_SETUP);
    expect(CHANGE_REQUEST_ENTITY_LABELS[ENTITY_BIO_FIELD_SETUP]).toBe('Biological control table');
  });
});

describe('changeRequestAccess bumble bee proposals', () => {
  const types = [ENTITY_BUMBLE_BEE_DEPLOYMENT, ENTITY_BUMBLE_BEE_INVENTORY, ENTITY_BUMBLE_BEE_ORDER];

  it('are reviewed by the pest agronomist and the IPM admin only, on the IPM tab', () => {
    types.forEach((type) => {
      expect(canReviewEntityChangeRequest({ role: 'pest_agronomist' }, type)).toBe(true);
      expect(canReviewEntityChangeRequest({ role: 'ceo', email: 'abdullah@elite.com' }, type)).toBe(true);
      ['scouter', 'agronomist', 'operator', 'ceo', 'auditor', 'operation_manager'].forEach((role) => {
        expect(canReviewEntityChangeRequest({ role }, type)).toBe(false);
      });
      expect(entityTypesForTab('ipm')).toContain(type);
      expect(CHANGE_REQUEST_ENTITY_LABELS[type]).toMatch(/^Bumble bee/);
    });
    expect(isBumbleBeeEntityType('bumble_bee_box_inspection')).toBe(true);
    expect(isBumbleBeeEntityType('pesticide_application')).toBe(false);
  });

  it('labels the new actions', () => {
    expect(changeRequestActionLabel('create')).toBe('New');
    expect(changeRequestActionLabel('set')).toBe('Set count');
    expect(changeRequestActionLabel('receive')).toBe('Receive');
    expect(changeRequestActionLabel('delete')).toBe('Delete');
    expect(changeRequestActionLabel('update')).toBe('Edit');
  });

  it('describes what a proposal would change', () => {
    expect(changeRequestChangeLines({
      entityType: ENTITY_BUMBLE_BEE_DEPLOYMENT,
      action: 'create',
      proposedPayload: { datePlaced: '2026-09-29', boxesBefore: 10, boxesRemoved: 2, boxesAdded: 5 },
      snapshotBefore: { field_name: 'NH 1', quantity_on_hand: 20 },
    })).toEqual([
      'NH 1 on 2026-09-29',
      'Before 10 − removed 2 + added 5 = 13 on field',
      'Takes 5 from stock (20 on hand when sent)',
    ]);
    expect(changeRequestChangeLines({
      entityType: ENTITY_BUMBLE_BEE_INVENTORY,
      action: 'set',
      proposedPayload: { quantityOnHand: 14 },
      snapshotBefore: { quantity_on_hand: 20, site_name: 'Main' },
    })).toEqual(['Boxes on hand 20 → 14 (-6)', 'Site: Main']);
    expect(changeRequestChangeLines({
      entityType: ENTITY_BUMBLE_BEE_ORDER,
      action: 'update',
      proposedPayload: { status: 'cancelled' },
      snapshotBefore: {},
    })).toEqual(['Cancel this order']);
    expect(changeRequestChangeLines({
      entityType: ENTITY_BUMBLE_BEE_ORDER,
      action: 'receive',
      proposedPayload: { quantityReceived: 11, receivedDate: '2026-09-29' },
      snapshotBefore: { quantity_on_hand: 20, quantity_expected: 12 },
    })).toEqual(['Received 11 boxes on 2026-09-29', 'Stock 20 → 31 (when sent)']);
    expect(changeRequestChangeLines({ entityType: 'pesticide_application', action: 'update' })).toEqual([]);
  });

  it('titles a proposal for the Bumble Bees page', () => {
    expect(bumbleBeeProposalTitle({
      entityType: ENTITY_BUMBLE_BEE_DEPLOYMENT, action: 'create', snapshotBefore: { label: 'NH 1 · 2026-09-29' },
    })).toBe('New deployment · NH 1 · 2026-09-29');
    expect(bumbleBeeProposalTitle({
      entityType: ENTITY_BUMBLE_BEE_ORDER, action: 'update', proposedPayload: { status: 'cancelled' }, snapshotBefore: {},
    })).toBe('Cancel order');
  });
});
