import { findCropIdByNameInMasterData } from '../utils/manpowerSiteRowOrder';

describe('findCropIdByNameInMasterData', () => {
  const catalogId = 'crop-catalog';
  const farmAreaId = 'crop-farm-area';
  const masterData = {
    crops: [{ id: catalogId, name: 'Capsicum Red' }],
    countries: [{
      sites: [{
        id: 'site-1',
        farmAreas: [{ crops: [{ id: farmAreaId, name: 'Tomato Plum' }] }],
      }],
    }],
  };

  it('finds a catalog crop that is not on the farm-area list', () => {
    expect(findCropIdByNameInMasterData(masterData, 'capsicum red', 'site-1')).toBe(catalogId);
  });

  it('falls back to farm-area crops', () => {
    expect(findCropIdByNameInMasterData(masterData, 'Tomato Plum', 'site-1')).toBe(farmAreaId);
  });
});
