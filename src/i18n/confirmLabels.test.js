import { translateUi } from './pageLabels';

test('confirm dialog texts read in Arabic', () => {
  expect(translateUi('Please confirm')).toBe('يرجى التأكيد');
  expect(translateUi('Delete this record?')).toBe('حذف هذا السجل؟');
  expect(translateUi('Delete 3 selected work order(s)?')).toBe('حذف 3 من العناصر المحددة؟');
  expect(translateUi('Delete 2 selected scouting report(s)? This cannot be undone.')).toBe('حذف 2 من العناصر المحددة؟ لا يمكن التراجع عن ذلك.');
  expect(translateUi('Delete 4 harvest records?')).toBe('حذف 4 من السجلات؟');
  expect(translateUi('Delete "GH-01"?')).toBe('حذف "GH-01"؟');
  expect(translateUi('Deactivate "سماد NPK"? It disappears from the list; its history is kept.')).toBe('إيقاف "سماد NPK"؟ سيختفي من القائمة ويبقى سجله محفوظًا.');
  expect(translateUi('Column 2 needs a label')).toBe('العمود 2 يحتاج عنوانًا');
});
