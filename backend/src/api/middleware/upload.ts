import multer from 'multer';
import path from 'path';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

const storage = multer.memoryStorage();

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed. Accepted: ${ALLOWED_MIMES.join(', ')}`));
  }
}

/** Single-file upload middleware (field name: "file") */
export const uploadSingle = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
}).single('file');

/** Multi-file upload middleware (field name: "files", max 10) */
export const uploadMultiple = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
}).array('files', 10);
