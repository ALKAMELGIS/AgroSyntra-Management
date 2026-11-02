"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFile = uploadFile;
exports.deleteFile = deleteFile;
exports.readBlob = readBlob;
exports.getSignedDownloadUrl = getSignedDownloadUrl;
exports.getActiveProvider = getActiveProvider;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const client_1 = require("../db/client");
const config = {
    provider: process.env.STORAGE_PROVIDER || 'local',
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION || 'auto',
    s3AccessKey: process.env.S3_ACCESS_KEY,
    s3SecretKey: process.env.S3_SECRET_KEY,
    s3Endpoint: process.env.S3_ENDPOINT || undefined,
    s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true',
    s3PublicUrl: process.env.S3_PUBLIC_URL || undefined,
    localDir: process.env.UPLOAD_DIR || path_1.default.join(process.cwd(), 'uploads'),
    publicUrl: process.env.PUBLIC_URL || 'http://localhost:3001',
};
let s3Client = null;
function getS3Client() {
    if (!s3Client) {
        s3Client = new client_s3_1.S3Client({
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
function generateKey(entity, originalName) {
    const ext = path_1.default.extname(originalName).toLowerCase();
    const hash = crypto_1.default.randomBytes(16).toString('hex');
    const date = new Date().toISOString().split('T')[0];
    return `${entity}/${date}/${hash}${ext}`;
}
async function uploadFile(buffer, originalName, mimeType, entity) {
    const key = generateKey(entity, originalName);
    if (config.provider === 's3') {
        const client = getS3Client();
        await client.send(new client_s3_1.PutObjectCommand({
            Bucket: config.s3Bucket,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
        }));
        // Prefer an operator-supplied public URL (e.g. R2 custom domain),
        // then fall back to the S3 endpoint, then the AWS default host.
        let url;
        if (config.s3PublicUrl) {
            url = `${config.s3PublicUrl.replace(/\/+$/, '')}/${key}`;
        }
        else if (config.s3Endpoint) {
            const endpoint = config.s3Endpoint.replace(/\/+$/, '');
            url = config.s3ForcePathStyle
                ? `${endpoint}/${config.s3Bucket}/${key}`
                : `${endpoint}/${key}`; // virtual-host style with custom endpoint is uncommon
        }
        else {
            url = `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com/${key}`;
        }
        return { url, storageKey: key, filename: path_1.default.basename(key) };
    }
    if (config.provider === 'db') {
        // Persist bytes directly in Postgres. storage_key looks like
        // "db:<uuid>" so deleteFile / readBlob can find the row later,
        // and the public url is served through /api/v1/files/:id.
        const inserted = await client_1.dbPool.query(`INSERT INTO file_blobs (content, mime_type, size_bytes)
       VALUES ($1, $2, $3)
       RETURNING id`, [buffer, mimeType, buffer.length]);
        const id = inserted.rows[0].id;
        const apiBase = process.env.PUBLIC_URL || '';
        const url = `${apiBase.replace(/\/+$/, '')}/api/v1/files/${id}`;
        return {
            url,
            storageKey: `db:${id}`,
            filename: path_1.default.basename(originalName),
        };
    }
    // Local filesystem fallback
    const dir = path_1.default.join(config.localDir, path_1.default.dirname(key));
    await promises_1.default.mkdir(dir, { recursive: true });
    const filePath = path_1.default.join(config.localDir, key);
    await promises_1.default.writeFile(filePath, buffer);
    const url = `${config.publicUrl}/uploads/${key}`;
    return { url, storageKey: key, filename: path_1.default.basename(key) };
}
async function deleteFile(storageKey) {
    if (storageKey.startsWith('db:')) {
        const id = storageKey.slice(3);
        try {
            await client_1.dbPool.query(`DELETE FROM file_blobs WHERE id = $1`, [id]);
        }
        catch {
            // Already gone — nothing to do.
        }
        return;
    }
    if (config.provider === 's3') {
        const client = getS3Client();
        await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: config.s3Bucket, Key: storageKey }));
        return;
    }
    // Local
    const filePath = path_1.default.join(config.localDir, storageKey);
    try {
        await promises_1.default.unlink(filePath);
    }
    catch {
        // File may already be deleted
    }
}
/**
 * Load a blob's content from Postgres. Returns null if the id is unknown.
 * Used by the GET /files/:id route when STORAGE_PROVIDER=db.
 */
async function readBlob(id) {
    const result = await client_1.dbPool.query(`SELECT content, mime_type, size_bytes FROM file_blobs WHERE id = $1`, [id]);
    if (result.rows.length === 0)
        return null;
    const row = result.rows[0];
    return {
        content: row.content,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
    };
}
async function getSignedDownloadUrl(storageKey) {
    if (storageKey.startsWith('db:')) {
        const apiBase = process.env.PUBLIC_URL || '';
        return `${apiBase.replace(/\/+$/, '')}/api/v1/files/${storageKey.slice(3)}`;
    }
    if (config.provider === 's3') {
        const client = getS3Client();
        const command = new client_s3_1.GetObjectCommand({ Bucket: config.s3Bucket, Key: storageKey });
        return (0, s3_request_presigner_1.getSignedUrl)(client, command, { expiresIn: 3600 });
    }
    return `${config.publicUrl}/uploads/${storageKey}`;
}
/**
 * Which provider is currently active. Exposed so the API can report it
 * on the observability endpoint (storage.persistent).
 */
function getActiveProvider() {
    return config.provider;
}
