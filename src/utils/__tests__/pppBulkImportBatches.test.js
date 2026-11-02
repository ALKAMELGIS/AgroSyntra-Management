import { runBulkImportBatches } from '../pppBulkImportBatches';

describe('runBulkImportBatches', () => {
  it('continues after a failed batch and counts only unsent rows as failed', async () => {
    const payloads = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    const onBulkImport = jest.fn(async (batch) => {
      if (batch[0].id === 3) throw new Error('invalid input syntax for type date');
      return { inserted: batch.length, productsCreated: 0 };
    });

    const result = await runBulkImportBatches(payloads, onBulkImport, { batchSize: 2 });

    expect(onBulkImport).toHaveBeenCalledTimes(3);
    expect(result.inserted).toBe(3);
    expect(result.failed).toBe(2);
    expect(result.errorDetails).toEqual(['Rows 3–4: invalid input syntax for type date']);
  });
});
