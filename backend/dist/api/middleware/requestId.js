"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = requestId;
const crypto_1 = require("crypto");
function requestId(req, res, next) {
    const header = req.headers['x-request-id'];
    const id = typeof header === 'string' && header.length > 0 ? header : (0, crypto_1.randomUUID)();
    req.id = id;
    res.setHeader('x-request-id', id);
    next();
}
