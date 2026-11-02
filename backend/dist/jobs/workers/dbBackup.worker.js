"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDatabaseBackup = runDatabaseBackup;
const child_process_1 = require("child_process");
const util_1 = require("util");
const client_s3_1 = require("@aws-sdk/client-s3");
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const BUCKET = process.env.BACKUP_S3_BUCKET || '';
const REGION = process.env.AWS_REGION || process.env.BACKUP_S3_REGION || 'auto';
const ENDPOINT = process.env.BACKUP_S3_ENDPOINT || process.env.S3_ENDPOINT || '';
const FORCE_PATH_STYLE = (process.env.BACKUP_S3_FORCE_PATH_STYLE || process.env.S3_FORCE_PATH_STYLE || '')
    .toLowerCase() === 'true';
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
function buildS3Client() {
    return new client_s3_1.S3Client({
        region: REGION,
        ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
        ...(FORCE_PATH_STYLE ? { forcePathStyle: true } : {}),
    });
}
async function runDatabaseBackup() {
    if (!BUCKET) {
        logger_1.logger.info('BACKUP_S3_BUCKET not set, skipping backup');
        return null;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `almahafarm-backup-${timestamp}.sql.gz`;
    try {
        logger_1.logger.info({ filename }, 'Starting database backup');
        const { stdout } = await execAsync(`pg_dump "${config_1.config.database.url}" | gzip`, { maxBuffer: 512 * 1024 * 1024 });
        const s3 = buildS3Client();
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: BUCKET,
            Key: `backups/${filename}`,
            Body: Buffer.from(stdout, 'binary'),
            ContentType: 'application/gzip',
        }));
        logger_1.logger.info({ filename, bucket: BUCKET }, 'Database backup uploaded to S3');
        await cleanOldBackups(s3);
        return filename;
    }
    catch (err) {
        logger_1.logger.error({ error: err.message }, 'Database backup failed');
        throw err;
    }
}
async function cleanOldBackups(s3) {
    try {
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const list = await s3.send(new client_s3_1.ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: 'backups/',
        }));
        const toDelete = (list.Contents || [])
            .filter((obj) => obj.LastModified && obj.LastModified < cutoff)
            .map((obj) => ({ Key: obj.Key }));
        if (toDelete.length > 0) {
            await s3.send(new client_s3_1.DeleteObjectsCommand({
                Bucket: BUCKET,
                Delete: { Objects: toDelete },
            }));
            logger_1.logger.info({ count: toDelete.length }, 'Cleaned old backups');
        }
    }
    catch (err) {
        logger_1.logger.warn({ error: err.message }, 'Failed to clean old backups');
    }
}
