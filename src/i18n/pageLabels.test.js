import { translateUi } from './pageLabels';
import { enableAutoTranslate, disableAutoTranslate } from './autoTranslate';

describe('translateUi', () => {
  it('translates exact interface words and keeps surrounding spaces', () => {
    expect(translateUi('Cancel')).toBe('إلغاء');
    expect(translateUi(' Save ')).toBe(' حفظ ');
    expect(translateUi('Harvest Dashboard')).toBe('لوحة الحصاد'); // shell label fallback
  });
  it('keeps required markers and colons', () => {
    expect(translateUi('Date *')).toBe('التاريخ *');
    expect(translateUi('Notes:')).toBe('ملاحظات:');
  });
  it('handles toast sentences with a subject', () => {
    expect(translateUi('Field saved successfully!')).toBe('تم حفظ الحقل بنجاح');
    expect(translateUi('Worker added')).toBe('تمت إضافة العامل');
    expect(translateUi('Failed to load fields')).toBe('تعذر تحميل الحقل');
    expect(translateUi('Failed to save: timeout')).toBe('تعذر حفظ: timeout');
  });
  it('handles counts', () => {
    expect(translateUi('12 rows')).toBe('12 صف');
    expect(translateUi('0 rows (0 records)')).toBe('0 صف (0 سجل)');
    expect(translateUi('Sites (3)')).toBe('المواقع (3)');
  });
  it('leaves unknown text (names, data) alone', () => {
    expect(translateUi('North Block A')).toBeNull();
    expect(translateUi('GH-01')).toBeNull();
    expect(translateUi('Failed to save the gizmo')).toBeNull();
  });
});

describe('auto translate', () => {
  it('translates page text, skips inputs and restores English', async () => {
    document.body.innerHTML = '<main><button>Save</button><span data-no-translate>Save</span><input placeholder="Search..." value="Save"/><p>North Block A</p></main>';
    enableAutoTranslate();
    expect(document.querySelector('button').textContent).toBe('حفظ');
    expect(document.querySelector('span').textContent).toBe('Save');
    expect(document.querySelector('input').getAttribute('placeholder')).toBe('بحث…');
    expect(document.querySelector('input').value).toBe('Save');
    expect(document.querySelector('p').textContent).toBe('North Block A');
    const b = document.createElement('b'); b.textContent = 'Cancel'; document.body.appendChild(b);
    await new Promise((r) => setTimeout(r, 0));
    expect(b.textContent).toBe('إلغاء');
    disableAutoTranslate();
    expect(document.querySelector('button').textContent).toBe('Save');
    expect(b.textContent).toBe('Cancel');
  });
});

describe('report sentences', () => {
  it('translates interpretation lines with their numbers', () => {
    expect(translateUi('8 fertigation application(s) across 8 field(s), totalling 0.0 m³ water and 0 kg fertilizer.')).toBe('8 عملية تسميد في 8 حقل، بإجمالي 0.0 م³ مياه و0 كجم سماد.');
    expect(translateUi('3 items below minimum stock level')).toBe('3 صنف أقل من الحد الأدنى للمخزون');
  });
});
