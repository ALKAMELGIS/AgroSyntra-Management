"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbPool = void 0;
const pg_1 = require("pg");
const Sentry = __importStar(require("@sentry/node"));
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const SLOW_QUERY_MS = 500;
const isProduction = process.env.NODE_ENV === 'production';
const pool = new pg_1.Pool({
    connectionString: database_1.databaseConfig.url,
    min: database_1.databaseConfig.poolMin,
    max: database_1.databaseConfig.poolMax,
    idleTimeoutMillis: isProduction ? 60_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 30_000,
});
pool.on('error', (err) => {
    logger_1.logger.error({ err }, 'Unexpected database pool error');
});
function instrumentedQuery(textOrConfig, values) {
    const start = Date.now();
    const text = typeof textOrConfig === 'string' ? textOrConfig : textOrConfig.text;
    return Sentry.startSpan({ name: 'db.query', op: 'db', attributes: { 'db.statement': text.substring(0, 200) } }, async () => {
        const result = values
            ? await pool.query(textOrConfig, values)
            : await pool.query(textOrConfig);
        const duration = Date.now() - start;
        if (duration >= SLOW_QUERY_MS) {
            logger_1.logger.warn({ duration, query: text.substring(0, 200), rows: result.rowCount }, `Slow query (${duration}ms)`);
            Sentry.addBreadcrumb({
                category: 'db',
                message: `Slow query (${duration}ms): ${text.substring(0, 100)}`,
                level: 'warning',
            });
        }
        return result;
    });
}
exports.dbPool = {
    query: instrumentedQuery,
    connect: () => pool.connect(),
    end: () => pool.end(),
    pool,
};
