"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shiftsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const shift_service_1 = require("../../services/shift.service");
const roleAccess_1 = require("../../utils/roleAccess");
const createShiftSchema = zod_1.z.object({
    user_id: zod_1.z.string().uuid(),
    field_id: zod_1.z.string().uuid().optional(),
    shift_date: zod_1.z.string(),
    start_time: zod_1.z.string(),
    end_time: zod_1.z.string(),
    break_minutes: zod_1.z.number().min(0).optional(),
    notes: zod_1.z.string().optional(),
});
const shiftsRouter = (0, express_1.Router)();
exports.shiftsRouter = shiftsRouter;
shiftsRouter.use(auth_1.auth);
/** GET /shifts - list shifts with filters */
shiftsRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const shifts = await (0, shift_service_1.listShifts)({
        user_id: req.query.user_id,
        field_id: req.query.field_id,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ success: true, data: shifts });
}));
/** POST /shifts - create shift */
shiftsRouter.post('/', (0, validate_1.validate)({ body: createShiftSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    const shift = await (0, shift_service_1.createShift)({ ...req.body, created_by: req.user.userId });
    res.status(201).json({ success: true, data: shift });
}));
/** PUT /shifts/:id - update shift */
shiftsRouter.put('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    const shift = await (0, shift_service_1.updateShift)(req.params.id, req.body);
    res.json({ success: true, data: shift });
}));
/** DELETE /shifts/:id - delete shift */
shiftsRouter.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    await (0, shift_service_1.deleteShift)(req.params.id);
    res.json({ success: true });
}));
