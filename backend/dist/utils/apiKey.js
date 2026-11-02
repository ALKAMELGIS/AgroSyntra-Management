"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_KEY_PREFIX_LENGTH = void 0;
exports.generateApiKey = generateApiKey;
const crypto_1 = __importDefault(require("crypto"));
/** Display prefix stored on api_keys.key_prefix (`almaha_` + 8 hex chars). */
exports.API_KEY_PREFIX_LENGTH = 15;
function generateApiKey() {
    const rawKey = `almaha_${crypto_1.default.randomBytes(32).toString('hex')}`;
    const keyHash = crypto_1.default.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, exports.API_KEY_PREFIX_LENGTH);
    return { rawKey, keyHash, keyPrefix };
}
