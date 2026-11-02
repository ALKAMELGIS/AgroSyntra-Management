import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { dbPool } from '../db/client';

interface StorageConfig {
  /**
   * 'local' — files written under localDir (lost on Railway redeploy).
   * 's3'   — any S3-compatible service (AWS, R2, B2, MinIO).
   * 'db'   — content stored as BYTEA in Postgres. Simplest durable option
   *          for a prototype without any object-storage account.
   */
  provider: 'local' | 's3' | 'db';
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  /**
   * Optional custom endpoint. Set this for S3-compatible providers such as
   * Cloudflare R2 (https://<accountid>.r2.cloudflarestorage.com),
   * Backblaze B2 or MinIO. Leave unset for AWS S3 proper.
   */
  s3Endpoint?: string;
  /**
   * Use path-style addressing (bucket in the URL path, not subdomain).
   * Required by Cloudflare R2 and MinIO.
   */
  s3ForcePathStyle?: boolean;
  /**
   * Public base URL for objects when using a provider that exposes a
   * static bucket URL. For R2 with a custom domain you'd set this to
   * e.g. https://files.example.com. Leave unset to use signed URLs.
   */
  s3PublicUrl?: string;
  localDir?: string;
  publicUrl?: string; // base URL for serving local files
}

interface UploadResult {
  url: string;
  storageKey: string;
  filename: string;
}

const config: StorageConfig = {
  provider: (process.env.STORAGE_PROVIDER as 'local' | 's3' | 'db') || 'local',
  s3Bucket: process.env.S3_BUCKET,
  s3Region: process.env.S3_REGION || 'auto',
  s3AccessKey: process.env.S3_ACCESS_KEY,
  s3SecretKey: process.env.S3_SECRET_KEY,
  s3Endpoint: process.env.S3_ENDPOINT || undefined,
  s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true',
  s3PublicUrl: process.env.S3_PUBLIC_URL || undefined,
  localDir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3001',
};

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.s3Region,
      credentials: {
        accessKeyId: config.s3AccessKey || '',
        secretAccessKey: config.s3SecretKey || '',
      },
      // Custom endpoint for R2 / B2 / MinIO / any S3-compatible provider.
      ...(config.s3Endpoint ? { endpoint: config.s3Endpoint } : {}),
      ...(config.s3ForcePathStyle ? { forcePathStyle: true } : {}),
    });
  }
  return s3Client;
}

function generateKey(entity: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const hash = crypto.randomBytes(16).toString('hex');
  const date = new Date().toISOString().split('T')[0];
  return `${entity}/${date}/${hash}${ext}`;
}

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  entity: string
): Promise<UploadResult> {
  const key = generateKey(entity, originalName);

  if (config.provider === 's3') {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    // Prefer an operator-supplied public URL (e.g. R2 custom domain),
    // then fall back to the S3 endpoint, then the AWS default host.
    let url: string;
    if (config.s3PublicUrl) {
      url = `${config.s3PublicUrl.replace(/\/+$/, '')}/${key}`;
    } else if (config.s3Endpoint) {
      const endpoint = config.s3Endpoint.replace(/\/+$/, '');
      url = config.s3ForcePathStyle
        ? `${endpoint}/${config.s3Bucket}/${key}`
        : `${endpoint}/${key}`; // virtual-host style with custom endpoint is uncommon
    } else {
      url = `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com/${key}`;
    }
    return { url, storageKey: key, filename: path.basename(key) };
  }

  if (config.provider === 'db') {
    // Persist bytes directly in Postgres. storage_key looks like
    // "db:<uuid>" so deleteFile / readBlob can find the row later,
    // and the public url is served through /api/v1/files/:id.
    const inserted = await dbPool.query(
      `INSERT INTO file_blobs (content, mime_type, size_bytes)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [buffer, mimeType, buffer.length],
    );
    const id: string = inserted.rows[0].id;
    const apiBase = process.env.PUBLIC_URL || '';
    const url = `${apiBase.replace(/\/+$/, '')}/api/v1/files/${id}`;
    return {
      url,
      storageKey: `db:${id}`,
      filename: path.basename(originalName),
    };
  }

  // Local filesystem fallback
  const dir = path.join(config.localDir!, path.dirname(key));
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(config.localDir!, key);
  await fs.writeFile(filePath, buffer);
  const url = `${config.publicUrl}/uploads/${key}`;
  return { url, storageKey: key, filename: path.basename(key) };
}

export async function deleteFile(storageKey: string): Promise<void> {
  if (storageKey.startsWith('db:')) {
    const id = storageKey.slice(3);
    try {
      await dbPool.query(`DELETE FROM file_blobs WHERE id = $1`, [id]);
    } catch {
      // Already gone — nothing to do.
    }
    return;
  }

  if (config.provider === 's3') {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: storageKey })
    );
    return;
  }

  // Local
  const filePath = path.join(config.localDir!, storageKey);
  try {
    await fs.unlink(filePath);
  } catch {
    // File may already be deleted
  }
}

/**
 * Load a blob's content from Postgres. Returns null if the id is unknown.
 * Used by the GET /files/:id route when STORAGE_PROVIDER=db.
 */
export async function readBlob(
  id: string,
): Promise<{ content: Buffer; mimeType: string; sizeBytes: number } | null> {
  const result = await dbPool.query(
    `SELECT content, mime_type, size_bytes FROM file_blobs WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    content: row.content as Buffer,
    mimeType: row.mime_type as string,
    sizeBytes: row.size_bytes as number,
  };
}

/**
 * Load stored bytes for streaming through an authenticated API route.
 * Returns null when the key is missing or not readable.
 */
export async function readStoredFile(
  storageKey: string,
): Promise<{ content: Buffer; mimeType?: string } | null> {
  if (!storageKey || storageKey.includes('..')) return null;

  if (storageKey.startsWith('db:')) {
    const blob = await readBlob(storageKey.slice(3));
    if (!blob) return null;
    return { content: blob.content, mimeType: blob.mimeType };
  }

  if (config.provider === 's3') {
    try {
      const client = getS3Client();
      const resp = await client.send(
        new GetObjectCommand({ Bucket: config.s3Bucket, Key: storageKey }),
      );
      const bytes = await resp.Body?.transformToByteArray();
      if (!bytes) return null;
      return { content: Buffer.from(bytes), mimeType: resp.ContentType };
    } catch {
      return null;
    }
  }

  try {
    const filePath = path.join(config.localDir!, storageKey);
    const content = await fs.readFile(filePath);
    return { content };
  } catch {
    return null;
  }
}

export async function getSignedDownloadUrl(storageKey: string): Promise<string> {
  if (storageKey.startsWith('db:')) {
    const apiBase = process.env.PUBLIC_URL || '';
    return `${apiBase.replace(/\/+$/, '')}/api/v1/files/${storageKey.slice(3)}`;
  }
  if (config.provider === 's3') {
    const client = getS3Client();
    const command = new GetObjectCommand({ Bucket: config.s3Bucket, Key: storageKey });
    return getSignedUrl(client, command, { expiresIn: 3600 });
  }
  return `${config.publicUrl}/uploads/${storageKey}`;
}

/**
 * Which provider is currently active. Exposed so the API can report it
 * on the observability endpoint (storage.persistent).
 */
export function getActiveProvider(): 'local' | 's3' | 'db' {
  return config.provider;
}
