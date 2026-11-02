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
exports.listItems = listItems;
exports.getItem = getItem;
exports.createItem = createItem;
exports.updateItem = updateItem;
exports.deleteItem = deleteItem;
exports.recordTransaction = recordTransaction;
exports.getLowStockItems = getLowStockItems;
exports.getTransactionHistory = getTransactionHistory;
exports.deductByName = deductByName;
exports.reverseUsageByReference = reverseUsageByReference;
const client_1 = require("../db/client");
const logger_1 = require("../utils/logger");
// ─── Items CRUD ──────────────────────────────────────────────────
async function listItems(filters) {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (filters.activeOnly !== false) {
        conditions.push('is_active = true');
    }
    if (filters.category) {
        conditions.push(`category = $${idx}`);
        params.push(filters.category);
        idx++;
    }
    if (filters.search) {
        conditions.push(`(name ILIKE $${idx} OR supplier ILIKE $${idx})`);
        params.push(`%${filters.search}%`);
        idx++;
    }
    if (filters.lowStockOnly) {
        conditions.push('current_stock <= min_stock_level');
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(filters.limit || 50, 100);
    const page = Math.max(filters.page || 1, 1);
    const offset = (page - 1) * limit;
    const countResult = await client_1.dbPool.query(`SELECT COUNT(*) FROM inventory_items ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    params.push(limit);
    params.push(offset);
    const result = await client_1.dbPool.query(`SELECT * FROM inventory_items ${where} ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`, params);
    return {
        items: result.rows,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
}
async function getItem(id) {
    const itemResult = await client_1.dbPool.query('SELECT * FROM inventory_items WHERE id = $1', [id]);
    if (itemResult.rowCount === 0)
        throw Object.assign(new Error('Item not found'), { status: 404 });
    const item = itemResult.rows[0];
    const txResult = await client_1.dbPool.query(`SELECT t.*, u.display_name AS created_by_name
     FROM inventory_transactions t
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.item_id = $1
     ORDER BY t.created_at DESC LIMIT 50`, [id]);
    return { ...item, transactions: txResult.rows };
}
async function createItem(data) {
    const result = await client_1.dbPool.query(`INSERT INTO inventory_items (name, category, unit, min_stock_level, current_stock, cost_per_unit, currency, supplier, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`, [
        data.name, data.category, data.unit || 'kg',
        data.minStockLevel || 0, data.currentStock || 0,
        data.costPerUnit || 0, data.currency || 'AED',
        data.supplier || null, data.createdBy || null,
    ]);
    const item = result.rows[0];
    if ((data.currentStock || 0) > 0) {
        await recordTransaction(item.id, 'adjustment', data.currentStock, 'manual', null, 'Initial stock', data.createdBy);
    }
    return item;
}
async function updateItem(id, data) {
    const sets = [];
    const params = [];
    if (data.name !== undefined) {
        params.push(data.name);
        sets.push(`name = $${params.length}`);
    }
    if (data.category !== undefined) {
        params.push(data.category);
        sets.push(`category = $${params.length}`);
    }
    if (data.unit !== undefined) {
        params.push(data.unit);
        sets.push(`unit = $${params.length}`);
    }
    if (data.minStockLevel !== undefined) {
        params.push(data.minStockLevel);
        sets.push(`min_stock_level = $${params.length}`);
    }
    if (data.costPerUnit !== undefined) {
        params.push(data.costPerUnit);
        sets.push(`cost_per_unit = $${params.length}`);
    }
    if (data.currency !== undefined) {
        params.push(data.currency);
        sets.push(`currency = $${params.length}`);
    }
    if (data.supplier !== undefined) {
        params.push(data.supplier);
        sets.push(`supplier = $${params.length}`);
    }
    if (data.isActive !== undefined) {
        params.push(data.isActive);
        sets.push(`is_active = $${params.length}`);
    }
    if (sets.length === 0)
        throw Object.assign(new Error('No fields to update'), { status: 400 });
    sets.push('updated_at = NOW()');
    params.push(id);
    const result = await client_1.dbPool.query(`UPDATE inventory_items SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (result.rowCount === 0)
        throw Object.assign(new Error('Item not found'), { status: 404 });
    return result.rows[0];
}
async function deleteItem(id) {
    const result = await client_1.dbPool.query('UPDATE inventory_items SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0)
        throw Object.assign(new Error('Item not found'), { status: 404 });
    return result.rows[0];
}
// ─── Transaction recording (core) ────────────────────────────────
async function recordTransaction(itemId, type, quantity, referenceType, referenceId, notes, createdBy) {
    const updateResult = await client_1.dbPool.query('UPDATE inventory_items SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2 RETURNING current_stock', [quantity, itemId]);
    if (updateResult.rowCount === 0) {
        logger_1.logger.warn({ itemId }, 'Inventory item not found for transaction');
        return null;
    }
    const balanceAfter = parseFloat(updateResult.rows[0].current_stock);
    const txResult = await client_1.dbPool.query(`INSERT INTO inventory_transactions (item_id, type, quantity, balance_after, reference_type, reference_id, date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8) RETURNING *`, [itemId, type, quantity, balanceAfter, referenceType || null, referenceId || null, notes || null, createdBy || null]);
    // Check if stock is now low and trigger alerts (non-blocking)
    const itemCheck = await client_1.dbPool.query('SELECT min_stock_level FROM inventory_items WHERE id = $1', [itemId]);
    if (itemCheck.rows[0] && balanceAfter <= Number(itemCheck.rows[0].min_stock_level)) {
        Promise.resolve().then(() => __importStar(require('./alertEngine.service'))).then((alertEngine) => {
            alertEngine.checkInventoryAlerts().catch(() => { });
        }).catch(() => { });
    }
    return txResult.rows[0];
}
// ─── Low stock query ─────────────────────────────────────────────
async function getLowStockItems() {
    const result = await client_1.dbPool.query(`SELECT * FROM inventory_items
     WHERE is_active = true AND current_stock <= min_stock_level
     ORDER BY (current_stock - min_stock_level) ASC`);
    return result.rows;
}
// ─── Transaction history ─────────────────────────────────────────
async function getTransactionHistory(itemId, startDate, endDate) {
    const conditions = ['t.item_id = $1'];
    const params = [itemId];
    if (startDate) {
        conditions.push(`t.date >= $${params.length + 1}`);
        params.push(startDate);
    }
    if (endDate) {
        conditions.push(`t.date <= $${params.length + 1}`);
        params.push(endDate);
    }
    const result = await client_1.dbPool.query(`SELECT t.*, u.display_name AS created_by_name
     FROM inventory_transactions t
     LEFT JOIN users u ON u.id = t.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.created_at DESC LIMIT 200`, params);
    return result.rows;
}
// ─── Auto-deduction helpers (best-effort) ────────────────────────
async function deductByName(name, category, quantity, referenceType, referenceId, createdBy) {
    const itemResult = await client_1.dbPool.query('SELECT id FROM inventory_items WHERE LOWER(name) = LOWER($1) AND category = $2 AND is_active = true LIMIT 1', [name, category]);
    if (itemResult.rowCount === 0) {
        logger_1.logger.info({ name, category }, 'No inventory item matched for auto-deduction — skipping');
        return null;
    }
    return recordTransaction(itemResult.rows[0].id, 'usage', -Math.abs(quantity), referenceType, referenceId, `Auto-deducted: ${name}`, createdBy);
}
/**
 * Reverse all usage transactions linked to a reference (for edit/delete flows).
 * Creates offsetting 'return' transactions to restore stock.
 */
async function reverseUsageByReference(referenceType, referenceId, createdBy) {
    const txResult = await client_1.dbPool.query(`SELECT item_id, quantity FROM inventory_transactions
     WHERE reference_type = $1 AND reference_id = $2 AND type = 'usage'`, [referenceType, referenceId]);
    for (const tx of txResult.rows) {
        await recordTransaction(tx.item_id, 'return', Math.abs(tx.quantity), referenceType, referenceId, `Reversed: ${referenceType} deleted/updated`, createdBy);
    }
}
