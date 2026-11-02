import AdmZip from 'adm-zip';
import { matchFilenameToProducts, normalizeMsdsText } from '../pppMsdsMatch';
import { extractPdfsFromZipBuffer } from '../../services/pppMsdsZip';

const products = [
  { id: '1', name: 'Acaristop' },
  { id: '2', name: 'Actara' },
  { id: '3', name: 'Corgaen' },
  { id: '4', name: 'Decis Expert' },
  { id: '5', name: 'Decis' },
  { id: '6', name: 'Oberon' },
  { id: '7', name: 'Oberon Speed' },
  { id: '8', name: 'Anvir' },
  { id: '9', name: 'Microkill' },
  { id: '10', name: 'Agri-Flex' },
];

describe('normalizeMsdsText', () => {
  it('strips MSDS noise and punctuation', () => {
    expect(normalizeMsdsText('Coragen MSDS.pdf')).toBe('coragen');
    expect(normalizeMsdsText('Coragen_E_MSDS.pdf')).toBe('coragen');
    expect(normalizeMsdsText('MSDS - ANVIR - Tayebat.pdf')).toBe('anvir tayebat');
    expect(normalizeMsdsText('ACARISTOP-50-SC-MSDS.pdf')).toBe('acaristop');
  });
});

describe('matchFilenameToProducts', () => {
  it('matches Coragen files to a close catalog spelling', () => {
    const a = matchFilenameToProducts('Coragen MSDS.pdf', products);
    const b = matchFilenameToProducts('Coragen_E_MSDS.pdf', products);
    expect(a.productName).toBe('Corgaen');
    expect(b.productName).toBe('Corgaen');
    expect(a.status).not.toBe('unmatched');
    expect(b.status).not.toBe('unmatched');
  });

  it('lets two files map to the same product', () => {
    const a = matchFilenameToProducts('Coragen MSDS.pdf', products);
    const b = matchFilenameToProducts('Coragen_E_MSDS.pdf', products);
    expect(a.productId).toBe(b.productId);
  });

  it('prefers the longer product name when both would match', () => {
    const expert = matchFilenameToProducts('MSDS - DECIS Expert 1.pdf', products);
    expect(expert.productName).toBe('Decis Expert');
    const speed = matchFilenameToProducts('Oberon_Speed_MSDS.PDF', products);
    expect(speed.productName).toBe('Oberon Speed');
  });

  it('matches names buried in extra words', () => {
    expect(matchFilenameToProducts('MSDS - ANVIR - Tayebat.pdf', products).productName).toBe('Anvir');
    expect(matchFilenameToProducts('New MSDS of MICROKILL.pdf', products).productName).toBe('Microkill');
    expect(matchFilenameToProducts('Actara25WG.pdf', products).productName).toBe('Actara');
    expect(matchFilenameToProducts(
      'Agri-Flex - All Data, Al Mubarak, Syngenta, 25.03.2017.pdf',
      products,
    ).productName).toBe('Agri-Flex');
    expect(matchFilenameToProducts('ACARISTOP-50-SC-MSDS.pdf', products).productName).toBe('Acaristop');
  });

  it('returns unmatched when nothing is close', () => {
    const miss = matchFilenameToProducts('Totally Unknown Product MSDS.pdf', products);
    expect(miss).toEqual({ status: 'unmatched', productId: null, productName: null });
  });
});

describe('extractPdfsFromZipBuffer', () => {
  it('keeps PDFs and skips other files', () => {
    const zip = new AdmZip();
    zip.addFile('PPP/Coragen MSDS.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('x')]));
    zip.addFile('PPP/Siltac msds.docx', Buffer.from('not a pdf'));
    zip.addFile('PPP/notes.txt', Buffer.from('hello'));
    const { files, skipped } = extractPdfsFromZipBuffer(zip.toBuffer());
    expect(files.map((f) => f.filename)).toEqual(['Coragen MSDS.pdf']);
    expect(skipped.map((s) => s.filename).sort()).toEqual(['Siltac msds.docx', 'notes.txt']);
  });
});
