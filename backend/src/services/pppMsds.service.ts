import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import { matchFilenameToProducts, ProductRef } from '../utils/pppMsdsMatch';
import { extractPdfsFromZipBuffer } from './pppMsdsZip';
import { deleteFile, readStoredFile, uploadFile } from './storage.service';
import { listActivePesticideProducts } from './ipm.service';

export const PPP_MSDS_ENTITY = 'ipm_gap_ppp_pdf';
export const PPP_MSDS_STAGING_ENTITY = 'ipm_gap_ppp_staging';

type StagingAssignment = {
  stagingId: string;
  productId: string | null;
};

function asProductRefs(products: Array<{ id: string; name: string }>): ProductRef[] {
  return products.map((p) => ({ id: p.id, name: p.name }));
}

async function productIdsInOrg(organizationId: string): Promise<Set<string>> {
  const products = await listActivePesticideProducts(organizationId);
  return new Set(products.map((p) => p.id));
}

async function insertAttachment(params: {
  entity: string;
  entityId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploaded: { filename: string; url: string; storageKey: string };
  uploadedBy: string;
}): Promise<any> {
  const result = await dbPool.query(
    `INSERT INTO attachments (
       entity, entity_id, filename, original_name, mime_type, size_bytes, url, storage_key, uploaded_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, entity, entity_id, original_name, size_bytes, created_at`,
    [
      params.entity,
      params.entityId,
      params.uploaded.filename,
      params.originalName,
      params.mimeType,
      params.sizeBytes,
      params.uploaded.url,
      params.uploaded.storageKey,
      params.uploadedBy,
    ],
  );
  return result.rows[0];
}

async function deleteAttachmentRow(row: { id: string; storage_key: string }): Promise<void> {
  await deleteFile(row.storage_key);
  await dbPool.query('DELETE FROM attachments WHERE id = $1', [row.id]);
}

async function clearUserStaging(uploadedBy: string): Promise<void> {
  const existing = await dbPool.query(
    `SELECT id, storage_key FROM attachments WHERE entity = $1 AND uploaded_by = $2`,
    [PPP_MSDS_STAGING_ENTITY, uploadedBy],
  );
  for (const row of existing.rows) {
    await deleteAttachmentRow(row);
  }
}

export async function listPppMsds(organizationId: string) {
  const products = await listActivePesticideProducts(organizationId);
  if (products.length === 0) return { products: [] };

  const ids = products.map((p) => p.id);
  const pdfs = await dbPool.query(
    `SELECT id, entity_id, original_name, size_bytes, created_at
     FROM attachments
     WHERE entity = $1 AND entity_id = ANY($2::uuid[])
     ORDER BY original_name`,
    [PPP_MSDS_ENTITY, ids],
  );

  const byProduct = new Map<string, any[]>();
  for (const row of pdfs.rows) {
    const list = byProduct.get(row.entity_id) || [];
    list.push({
      id: row.id,
      original_name: row.original_name,
      size_bytes: row.size_bytes,
      created_at: row.created_at,
    });
    byProduct.set(row.entity_id, list);
  }

  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      active_ingredient: p.active_ingredient,
      pdfs: byProduct.get(p.id) || [],
    })),
  };
}

export async function importZip(params: {
  organizationId: string;
  uploadedBy: string;
  zipBuffer: Buffer;
}) {
  const { files, skipped } = extractPdfsFromZipBuffer(params.zipBuffer);
  if (files.length === 0) {
    throw new AppError('No PDF files found in the zip', 'NO_PDFS', 400, { skipped });
  }

  const products = asProductRefs(await listActivePesticideProducts(params.organizationId));
  await clearUserStaging(params.uploadedBy);

  const batchIdResult = await dbPool.query('SELECT gen_random_uuid() AS id');
  const batchId: string = batchIdResult.rows[0].id;

  const preview = [];
  for (const file of files) {
    const uploaded = await uploadFile(file.buffer, file.filename, 'application/pdf', PPP_MSDS_STAGING_ENTITY);
    const row = await insertAttachment({
      entity: PPP_MSDS_STAGING_ENTITY,
      entityId: batchId,
      originalName: file.filename,
      mimeType: 'application/pdf',
      sizeBytes: file.buffer.length,
      uploaded,
      uploadedBy: params.uploadedBy,
    });
    const match = matchFilenameToProducts(file.filename, products);
    preview.push({
      stagingId: row.id,
      filename: file.filename,
      status: match.status,
      suggestedProductId: match.productId,
      suggestedProductName: match.productName,
    });
  }

  return { batchId, files: preview, skipped };
}

export async function confirmImport(params: {
  organizationId: string;
  uploadedBy: string;
  batchId: string;
  assignments: StagingAssignment[];
}) {
  const allowedProducts = await productIdsInOrg(params.organizationId);
  const staged = await dbPool.query(
    `SELECT id, storage_key, original_name, mime_type, size_bytes, url, filename, uploaded_by
     FROM attachments
     WHERE entity = $1 AND entity_id = $2 AND uploaded_by = $3`,
    [PPP_MSDS_STAGING_ENTITY, params.batchId, params.uploadedBy],
  );
  if (staged.rows.length === 0) {
    throw new NotFoundError('Import batch not found. Upload the zip again.');
  }

  const byId = new Map(staged.rows.map((row) => [row.id, row]));
  const assignedIds = new Set<string>();
  let saved = 0;
  let skipped = 0;

  for (const assignment of params.assignments) {
    const row = byId.get(assignment.stagingId);
    if (!row) {
      throw new AppError('A file in this import is missing. Upload the zip again.', 'STALE_IMPORT', 400);
    }
    assignedIds.add(assignment.stagingId);

    if (!assignment.productId) {
      await deleteAttachmentRow(row);
      skipped += 1;
      continue;
    }
    if (!allowedProducts.has(assignment.productId)) {
      throw new AppError('One of the selected products is not in your catalog', 'INVALID_PRODUCT', 400);
    }

    await dbPool.query(
      `UPDATE attachments SET entity = $1, entity_id = $2 WHERE id = $3`,
      [PPP_MSDS_ENTITY, assignment.productId, row.id],
    );
    saved += 1;
  }

  for (const row of staged.rows) {
    if (!assignedIds.has(row.id)) {
      await deleteAttachmentRow(row);
      skipped += 1;
    }
  }

  return { saved, skipped };
}

export async function addProductPdf(params: {
  organizationId: string;
  uploadedBy: string;
  productId: string;
  originalName: string;
  buffer: Buffer;
  mimeType: string;
}) {
  const allowedProducts = await productIdsInOrg(params.organizationId);
  if (!allowedProducts.has(params.productId)) {
    throw new NotFoundError('Product not found');
  }
  if (!params.buffer.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
    throw new AppError('Only PDF files can be attached', 'INVALID_FILE', 400);
  }

  const uploaded = await uploadFile(params.buffer, params.originalName, 'application/pdf', PPP_MSDS_ENTITY);
  return insertAttachment({
    entity: PPP_MSDS_ENTITY,
    entityId: params.productId,
    originalName: params.originalName,
    mimeType: 'application/pdf',
    sizeBytes: params.buffer.length,
    uploaded,
    uploadedBy: params.uploadedBy,
  });
}

export async function getOrgPdfAttachment(organizationId: string, attachmentId: string) {
  const allowedProducts = await productIdsInOrg(organizationId);
  const result = await dbPool.query(
    `SELECT a.*, pp.name AS product_name, pp.active_ingredient
     FROM attachments a
     JOIN pesticide_products pp ON pp.id = a.entity_id
     WHERE a.id = $1 AND a.entity = $2`,
    [attachmentId, PPP_MSDS_ENTITY],
  );
  const row = result.rows[0];
  if (!row || !allowedProducts.has(row.entity_id)) {
    throw new NotFoundError('PDF not found');
  }
  return row;
}

export async function streamOrgPdf(organizationId: string, attachmentId: string) {
  const attachment = await getOrgPdfAttachment(organizationId, attachmentId);
  const stored = await readStoredFile(attachment.storage_key);
  if (!stored) {
    throw new NotFoundError('PDF file is missing from storage');
  }
  return {
    content: stored.content,
    mimeType: stored.mimeType || attachment.mime_type || 'application/pdf',
    originalName: attachment.original_name as string,
  };
}

export async function deleteOrgPdf(organizationId: string, attachmentId: string) {
  const attachment = await getOrgPdfAttachment(organizationId, attachmentId);
  await deleteAttachmentRow(attachment);
  return { id: attachmentId };
}
