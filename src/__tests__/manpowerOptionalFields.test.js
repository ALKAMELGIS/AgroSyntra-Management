import {

  isMissingActivity,

  isMissingTarget,

  isMissingActual,

  isMissingHours,

  blockIsBlank,

  blockMeetsRequiredFields,

  getBlockValidationError,

  getBlockMandatoryErrors,

  formatOptionalHours,

  importRowIsBlank,

  importRowMeetsRequiredFields,

} from '../utils/manpowerOptionalFields';



describe('manpowerOptionalFields', () => {

  describe('isMissingActivity', () => {

    it('treats empty and whitespace as missing', () => {

      expect(isMissingActivity('')).toBe(true);

      expect(isMissingActivity('  ')).toBe(true);

      expect(isMissingActivity(null)).toBe(true);

    });

    it('treats non-empty as present', () => {

      expect(isMissingActivity('Harvesting')).toBe(false);

    });

  });



  describe('isMissingTarget / isMissingActual', () => {

    it('zero is not missing', () => {

      expect(isMissingTarget(0)).toBe(false);

      expect(isMissingActual(0)).toBe(false);

      expect(isMissingTarget('0')).toBe(false);

    });

    it('empty is missing', () => {

      expect(isMissingTarget('')).toBe(true);

      expect(isMissingActual(null)).toBe(true);

    });

  });



  describe('isMissingHours', () => {

    it('uses work_hours when set', () => {

      expect(isMissingHours({ work_hours: 5 })).toBe(false);

    });

    it('computes from start/end when work_hours absent', () => {

      expect(isMissingHours({ start_time: '08:00', end_time: '12:00' })).toBe(false);

    });

    it('missing when no times or hours', () => {

      expect(isMissingHours({})).toBe(true);

      expect(isMissingHours({ start_time: '08:00' })).toBe(true);

    });

  });



  describe('formatOptionalHours', () => {

    it('returns null when missing', () => {

      expect(formatOptionalHours({})).toBe(null);

    });

    it('returns work_hours number', () => {

      expect(formatOptionalHours({ work_hours: 4.5 })).toBe(4.5);

    });

  });



  describe('blockIsBlank', () => {

    it('false when only location set', () => {

      expect(blockIsBlank({ location: 'GH-01' })).toBe(false);

    });

    it('true when all empty', () => {

      expect(blockIsBlank(createEmpty())).toBe(true);

    });

  });



  describe('blockMeetsRequiredFields', () => {

    it('passes with mandatory fields and no activity', () => {

      expect(blockMeetsRequiredFields(validBlock())).toBe(true);

    });

    it('fails when location missing', () => {

      expect(blockMeetsRequiredFields({ ...validBlock(), location: '' })).toBe(false);

    });

    it('fails when activity set without unit', () => {

      expect(blockMeetsRequiredFields({

        ...validBlock(),

        activity: 'Harvest',

        unit: '',

      })).toBe(false);

    });

    it('passes when activity and unit set', () => {

      expect(blockMeetsRequiredFields({

        ...validBlock(),

        activity: 'Harvest',

        unit: 'kg',

      })).toBe(true);

    });

    it('location alone does not pass', () => {

      expect(blockMeetsRequiredFields({ location: 'GH-01' })).toBe(false);

    });

  });



  describe('getBlockValidationError', () => {

    it('names missing location', () => {

      expect(getBlockValidationError({ ...validBlock(), location: '' })).toMatch(/Location/i);

    });

  });



  describe('getBlockMandatoryErrors', () => {
    it('returns location error on partial block', () => {
      const errs = getBlockMandatoryErrors({ ...validBlock(), location: '' });
      expect(errs.location).toBe('Required');
    });
    it('returns empty for blank block', () => {
      expect(getBlockMandatoryErrors(createEmpty())).toEqual({});
    });
    it('force returns errors even when block would be blank', () => {
      const errs = getBlockMandatoryErrors(createEmpty(), { force: true });
      expect(errs.location).toBe('Required');
    });
  });

  describe('importRowMeetsRequiredFields', () => {

    it('skips blank import columns', () => {

      const row = Array(14).fill('');

      expect(importRowIsBlank(row, 4)).toBe(true);

      expect(importRowMeetsRequiredFields(row, 4)).toBe(false);

    });

    it('accepts full mandatory import row', () => {

      const row = Array(14).fill('');

      row[4] = '';

      row[5] = '';

      row[6] = 'Sven RZ';

      row[7] = 'GH-01';

      row[8] = 'V1';

      row[9] = '07:00';

      row[10] = '12:00';

      expect(importRowMeetsRequiredFields(row, 4)).toBe(true);

    });

  });

});



function createEmpty() {

  return {

    activity: '',

    location: '',

    section: '',

    startTime: '',

    endTime: '',

    target: '',

    actual: '',

    unit: '',

    variety: '',

  };

}



function validBlock() {

  return {

    activity: '',

    unit: '',

    location: 'GH-01',

    section: 'V1',

    variety: 'Sven RZ',

    startTime: '07:00',

    endTime: '12:00',

    target: '',

    actual: '',

  };

}


