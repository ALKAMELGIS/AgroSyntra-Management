"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tasksRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const errors_1 = require("../../utils/errors");
const roleAccess_1 = require("../../utils/roleAccess");
const task_service_1 = require("../../services/task.service");
const websocket_1 = require("../../websocket");
const push_notification_service_1 = require("../../services/push-notification.service");
const client_1 = require("../../db/client");
const createTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500),
    description: zod_1.z.string().max(5000).optional(),
    task_type: zod_1.z.string().optional(),
    priority: zod_1.z.enum(['urgent', 'high', 'medium', 'low']).optional(),
    status: zod_1.z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
    assigned_to: zod_1.z.string().uuid().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    due_date: zod_1.z.string().optional(),
});
const updateTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500).optional(),
    description: zod_1.z.string().max(5000).optional(),
    task_type: zod_1.z.string().optional(),
    priority: zod_1.z.enum(['urgent', 'high', 'medium', 'low']).optional(),
    status: zod_1.z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
    assigned_to: zod_1.z.string().uuid().nullable().optional(),
    field_id: zod_1.z.string().uuid().nullable().optional(),
    due_date: zod_1.z.string().nullable().optional(),
});
const tasksRouter = (0, express_1.Router)();
exports.tasksRouter = tasksRouter;
tasksRouter.use(auth_1.auth);
/** GET /tasks – list tasks (with filters + role scoping) */
tasksRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const role = req.user.role;
    const userId = req.user.userId;
    const query = {
        status: req.query.status,
        assigned_to: req.query.assigned_to,
        field_id: req.query.field_id,
        site_id: req.query.site_id,
        task_type: req.query.task_type,
        priority: req.query.priority,
        due_before: req.query.due_before,
        due_after: req.query.due_after,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
        scope_user_id: ['worker', 'team_leader'].includes(role) ? userId : undefined,
    };
    const result = await (0, task_service_1.listTasks)(query);
    res.json({ success: true, data: result.tasks, meta: { total: result.total } });
}));
/** POST /tasks – create task */
tasksRouter.post('/', (0, validate_1.validate)({ body: createTaskSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    const task = await (0, task_service_1.createTask)({ ...req.body, assigned_by: req.user.userId });
    (0, websocket_1.emitTaskUpdate)(task);
    // Send push notification to assigned user
    if (task.assigned_to && task.assigned_to !== req.user.userId) {
        push_notification_service_1.pushNotificationService.sendToUser(task.assigned_to, {
            title: 'New Task Assigned',
            body: `You've been assigned: ${task.title}`,
            type: 'info',
            data: { taskId: task.id, screen: 'tasks' },
        }).catch(() => { }); // fire-and-forget
    }
    res.status(201).json({ success: true, data: task });
}));
/** PUT /tasks/:id – update task */
tasksRouter.put('/:id', (0, validate_1.validate)({ body: updateTaskSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const role = req.user.role;
    const userId = req.user.userId;
    if (['worker', 'team_leader'].includes(role)) {
        const existing = await (0, task_service_1.getTask)(req.params.id);
        if (!existing)
            throw new errors_1.NotFoundError('Task not found');
        if (existing.assigned_to !== userId && existing.assigned_by !== userId) {
            throw new errors_1.AppError('Not authorized to update this task', 'FORBIDDEN', 403);
        }
    }
    else {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    }
    const task = await (0, task_service_1.updateTask)(req.params.id, req.body);
    (0, websocket_1.emitTaskUpdate)(task);
    res.json({ success: true, data: task });
}));
/** DELETE /tasks/:id – delete task */
tasksRouter.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    await (0, task_service_1.deleteTask)(req.params.id);
    res.json({ success: true });
}));
/** GET /tasks/:id/comments */
tasksRouter.get('/:id/comments', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const comments = await (0, task_service_1.getTaskComments)(req.params.id);
    res.json({ success: true, data: comments });
}));
/** POST /tasks/:id/comments */
tasksRouter.post('/:id/comments', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    const comment = await (0, task_service_1.addTaskComment)(req.params.id, req.user.userId, req.body.comment);
    res.status(201).json({ success: true, data: comment });
}));
/** GET /tasks/:id/checklist */
tasksRouter.get('/:id/checklist', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const items = await (0, task_service_1.getTaskChecklist)(req.params.id);
    res.json({ success: true, data: items });
}));
/** POST /tasks/:id/checklist */
tasksRouter.post('/:id/checklist', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    const item = await (0, task_service_1.addChecklistItem)(req.params.id, req.body.item);
    res.status(201).json({ success: true, data: item });
}));
/** PUT /tasks/checklist/:itemId/toggle */
tasksRouter.put('/checklist/:itemId/toggle', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    const item = await (0, task_service_1.toggleChecklistItem)(req.params.itemId, req.user.userId);
    res.json({ success: true, data: item });
}));
// ─── Team Assignments (MUST be before /:id to avoid route conflict) ───
/** GET /tasks/teams/assignments – get team leader -> worker mappings */
tasksRouter.get('/teams/assignments', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await client_1.dbPool.query(`SELECT ta.*, 
            tl.name as team_leader_name, tl.role as team_leader_role,
            w.name as worker_name, w.role as worker_role
     FROM team_assignments ta
     JOIN users tl ON tl.id = ta.team_leader_id
     JOIN users w ON w.id = ta.worker_id
     WHERE ta.is_active = true
     ORDER BY tl.name, w.name`);
    res.json({ success: true, data: result.rows });
}));
/** POST /tasks/teams/assignments – assign worker to team leader */
tasksRouter.post('/teams/assignments', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    const { teamLeaderId, workerId } = req.body;
    const result = await client_1.dbPool.query(`INSERT INTO team_assignments (team_leader_id, worker_id)
       VALUES ($1, $2)
       ON CONFLICT (team_leader_id, worker_id) DO UPDATE SET is_active = true, updated_at = NOW()
       RETURNING *`, [teamLeaderId, workerId]);
    res.status(201).json({ success: true, data: result.rows[0] });
}));
/** GET /tasks/teams/my-team – get workers in my team (for team leaders) */
tasksRouter.get('/teams/my-team', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await client_1.dbPool.query(`SELECT ta.worker_id, u.name, u.email, u.role
     FROM team_assignments ta
     JOIN users u ON u.id = ta.worker_id
     WHERE ta.team_leader_id = $1 AND ta.is_active = true
     ORDER BY u.name`, [req.user.userId]);
    res.json({ success: true, data: result.rows });
}));
/** GET /tasks/:id – get single task (MUST be after /teams/* routes) */
tasksRouter.get('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const task = await (0, task_service_1.getTask)(req.params.id);
    if (!task)
        throw new errors_1.NotFoundError('Task not found');
    const role = req.user.role;
    const userId = req.user.userId;
    if (['worker', 'team_leader'].includes(role) && task.assigned_to !== userId && task.assigned_by !== userId) {
        throw new errors_1.AppError('Not authorized to view this task', 'FORBIDDEN', 403);
    }
    res.json({ success: true, data: task });
}));
// ─── Task Delegation ──────────────────────────────────────────────
/** POST /tasks/:id/delegate – Team leader delegates parent task to workers as sub-tasks */
tasksRouter.post('/:id/delegate', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
    const parentTask = await (0, task_service_1.getTask)(req.params.id);
    if (!parentTask)
        throw new errors_1.NotFoundError('Task not found');
    const { assignments } = req.body;
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
        throw new errors_1.AppError('assignments array required', 'VALIDATION', 400);
    }
    const subtasks = [];
    for (const assignment of assignments) {
        const subtask = await (0, task_service_1.createTask)({
            title: assignment.title || parentTask.title,
            description: assignment.description || parentTask.description,
            task_type: parentTask.task_type,
            priority: parentTask.priority,
            status: 'todo',
            assigned_to: assignment.workerId,
            assigned_by: req.user.userId,
            field_id: assignment.fieldId || parentTask.field_id,
            due_date: parentTask.due_date,
            parent_task_id: parentTask.id,
            delegated_by: req.user.userId,
            team_leader_id: req.user.userId,
        });
        subtasks.push(subtask);
        (0, websocket_1.emitTaskUpdate)(subtask);
        // Notify assigned worker
        push_notification_service_1.pushNotificationService.sendToUser(assignment.workerId, {
            title: 'New Task Assignment',
            body: `Task: ${subtask.title}`,
            type: 'info',
            data: { taskId: subtask.id, parentTaskId: parentTask.id, screen: 'tasks' },
        }).catch(() => { });
    }
    // Mark parent as in_progress
    await (0, task_service_1.updateTask)(parentTask.id, { status: 'in_progress' });
    res.status(201).json({ success: true, data: subtasks });
}));
/** GET /tasks/:id/subtasks – get sub-tasks of a parent task */
tasksRouter.get('/:id/subtasks', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await client_1.dbPool.query(`SELECT t.*, u.name as assignee_name, f.name as field_name
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN fields f ON f.id = t.field_id
     WHERE t.parent_task_id = $1
     ORDER BY t.created_at DESC`, [req.params.id]);
    res.json({ success: true, data: result.rows });
}));
