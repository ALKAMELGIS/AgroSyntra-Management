import {
  displayEcphNumber,
  formatDrainPercent,
  growBagDripHeader,
  hasNumeric,
  inferDripTestCountFromDripperCount,
  resolveCropName,
  resolveDripperCount,
  resolveDripTestCount,
  resolveValveWaterQty,
  resolveWaterBasedOnDrip,
} from '../ecphWaterDisplay';

describe('hasNumeric / displayEcphNumber', () => {
  it('treats 0 as a value and empty as missing', () => {
    expect(hasNumeric(0)).toBe(true);
    expect(hasNumeric('0')).toBe(true);
    expect(hasNumeric('')).toBe(false);
    expect(hasNumeric(null)).toBe(false);
    expect(displayEcphNumber(0)).toBe(0);
    expect(displayEcphNumber('')).toBe('-');
    expect(displayEcphNumber(null)).toBe('-');
  });
});

describe('resolveDripperCount', () => {
  it('prefers stored entry dripperCount over crop lookup', () => {
    expect(resolveDripperCount(
      { dripperCount: '30000' },
      { currentCrop: 'Tomato' },
      { crops: [{ name: 'Tomato', dripper_count: 24000 }] },
    )).toBe(30000);
  });

  it('treats dripperCount 0 as absent', () => {
    expect(resolveDripperCount({ dripperCount: 0 }, {}, null)).toBeNull();
  });
});

describe('resolveDripTestCount / growBagDripHeader', () => {
  it('prefers stored entry dripTestCount without a crop', () => {
    expect(resolveDripTestCount({ dripTestCount: 15 }, {}, null)).toBe(15);
    expect(resolveDripTestCount({ drip_test_count: '12' }, {}, null)).toBe(12);
  });

  it('treats stored dripTestCount 0 as absent', () => {
    expect(resolveDripTestCount({ dripTestCount: 0 }, {}, null)).toBeNull();
  });

  it('uses entry cropName when the field has no currentCrop', () => {
    expect(resolveDripTestCount(
      { cropName: 'Capsicum' },
      {},
      { crops: [{ name: 'Capsicum', drip_test_count: 15 }] },
    )).toBe(15);
  });

  it('looks up drip test count from entry cropId', () => {
    expect(resolveDripTestCount(
      { cropId: 'c-cap' },
      {},
      { crops: [{ id: 'c-cap', name: 'Capsicum', drip_test_count: 15 }] },
    )).toBe(15);
  });

  it('prefers entry crop over the field current crop', () => {
    expect(resolveCropName(
      { cropName: 'Plum Tomato' },
      { currentCrop: 'Capsicum' },
      { crops: [
        { name: 'Capsicum', drip_test_count: 15 },
        { name: 'Plum Tomato', drip_test_count: 12 },
      ] },
    )).toBe('Plum Tomato');
    expect(resolveDripTestCount(
      { cropName: 'Plum Tomato' },
      { currentCrop: 'Capsicum' },
      { crops: [
        { name: 'Capsicum', drip_test_count: 15 },
        { name: 'Plum Tomato', drip_test_count: 12 },
      ] },
    )).toBe(12);
  });

  it('uses field current_crop when currentCrop is empty', () => {
    expect(resolveDripTestCount(
      {},
      { current_crop: 'Capsicum' },
      { crops: [{ name: 'Capsicum', drip_test_count: 15 }] },
    )).toBe(15);
  });

  it('reads drip_test_count from the crop', () => {
    expect(resolveDripTestCount(
      {},
      { currentCrop: 'Capsicum' },
      { crops: [{ name: 'Capsicum', drip_test_count: 15 }] },
    )).toBe(15);
  });

  it('uses a crop object name', () => {
    expect(resolveDripTestCount(
      {},
      { currentCrop: { name: 'Plum Tomato' } },
      { crops: [{ name: 'Plum Tomato', drip_test_count: 12 }] },
    )).toBe(12);
  });

  it('returns null when the crop has no test count', () => {
    expect(resolveDripTestCount(
      {},
      { currentCrop: 'Onion' },
      { crops: [{ name: 'Onion' }] },
    )).toBeNull();
  });

  it('names the column from a single shared test count', () => {
    expect(growBagDripHeader([15, 15])).toBe('15 Drip Volume (ml)');
    expect(growBagDripHeader([12, 15])).toBe('N Drip Volume (ml)');
    expect(growBagDripHeader([null, 0])).toBe('N Drip Volume (ml)');
  });

  it('infers 15 from a stored dripperCount when crop is missing', () => {
    const masterData = {
      crops: [
        { name: 'Capsicum', dripper_count: 30000, drip_test_count: 15 },
        { name: 'Capsicum Orange', dripper_count: 30000, drip_test_count: 15 },
        { name: 'Onion' },
      ],
    };
    expect(resolveDripTestCount({ dripperCount: 30000 }, {}, masterData)).toBe(15);
    expect(inferDripTestCountFromDripperCount(masterData, 30000)).toBe(15);
  });

  it('uses crop history when currentCrop is empty', () => {
    expect(resolveDripperCount(
      {},
      { cropHistory: [{ crop: 'Capsicum', endDate: null }] },
      { crops: [{ name: 'Capsicum', dripper_count: 30000, drip_test_count: 15 }] },
    )).toBe(30000);
  });

  it('does not guess when dripper counts share different test counts', () => {
    expect(inferDripTestCountFromDripperCount({
      crops: [
        { name: 'A', dripper_count: 24000, drip_test_count: 12 },
        { name: 'B', dripper_count: 24000, drip_test_count: 10 },
      ],
    }, 24000)).toBeNull();
  });
});

describe('formatDrainPercent', () => {
  it('turns a 0-1 ratio into a percent label', () => {
    expect(formatDrainPercent(0.27)).toBe('27%');
    expect(formatDrainPercent(0.19)).toBe('19%');
  });

  it('keeps already-percent values and leaves empty blank', () => {
    expect(formatDrainPercent(27)).toBe('27%');
    expect(formatDrainPercent(1.33)).toBe('1.33%');
    expect(formatDrainPercent('')).toBe('');
    expect(formatDrainPercent(null)).toBe('');
  });
});

describe('resolveWaterBasedOnDrip', () => {
  it('uses stored valve value as-is', () => {
    expect(resolveWaterBasedOnDrip({ totalWaterBasedOnDrip: 12.5 }, {}, 30000)).toBe(12.5);
  });

  it('computes from drip volume and dripper count', () => {
    expect(resolveWaterBasedOnDrip({ dripVolume: 10500 }, {}, 30000)).toBe(315);
  });

  it('does not compute when dripperCount is 0', () => {
    expect(resolveWaterBasedOnDrip({ dripVolume: 10500 }, {}, 0)).toBeNull();
  });

  it('does not throw on a null valve', () => {
    expect(resolveWaterBasedOnDrip(null, {}, 30000)).toBeNull();
  });
});

describe('resolveValveWaterQty', () => {
  it('uses valve totalWaterQty including 0', () => {
    expect(resolveValveWaterQty({ totalWaterQty: 0 }, { totalWaterQty: 39.6 })).toBe(0);
  });

  it('uses qty × cycle before field total', () => {
    expect(resolveValveWaterQty(
      { qtyOfWater: 4.5, cycle: 12 },
      { totalWaterQty: 39.6 },
    )).toBe(54);
  });

  it('uses field total only on the first valve when no valve has its own water', () => {
    const valves = [{ ecIn: 0.3 }, { ecIn: 0.29 }];
    expect(resolveValveWaterQty(valves[0], { totalWaterQty: 39.6 }, {
      valveIndex: 0,
      valves,
    })).toBe(39.6);
    expect(resolveValveWaterQty(valves[1], { totalWaterQty: 39.6 }, {
      valveIndex: 1,
      valves,
    })).toBeNull();
  });

  it('does not throw on a null valve', () => {
    expect(resolveValveWaterQty(null, { totalWaterQty: 10 }, { valveIndex: 1 })).toBeNull();
  });
});
