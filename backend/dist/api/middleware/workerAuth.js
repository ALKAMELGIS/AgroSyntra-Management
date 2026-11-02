"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workerAuth = workerAuth;
exports.requireTeamLeader = requireTeamLeader;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../../config");
/**
 * Middleware that validates worker JWT tokens (separate from main user auth).
 * Workers log in with employee_id + PIN and receive a limited-scope JWT.
 */
function workerAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: { message: 'Worker authentication required' } });
        }
        const token = authHeader.substring(7);
        const payload = jsonwebtoken_1.default.verify(token, config_1.config.auth.jwtSecret);
        if (payload.tokenType !== 'worker') {
            return res.status(401).json({ success: false, error: { message: 'Invalid worker token' } });
        }
        req.worker = {
            workerId: payload.workerId,
            employeeId: payload.employeeId,
            name: payload.name,
            isTeamLeader: payload.isTeamLeader,
            siteId: payload.siteId ?? null,
        };
        return next();
    }
    catch {
        return res.status(401).json({ success: false, error: { message: 'Invalid or expired worker token' } });
    }
}
/**
 * Requires the worker to be a team leader.
 */
function requireTeamLeader(req, res, next) {
    if (!req.worker?.isTeamLeader) {
        return res.status(403).json({ success: false, error: { message: 'Team leader access required' } });
    }
    return next();
}
