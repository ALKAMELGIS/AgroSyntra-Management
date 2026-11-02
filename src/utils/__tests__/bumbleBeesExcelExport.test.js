import { computeBumbleBeeSummary } from '../bumbleBeeSummary';
import {
  buildBumbleBeeDeploymentRows,
  buildBumbleBeeInspectionRows,
  buildBumbleBeeInventoryRows,
  buildBumbleBeeSummaryRows,
  buildBumbleBeesSheets,
} from '../bumbleBeesExcelExport';

describe('buildBumbleBeesSheets', () => {
  it('always emits Summary and omits empty data tabs', () => {
    const summary = computeBumbleBeeSummary([], { quantityOnHand: 0, projectedTotal: 0 });
    const sheets = buildBumbleBeesSheets({ summary, deployments: [], inspections: [], incomingOrders: [] });
    expect(sheets.map((s) => s.sheetName)).toEqual(['Summary']);
    expect(sheets[0].rows[0]['Boxes on hand']).toBe(0);
    expect(sheets[0].rows[0]['Avg boxes removed / week']).toBe('');
    expect(Object.keys(sheets[0].rows[0])).not.toContain('Actions');
  });

  it('adds the three data sheets when lists have saved rows', () => {
    const summary = computeBumbleBeeSummary([{
      date_placed: '2026-04-01',
      field_name: 'NH05',
      boxes_added: 2,
      boxes_removed: 1,
    }], { quantityOnHand: 3, projectedTotal: 5 });
    const sheets = buildBumbleBeesSheets({
      summary,
      deployments: [{
        field_name: 'NH05',
        date_placed: '2026-04-01T00:00:00Z',
        boxes_before: 4,
        boxes_removed: 1,
        boxes_added: 2,
        box_count_total: 5,
        days_since_last: 7,
        notes: 'ok',
      }],
      inspections: [{
        field_name: 'NH05',
        inspection_date: '2026-04-08',
        boxes_100: 1,
        boxes_80: 2,
        boxes_60: 0,
        boxes_40: 0,
        boxes_20: 0,
        boxes_0: 1,
        notes: '',
      }],
      incomingOrders: [{
        quantity_expected: 10,
        order_date: '2026-03-01',
        expected_delivery_date: '2026-03-10',
        received_at: '2026-03-11',
        quantity_received: 10,
        quantity_on_hand_before: 0,
        quantity_on_hand_after: 10,
        status: 'received',
        notes: '',
      }],
    });
    expect(sheets.map((s) => s.sheetName)).toEqual(['Summary', 'Deployments', 'Inspection', 'Inventory']);
    sheets.forEach((sheet) => {
      expect(Object.keys(sheet.rows[0])).not.toContain('Actions');
    });
  });
});

describe('buildBumbleBeeDeploymentRows', () => {
  it('uses screen headers and formats dates as dd/mm/yyyy', () => {
    const rows = buildBumbleBeeDeploymentRows([{
      field_name: 'NH05',
      date_placed: '2026-04-01T08:00:00Z',
      boxes_before: 4,
      boxes_removed: 1,
      boxes_added: 2,
      box_count_total: 5,
      days_since_last: 7,
      notes: 'ok',
    }]);
    expect(Object.keys(rows[0])).toEqual([
      'Field',
      'Deployment date',
      'Before visit',
      'Removed',
      'Added',
      'Total on field',
      'Days since last',
      'Notes',
    ]);
    expect(rows[0]['Deployment date']).toBe('01/04/2026');
    expect(rows[0]['Days since last']).toBe(7);
    expect(typeof rows[0].Added).toBe('number');
  });
});

describe('buildBumbleBeeInspectionRows', () => {
  it('keeps unique percent headers and totals from db buckets', () => {
    const rows = buildBumbleBeeInspectionRows([{
      field_name: 'NH05',
      inspection_date: '2026-04-08T00:00:00',
      boxes_100: 1,
      boxes_80: 2,
      boxes_60: 3,
      boxes_40: 0,
      boxes_20: 0,
      boxes_0: 1,
    }]);
    expect(Object.keys(rows[0])).toEqual([
      'Field',
      'Inspection date',
      '100%',
      '80%',
      '60%',
      '40%',
      '20%',
      '0%',
      'Total boxes',
      'Notes',
    ]);
    expect(rows[0]['Inspection date']).toBe('08/04/2026');
    expect(rows[0]['Total boxes']).toBe(7);
    expect(typeof rows[0]['100%']).toBe('number');
  });
});

describe('buildBumbleBeeInventoryRows', () => {
  it('matches screen headers and reads received_at', () => {
    const rows = buildBumbleBeeInventoryRows([
      {
        quantity_expected: 4,
        created_at: '2026-02-01T12:00:00Z',
        expected_delivery_date: '2026-02-10',
        status: 'pending',
      },
      {
        quantity_expected: 10,
        order_date: '2026-03-01',
        expected_delivery_date: '2026-03-10',
        received_at: '2026-03-11T15:00:00Z',
        quantity_received: 9,
        quantity_on_hand_before: 1,
        quantity_on_hand_after: 10,
        status: 'received',
        notes: 'short',
      },
    ]);
    expect(Object.keys(rows[0])).toEqual([
      'Boxes ordered',
      'Order date',
      'Expected delivery',
      'Date received',
      'Boxes received',
      'On hand (before)',
      'On hand (after)',
      'Status',
      'Notes',
    ]);
    expect(rows[0].Status).toBe('received');
    expect(rows[0]['Date received']).toBe('11/03/2026');
    expect(rows[0]['Order date']).toBe('01/03/2026');
    expect(rows[1]['Order date']).toBe('01/02/2026');
    expect(rows[1]['Boxes received']).toBe('');
    expect(typeof rows[0]['Boxes received']).toBe('number');
  });
});

describe('buildBumbleBeeSummaryRows', () => {
  it('formats last deploy date and leaves missing average blank', () => {
    const rows = buildBumbleBeeSummaryRows({
      onHand: 3,
      projectedTotal: 5,
      avgBoxesRemovedPerWeek: null,
      lastDeploy: { date: '2026-04-01', fieldName: 'NH05', boxesAdded: 2, boxesRemoved: 1 },
    });
    expect(rows[0]['Last deploy date']).toBe('01/04/2026');
    expect(rows[0]['Last deploy field']).toBe('NH05');
    expect(rows[0]['Avg boxes removed / week']).toBe('');
    expect(rows[0]['Last deploy added']).toBe(2);
  });
});
