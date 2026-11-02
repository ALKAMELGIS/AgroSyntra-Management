import { Router, Response } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { listShifts, createShift, updateShift, deleteShift } from '../../services/shift.service';
import { assertCanOperateWorkforce } from '../../utils/roleAccess';

const createShiftSchema = z.object({
  user_id: z.string().uuid(),
  field_id: z.string().uuid().optional(),
  shift_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  break_minutes: z.number().min(0).optional(),
  notes: z.string().optional(),
});

const shiftsRouter = Router();
shiftsRouter.use(auth);

/** GET /shifts - list shifts with filters */
shiftsRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const shifts = await listShifts({
    user_id: req.query.user_id as string,
    field_id: req.query.field_id as string,
    start_date: req.query.start_date as string,
    end_date: req.query.end_date as string,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });
  res.json({ success: true, data: shifts });
}));

/** POST /shifts - create shift */
shiftsRouter.post('/', validate({ body: createShiftSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanOperateWorkforce(req.user!);
  const shift = await createShift({ ...req.body, created_by: req.user!.userId });
  res.status(201).json({ success: true, data: shift });
}));

/** PUT /shifts/:id - update shift */
shiftsRouter.put('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanOperateWorkforce(req.user!);
  const shift = await updateShift(req.params.id, req.body);
  res.json({ success: true, data: shift });
}));

/** DELETE /shifts/:id - delete shift */
shiftsRouter.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanOperateWorkforce(req.user!);
  await deleteShift(req.params.id);
  res.json({ success: true });
}));

export { shiftsRouter };
