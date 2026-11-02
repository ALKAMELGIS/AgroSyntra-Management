import { computeBumbleBeeSummary, formatLastDeployDate } from '../bumbleBeeSummary';

describe('computeBumbleBeeSummary', () => {
  const asOf = '2026-08-04';
  const inventory = { quantityOnHand: 10, projectedTotal: 25 };

  it('derives on hand and projected from inventory', () => {
    const summary = computeBumbleBeeSummary([], inventory, asOf);
    expect(summary.onHand).toBe(10);
    expect(summary.projectedTotal).toBe(25);
    expect(summary.avgBoxesRemovedPerWeek).toBeNull();
    expect(summary.lastDeploy).toBeNull();
  });

  it('computes 28-day removal average as total removed / 4', () => {
    const deployments = [
      { date_placed: '2026-08-01', boxes_removed: 4, created_at: '2026-08-01T10:00:00Z' },
      { date_placed: '2026-07-20', boxes_removed: 8, created_at: '2026-07-20T10:00:00Z' },
      { date_placed: '2026-06-01', boxes_removed: 100, created_at: '2026-06-01T10:00:00Z' },
    ];
    const summary = computeBumbleBeeSummary(deployments, inventory, asOf);
    expect(summary.avgBoxesRemovedPerWeek).toBe(3);
  });

  it('picks newest deployment by date_placed then created_at', () => {
    const deployments = [
      {
        date_placed: '2026-08-02',
        field_name: 'GH-A',
        boxes_added: 2,
        boxes_removed: 1,
        created_at: '2026-08-02T12:00:00Z',
      },
      {
        date_placed: '2026-08-04',
        field_name: 'GH-B',
        boxes_added: 5,
        boxes_removed: 0,
        created_at: '2026-08-04T08:00:00Z',
      },
    ];
    const summary = computeBumbleBeeSummary(deployments, inventory, asOf);
    expect(summary.lastDeploy.fieldName).toBe('GH-B');
    expect(summary.lastDeploy.boxesAdded).toBe(5);
    expect(formatLastDeployDate(summary.lastDeploy.date)).toMatch(/2026/);
  });
});
