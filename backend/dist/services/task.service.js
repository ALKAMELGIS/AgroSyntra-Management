"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTasks = listTasks;
exports.getTask = getTask;
exports.createTask = createTask;
exports.updateTask = updateTask;
exports.deleteTask = deleteTask;
exports.getTaskComments = getTaskComments;
exports.addTaskComment = addTaskComment;
exports.getTaskChecklist = getTaskChecklist;
exports.addChecklistItem = addChecklistItem;
exports.toggleChecklistItem = toggleChecklistItem;
const client_1 = require("../db/client");
async function listTasks(query) {
    const conditions = [];
    const params = [];
    let p = 0;
    let siteJoinSql = '';
    if (query.site_id) {
        siteJoinSql = ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
        p++;
        conditions.push(`fa.site_id = $${p}`);
        params.push(query.site_id);
    }
    if (query.status) {
        p++;
        conditions.push(`t.status = $${p}`);
        params.push(query.status);
    }
    if (query.assigned_to) {
        p++;
        conditions.push(`t.assigned_to = $${p}`);
        params.push(query.assigned_to);
    }
    if (query.field_id) {
        p++;
        conditions.push(`t.field_id = $${p}`);
        params.push(query.field_id);
    }
    if (query.task_type) {
        p++;
        conditions.push(`t.task_type = $${p}`);
        params.push(query.task_type);
    }
    if (query.priority) {
        p++;
        conditions.push(`t.priority = $${p}`);
        params.push(query.priority);
    }
    if (query.due_before) {
        p++;
        conditions.push(`t.due_date <= $${p}`);
        params.push(query.due_before);
    }
    if (query.due_after) {
        p++;
        conditions.push(`t.due_date >= $${p}`);
        params.push(query.due_after);
    }
    if (query.scope_user_id) {
        p++;
        conditions.push(`(t.assigned_to = $${p} OR t.assigned_by = $${p})`);
        params.push(query.scope_user_id);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    const countSiteJoinSql = query.site_id
        ? ' LEFT JOIN fields f ON t.field_id = f.id JOIN farm_areas fa ON fa.id = f.farm_area_id'
        : '';
    const [tasksRes, countRes] = await Promise.all([
        client_1.dbPool.query(`SELECT t.*,
              u1.name as assigned_to_name,
              u2.name as assigned_by_name,
              f.name as field_name,
              (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id)::int as comments_count,
              (SELECT COUNT(*) FROM task_checklists WHERE task_id = t.id)::int as checklist_total,
              (SELECT COUNT(*) FROM task_checklists WHERE task_id = t.id AND is_completed = true)::int as checklist_done
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_to = u1.id
       LEFT JOIN users u2 ON t.assigned_by = u2.id
       LEFT JOIN fields f ON t.field_id = f.id
       ${siteJoinSql}
       ${where}
       ORDER BY
         CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         t.due_date ASC NULLS LAST,
         t.created_at DESC
       LIMIT $${p + 1} OFFSET $${p + 2}`, [...params, limit, offset]),
        client_1.dbPool.query(`SELECT COUNT(*) as total FROM tasks t${countSiteJoinSql} ${where}`, params),
    ]);
    return {
        tasks: tasksRes.rows,
        total: parseInt(countRes.rows[0].total, 10),
    };
}
async function getTask(id) {
    const result = await client_1.dbPool.query(`SELECT t.*,
            u1.name as assigned_to_name,
            u2.name as assigned_by_name,
            f.name as field_name
     FROM tasks t
     LEFT JOIN users u1 ON t.assigned_to = u1.id
     LEFT JOIN users u2 ON t.assigned_by = u2.id
     LEFT JOIN fields f ON t.field_id = f.id
     WHERE t.id = $1`, [id]);
    return result.rows[0] || null;
}
async function createTask(data) {
    const result = await client_1.dbPool.query(`INSERT INTO tasks (title, description, task_type, priority, status, assigned_to, assigned_by, field_id, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`, [data.title, data.description, data.task_type || 'general', data.priority || 'medium',
        data.status || 'todo', data.assigned_to, data.assigned_by, data.field_id, data.due_date]);
    return result.rows[0];
}
async function updateTask(id, data) {
    const sets = [];
    const params = [];
    let p = 0;
    const fields = ['title', 'description', 'task_type', 'priority', 'status', 'assigned_to', 'field_id', 'due_date'];
    for (const f of fields) {
        if (data[f] !== undefined) {
            p++;
            sets.push(`${f} = $${p}`);
            params.push(data[f]);
        }
    }
    if (data.status === 'done' && !data.completed_at) {
        p++;
        sets.push(`completed_at = $${p}`);
        params.push(new Date().toISOString());
    }
    sets.push('updated_at = NOW()');
    p++;
    params.push(id);
    const result = await client_1.dbPool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`, params);
    return result.rows[0];
}
async function deleteTask(id) {
    await client_1.dbPool.query('DELETE FROM tasks WHERE id = $1', [id]);
}
// Comments
async function getTaskComments(taskId) {
    const result = await client_1.dbPool.query(`SELECT c.*, u.name as user_name
     FROM task_comments c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.task_id = $1
     ORDER BY c.created_at ASC`, [taskId]);
    return result.rows;
}
async function addTaskComment(taskId, userId, comment) {
    const result = await client_1.dbPool.query(`INSERT INTO task_comments (task_id, user_id, comment) VALUES ($1, $2, $3) RETURNING *`, [taskId, userId, comment]);
    return result.rows[0];
}
// Checklists
async function getTaskChecklist(taskId) {
    const result = await client_1.dbPool.query('SELECT * FROM task_checklists WHERE task_id = $1 ORDER BY sort_order, created_at', [taskId]);
    return result.rows;
}
async function addChecklistItem(taskId, item) {
    const result = await client_1.dbPool.query('INSERT INTO task_checklists (task_id, item) VALUES ($1, $2) RETURNING *', [taskId, item]);
    return result.rows[0];
}
async function toggleChecklistItem(itemId, userId) {
    const result = await client_1.dbPool.query(`UPDATE task_checklists SET
       is_completed = NOT is_completed,
       completed_by = CASE WHEN NOT is_completed THEN $1 ELSE NULL END,
       completed_at = CASE WHEN NOT is_completed THEN NOW() ELSE NULL END
     WHERE id = $2 RETURNING *`, [userId, itemId]);
    return result.rows[0];
}
