"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appSummaryRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const errors_1 = require("../../utils/errors");
const client_1 = require("../../db/client");
const appSummaryDefaults_1 = require("../../data/appSummaryDefaults");
const appSummaryRouter = (0, express_1.Router)();
exports.appSummaryRouter = appSummaryRouter;
appSummaryRouter.use(auth_1.auth);
const summaryRowSchema = zod_1.z.object({
    area: zod_1.z.string().min(1).max(200),
    today: zod_1.z.string().max(2000),
    withApp: zod_1.z.string().max(2000),
});
const contentsItemSchema = zod_1.z.object({
    module: zod_1.z.string().min(1).max(200),
    description: zod_1.z.string().max(2000),
    replaces: zod_1.z.string().max(500),
    path: zod_1.z.string().min(1).max(300),
});
const contentsGroupSchema = zod_1.z.object({
    group: zod_1.z.string().min(1).max(200),
    items: zod_1.z.array(contentsItemSchema),
});
const putSchema = zod_1.z.object({
    introText: zod_1.z.string().max(5000),
    closingText: zod_1.z.string().max(5000),
    summaryRows: zod_1.z.array(summaryRowSchema).min(1).max(50),
    contentsGroups: zod_1.z.array(contentsGroupSchema).max(30),
});
async function ensureRow() {
    const existing = await client_1.dbPool.query(`SELECT * FROM app_summary_content WHERE id = 1`);
    if (existing.rows[0]) {
        return (0, appSummaryDefaults_1.rowFromDb)(existing.rows[0]);
    }
    const d = appSummaryDefaults_1.APP_SUMMARY_DEFAULTS;
    await client_1.dbPool.query(`INSERT INTO app_summary_content (id, intro_text, closing_text, summary_rows, contents_groups)
     VALUES (1, $1, $2, $3::jsonb, $4::jsonb)`, [d.introText, d.closingText, JSON.stringify(d.summaryRows), JSON.stringify(d.contentsGroups)]);
    const inserted = await client_1.dbPool.query(`SELECT * FROM app_summary_content WHERE id = 1`);
    return (0, appSummaryDefaults_1.rowFromDb)(inserted.rows[0]);
}
appSummaryRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = await ensureRow();
    res.json({
        success: true,
        data: {
            ...data,
            canEdit: (0, appSummaryDefaults_1.canEditSummaryEmail)(req.user?.email),
        },
    });
}));
appSummaryRouter.put('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!(0, appSummaryDefaults_1.canEditSummaryEmail)(req.user?.email)) {
        throw new errors_1.AppError('Only the designated editor can update this page', 'FORBIDDEN', 403);
    }
    const body = putSchema.parse(req.body);
    await client_1.dbPool.query(`INSERT INTO app_summary_content (id, intro_text, closing_text, summary_rows, contents_groups, updated_at, updated_by)
       VALUES (1, $1, $2, $3::jsonb, $4::jsonb, NOW(), $5)
       ON CONFLICT (id) DO UPDATE SET
         intro_text = EXCLUDED.intro_text,
         closing_text = EXCLUDED.closing_text,
         summary_rows = EXCLUDED.summary_rows,
         contents_groups = EXCLUDED.contents_groups,
         updated_at = NOW(),
         updated_by = EXCLUDED.updated_by`, [
        body.introText,
        body.closingText,
        JSON.stringify(body.summaryRows),
        JSON.stringify(body.contentsGroups),
        req.user.userId,
    ]);
    const result = await client_1.dbPool.query(`SELECT * FROM app_summary_content WHERE id = 1`);
    res.json({
        success: true,
        data: {
            ...(0, appSummaryDefaults_1.rowFromDb)(result.rows[0]),
            canEdit: (0, appSummaryDefaults_1.canEditSummaryEmail)(req.user?.email),
        },
    });
}));
