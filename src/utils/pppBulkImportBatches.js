/**
 * Send PPP import rows in batches. A failed batch does not abort later batches.
 *
 * @param {object[]} payloads
 * @param {(batch: object[]) => Promise<{ inserted?: number, productsCreated?: number }>} onBulkImport
 * @param {{ batchSize?: number }} [opts]
 */
export async function runBulkImportBatches(payloads, onBulkImport, opts = {}) {
  const batchSize = opts.batchSize || 200;
  const rows = Array.isArray(payloads) ? payloads : [];
  let inserted = 0;
  let productsCreated = 0;
  let failed = 0;
  const errorDetails = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      const result = await onBulkImport(batch);
      inserted += result?.inserted ?? batch.length;
      productsCreated += result?.productsCreated || 0;
    } catch (err) {
      failed += batch.length;
      const start = i + 1;
      const end = i + batch.length;
      errorDetails.push(`Rows ${start}–${end}: ${err?.message || 'Bulk import failed'}`);
    }
  }

  return { inserted, failed, productsCreated, errorDetails };
}
