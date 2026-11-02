import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateHarvestReport, downloadPDF } from '../utils/pdfExport';

jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => jest.fn());

function createMockDoc() {
  return {
    setFontSize: jest.fn(),
    setTextColor: jest.fn(),
    setFont: jest.fn(),
    setPage: jest.fn(),
    text: jest.fn(),
    addPage: jest.fn(),
    save: jest.fn(),
    internal: {
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
      getNumberOfPages: () => 1,
    },
  };
}

describe('pdfExport', () => {
  let mockDoc;

  beforeEach(() => {
    // react-scripts turns on resetMocks, which strips the implementation from
    // every mock before each test, so both modules are rewired here.
    mockDoc = createMockDoc();
    jsPDF.mockImplementation(() => mockDoc);
    autoTable.mockReturnValue(undefined);
  });

  it('saves under the filename it is given', () => {
    const doc = generateHarvestReport([
      { date: '2026-08-01', fieldName: 'Field A', quantity: 100 },
    ]);
    downloadPDF(doc, 'harvest-report.pdf');

    expect(mockDoc.save).toHaveBeenCalledWith('harvest-report.pdf');
  });

  it('sets the report title on the document', () => {
    generateHarvestReport([], { title: 'Test Report' });

    expect(mockDoc.text).toHaveBeenCalledWith(
      'Test Report',
      expect.any(Number),
      expect.any(Number),
      expect.anything(),
    );
  });

  it('handles empty data gracefully', () => {
    expect(() => generateHarvestReport([])).not.toThrow();
  });
});
