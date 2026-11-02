"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMultiple = exports.uploadSingle = void 0;
const multer_1 = __importDefault(require("multer"));
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
];
const storage = multer_1.default.memoryStorage();
function fileFilter(_req, file, cb) {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error(`File type ${file.mimetype} is not allowed. Accepted: ${ALLOWED_MIMES.join(', ')}`));
    }
}
/** Single-file upload middleware (field name: "file") */
exports.uploadSingle = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
}).single('file');
/** Multi-file upload middleware (field name: "files", max 10) */
exports.uploadMultiple = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
}).array('files', 10);
