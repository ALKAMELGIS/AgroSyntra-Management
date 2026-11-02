"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.breedersRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
exports.breedersRouter = (0, express_1.Router)();
exports.breedersRouter.use(auth_1.auth);
exports.breedersRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));
exports.breedersRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const result = await client_1.dbPool.query(`SELECT * FROM breeders ORDER BY name ASC`);
    res.json({ success: true, data: result.rows });
}));
exports.breedersRouter.post('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { name, country } = zod_1.z.object({
        name: zod_1.z.string().min(1),
        country: zod_1.z.string().optional().nullable(),
    }).parse(req.body);
    const existing = await client_1.dbPool.query(`SELECT * FROM breeders WHERE LOWER(name) = LOWER($1)`, [name]);
    if (existing.rows.length > 0) {
        return res.json({ success: true, data: existing.rows[0] });
    }
    const result = await client_1.dbPool.query(`INSERT INTO breeders (name, country) VALUES ($1, $2) RETURNING *`, [name.trim(), country || null]);
    res.status(201).json({ success: true, data: result.rows[0] });
}));
