import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { logger } from '../../utils/logger';
import { config } from '../../config';

const execAsync = promisify(exec);

const BUCKET = process.env.BACKUP_S3_BUCKET || '';
const REGION = process.env.AWS_REGION || process.env.BACKUP_S3_REGION || 'auto';
const ENDPOINT = process.env.BACKUP_S3_ENDPOINT || process.env.S3_ENDPOINT || '';
const FORCE_PATH_STYLE =
  (process.env.BACKUP_S3_FORCE_PATH_STYLE || process.env.S3_FORCE_PATH_STYLE || '')
    .toLowerCase() === 'true';
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);

function buildS3Client(): S3Client {
  return new S3Client({
    region: REGION,
    ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
    ...(FORCE_PATH_STYLE ? { forcePathStyle: true } : {}),
  });
}

export async function runDatabaseBackup(): Promise<string | null> {
  if (!BUCKET) {
    logger.info('BACKUP_S3_BUCKET not set, skipping backup');
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `almahafarm-backup-${timestamp}.sql.gz`;

  try {
    logger.info({ filename }, 'Starting database backup');

    const { stdout } = await execAsync(
      `pg_dump "${config.database.url}" | gzip`,
      { maxBuffer: 512 * 1024 * 1024 },
    );

    const s3 = buildS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `backups/${filename}`,
      Body: Buffer.from(stdout, 'binary'),
      ContentType: 'application/gzip',
    }));

    logger.info({ filename, bucket: BUCKET }, 'Database backup uploaded to S3');

    await cleanOldBackups(s3);

    return filename;
  } catch (err: any) {
    logger.error({ error: err.message }, 'Database backup failed');
    throw err;
  }
}

async function cleanOldBackups(s3: S3Client): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'backups/',
    }));

    const toDelete = (list.Contents || [])
      .filter((obj) => obj.LastModified && obj.LastModified < cutoff)
      .map((obj) => ({ Key: obj.Key! }));

    if (toDelete.length > 0) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: toDelete },
      }));
      logger.info({ count: toDelete.length }, 'Cleaned old backups');
    }
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Failed to clean old backups');
  }
}
