import { Router, Response } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { NotFoundError, AppError } from '../../utils/errors';
import { assertCanOperateWorkforce } from '../../utils/roleAccess';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getTaskComments,
  addTaskComment,
  getTaskChecklist,
  addChecklistItem,
  toggleChecklistItem,
} from '../../services/task.service';
import { emitTaskUpdate } from '../../websocket';
import { pushNotificationService } from '../../services/push-notification.service';
import { dbPool } from '../../db/client';

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  task_type: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
  assigned_to: z.string().uuid().optional(),
  field_id: z.string().uuid().optional(),
  due_date: z.string().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  task_type: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  field_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
});

const tasksRouter = Router();
tasksRouter.use(auth);

/** GET /tasks – list tasks (with filters + role scoping) */
tasksRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const role = req.user!.role;
  const userId = req.user!.userId;

  const query = {
    status: req.query.status as string | undefined,
    assigned_to: req.query.assigned_to as string | undefined,
    field_id: req.query.field_id as string | undefined,
    site_id: req.query.site_id as string | undefined,
    task_type: req.query.task_type as string | undefined,
    priority: req.query.priority as string | undefined,
    due_before: req.query.due_before as string | undefined,
    due_after: req.query.due_after as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    scope_user_id: ['worker', 'team_leader'].includes(role) ? userId : undefined,
  };
  const result = await listTasks(query);
  res.json({ success: true, data: result.tasks, meta: { total: result.total } });
}));

/** POST /tasks – create task */
tasksRouter.post('/', validate({ body: createTaskSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanOperateWorkforce(req.user!);
  const task = await createTask({ ...req.body, assigned_by: req.user!.userId });
  emitTaskUpdate(task);

  // Send push notification to assigned user
  if (task.assigned_to && task.assigned_to !== req.user!.userId) {
    pushNotificationService.sendToUser(task.assigned_to, {
      title: 'New Task Assigned',
      body: `You've been assigned: ${task.title}`,
      type: 'info',
      data: { taskId: task.id, screen: 'tasks' },
    }).catch(() => {}); // fire-and-forget
  }

  res.status(201).json({ success: true, data: task });
}));

/** PUT /tasks/:id – update task */
tasksRouter.put('/:id', validate({ body: updateTaskSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const role = req.user!.role;
  const userId = req.user!.userId;
  if (['worker', 'team_leader'].includes(role)) {
    const existing = await getTask(req.params.id);
    if (!existing) throw new NotFoundError('Task not found');
    if (existing.assigned_to !== userId && existing.assigned_by !== userId) {
      throw new AppError('Not authorized to update this task', 'FORBIDDEN', 403);
    }
  } else {
    assertCanOperateWorkforce(req.user!);
  }
  const task = await updateTask(req.params.id, req.body);
  emitTaskUpdate(task);
  res.json({ success: true, data: task });
}));

/** DELETE /tasks/:id – delete task */
tasksRouter.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanOperateWorkforce(req.user!);
  await deleteTask(req.params.id);
  res.json({ success: true });
}));

/** GET /tasks/:id/comments */
tasksRouter.get('/:id/comments', asyncHandler(async (req: AuthRequest, res: Response) => {
  const comments = await getTaskComments(req.params.id);
  res.json({ success: true, data: comments });
}));

/** POST /tasks/:id/comments */
tasksRouter.post('/:id/comments', asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanOperateWorkforce(req.user!);
  const comment = await addTaskComment(req.params.id, req.user!.userId, req.body.comment);
  res.status(201).json({ success: true, data: comment });
}));

/** GET /tasks/:id/checklist */
tasksRouter.get('/:id/checklist', asyncHandler(async (req: AuthRequest, res: Response) => {
  const items = await getTaskChecklist(req.params.id);
  res.json({ success: true, data: items });
}));

/** POST /tasks/:id/checklist */
tasksRouter.post('/:id/checklist', asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanOperateWorkforce(req.user!);
  const item = await addChecklistItem(req.params.id, req.body.item);
  res.status(201).json({ success: true, data: item });
}));

/** PUT /tasks/checklist/:itemId/toggle */
tasksRouter.put('/checklist/:itemId/toggle', asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanOperateWorkforce(req.user!);
  const item = await toggleChecklistItem(req.params.itemId, req.user!.userId);
  res.json({ success: true, data: item });
}));

// ─── Team Assignments (MUST be before /:id to avoid route conflict) ───

/** GET /tasks/teams/assignments – get team leader -> worker mappings */
tasksRouter.get('/teams/assignments', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await dbPool.query(
    `SELECT ta.*, 
            tl.name as team_leader_name, tl.role as team_leader_role,
            w.name as worker_name, w.role as worker_role
     FROM team_assignments ta
     JOIN users tl ON tl.id = ta.team_leader_id
     JOIN users w ON w.id = ta.worker_id
     WHERE ta.is_active = true
     ORDER BY tl.name, w.name`
  );
  res.json({ success: true, data: result.rows });
}));

/** POST /tasks/teams/assignments – assign worker to team leader */
tasksRouter.post('/teams/assignments',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertCanOperateWorkforce(req.user!);
    const { teamLeaderId, workerId } = req.body;
    const result = await dbPool.query(
      `INSERT INTO team_assignments (team_leader_id, worker_id)
       VALUES ($1, $2)
       ON CONFLICT (team_leader_id, worker_id) DO UPDATE SET is_active = true, updated_at = NOW()
       RETURNING *`,
      [teamLeaderId, workerId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  })
);

/** GET /tasks/teams/my-team – get workers in my team (for team leaders) */
tasksRouter.get('/teams/my-team', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await dbPool.query(
    `SELECT ta.worker_id, u.name, u.email, u.role
     FROM team_assignments ta
     JOIN users u ON u.id = ta.worker_id
     WHERE ta.team_leader_id = $1 AND ta.is_active = true
     ORDER BY u.name`,
    [req.user!.userId]
  );
  res.json({ success: true, data: result.rows });
}));

/** GET /tasks/:id – get single task (MUST be after /teams/* routes) */
tasksRouter.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const task = await getTask(req.params.id);
  if (!task) throw new NotFoundError('Task not found');
  const role = req.user!.role;
  const userId = req.user!.userId;
  if (['worker', 'team_leader'].includes(role) && task.assigned_to !== userId && task.assigned_by !== userId) {
    throw new AppError('Not authorized to view this task', 'FORBIDDEN', 403);
  }
  res.json({ success: true, data: task });
}));

// ─── Task Delegation ──────────────────────────────────────────────

/** POST /tasks/:id/delegate – Team leader delegates parent task to workers as sub-tasks */
tasksRouter.post('/:id/delegate', asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanOperateWorkforce(req.user!);
  const parentTask = await getTask(req.params.id);
  if (!parentTask) throw new NotFoundError('Task not found');

  const { assignments } = req.body;
  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    throw new AppError('assignments array required', 'VALIDATION', 400);
  }

  const subtasks = [];
  for (const assignment of assignments) {
    const subtask = await createTask({
      title: assignment.title || parentTask.title,
      description: assignment.description || parentTask.description,
      task_type: parentTask.task_type,
      priority: parentTask.priority,
      status: 'todo',
      assigned_to: assignment.workerId,
      assigned_by: req.user!.userId,
      field_id: assignment.fieldId || parentTask.field_id,
      due_date: parentTask.due_date,
      parent_task_id: parentTask.id,
      delegated_by: req.user!.userId,
      team_leader_id: req.user!.userId,
    });

    subtasks.push(subtask);
    emitTaskUpdate(subtask);

    // Notify assigned worker
    pushNotificationService.sendToUser(assignment.workerId, {
      title: 'New Task Assignment',
      body: `Task: ${subtask.title}`,
      type: 'info',
      data: { taskId: subtask.id, parentTaskId: parentTask.id, screen: 'tasks' },
    }).catch(() => {});
  }

  // Mark parent as in_progress
  await updateTask(parentTask.id, { status: 'in_progress' });

  res.status(201).json({ success: true, data: subtasks });
}));

/** GET /tasks/:id/subtasks – get sub-tasks of a parent task */
tasksRouter.get('/:id/subtasks', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await dbPool.query(
    `SELECT t.*, u.name as assignee_name, f.name as field_name
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN fields f ON f.id = t.field_id
     WHERE t.parent_task_id = $1
     ORDER BY t.created_at DESC`,
    [req.params.id]
  );
  res.json({ success: true, data: result.rows });
}));

export { tasksRouter };
